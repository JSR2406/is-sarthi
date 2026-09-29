"""Batch loader: dedupe -> version/relation resolve -> load -> audit -> metrics.

Hard rules enforced here, not by convention:
1. Malformed rows -> review_queue, never silently dropped.
2. Weaker source never overwrites richer (confidence-gated merge in store).
3. No row ingests without source traceability (sources row per insert/update).
4. One bad row never aborts the batch (per-record try/except + error cap).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from pipeline.db.canonical_loader import (
    batch_partition,
    relation_rows,
    to_canonical_record,
    version_rows,
)
from pipeline.ingestion.stages import enrich_record, extract_metadata, to_full_record

logger = logging.getLogger(__name__)

LOW_CONFIDENCE_THRESHOLD = 0.35
ERROR_SAMPLE_CAP = 20


@dataclass
class LoadMetrics:
    mode: str = "backfill"
    source: str = "unknown"
    attempted: int = 0
    inserted: int = 0
    updated: int = 0
    skipped_unchanged: int = 0
    failed: int = 0
    queued_review: int = 0
    low_confidence_rows: int = 0
    errors: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "mode": self.mode, "source": self.source, "attempted": self.attempted,
            "inserted": self.inserted, "updated": self.updated,
            "skipped_unchanged": self.skipped_unchanged, "failed": self.failed,
            "queued_review": self.queued_review,
            "low_confidence_rows": self.low_confidence_rows,
            "errors": self.errors[:ERROR_SAMPLE_CAP],
            "healthy": self.failed == 0,
        }


class BatchLoader:
    def __init__(self, store, source_kind: str, mode: str = "backfill",
                 batch_size: int = 500, confidence_floor: float = LOW_CONFIDENCE_THRESHOLD):
        self.store = store
        self.source_kind = source_kind
        self.mode = mode
        self.batch_size = batch_size
        self.confidence_floor = confidence_floor

    def load(self, raw_rows: list[dict], enrichments: Optional[dict[str, dict]] = None,
             changes_only: Optional[dict[str, str]] = None) -> LoadMetrics:
        """Load raw rows. `changes_only` maps key->hash for delta sync pre-filter."""
        metrics = LoadMetrics(mode=self.mode, source=self.source_kind)
        enrichments = enrichments or {}
        for batch in batch_partition(raw_rows, self.batch_size):
            for raw in batch:
                metrics.attempted += 1
                try:
                    self._load_one(raw, enrichments, changes_only, metrics)
                except Exception as exc:  # isolate, never abort batch
                    metrics.failed += 1
                    if len(metrics.errors) < ERROR_SAMPLE_CAP:
                        label = raw.get("is_number", "") if isinstance(raw, dict) else type(raw).__name__
                        metrics.errors.append({
                            "is_number": str(label)[:40],
                            "error": str(exc)[:200],
                        })
                    logger.warning("Row failed in isolation: %s", exc)
        self.store.record_run(metrics.as_dict())
        return metrics

    def _load_one(self, raw: dict, enrichments: dict, changes_only: Optional[dict],
                  metrics: LoadMetrics) -> None:
        skeleton = extract_metadata(raw, self.source_kind)
        if "_unresolvable" in skeleton:
            self.store.enqueue_review(None, {"raw": raw},
                                      skeleton["_unresolvable"], 0.0)
            metrics.queued_review += 1
            return
        if not skeleton.get("title"):
            self.store.enqueue_review(skeleton["canonical_key"], {"raw": raw},
                                      "missing_title", skeleton.get("confidence", 0))
            metrics.queued_review += 1
            return

        key = skeleton["canonical_key"]
        skeleton = enrich_record(skeleton, enrichments.get(key))

        full = to_full_record(skeleton)
        canonical = to_canonical_record(full, self.source_kind, skeleton.get("confidence", 0.5))
        if canonical is None:  # defensive: to_canonical_record is stricter than stages
            self.store.enqueue_review(key, {"raw": raw}, "normalization_failed",
                                      skeleton.get("confidence", 0))
            metrics.queued_review += 1
            return

        if changes_only is not None and changes_only.get(key) == canonical["content_hash"]:
            metrics.skipped_unchanged += 1
            return

        confidence = float(canonical.get("extraction_confidence", 0) or 0)
        if confidence < self.confidence_floor:
            metrics.low_confidence_rows += 1
            self.store.enqueue_review(key, {"raw": raw, "canonical": canonical},
                                      "low_confidence", confidence)
            metrics.queued_review += 1
            return  # low-confidence rows wait for human review; never auto-ingest

        # Source traceability: source_type is mandatory; URL may be empty (portal omits it).
        old = self.store.get_record(key)
        outcome = self.store.upsert_standard(canonical)
        if outcome == "inserted":
            metrics.inserted += 1
            change = "insert"
        elif outcome == "updated":
            metrics.updated += 1
            change = self._classify_change(old, canonical)
        else:
            metrics.skipped_unchanged += 1
            return

        self.store.add_versions(version_rows(canonical, full))
        self.store.replace_relations(
            key, relation_rows(key, full.get("normative_references", [])))
        self.store.add_source(key, self.source_kind, canonical.get("source_url", ""),
                              confidence, canonical.get("content_hash", ""))
        self.store.write_audit(key, change, {"status": (old or {}).get("status")},
                               {"status": canonical.get("status")})

    @staticmethod
    def _classify_change(old: Optional[dict], new: dict) -> str:
        old_status, new_status = (old or {}).get("status"), new.get("status")
        if new_status in ("withdrawn", "superseded") and old_status != new_status:
            return "withdrawn"
        if (old or {}).get("scope") != new.get("scope"):
            return "scope"
        return "metadata"
