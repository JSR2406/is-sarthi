"""Review-queue workflow: uncertain rows wait for humans, batches never block.

Lifecycle: pending -> approved (re-ingested with confidence boost) | rejected.
Approval re-runs the single row through BatchLoader with the reviewer as actor,
so the audit trail shows who cleared it.
"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def list_pending(store, limit: int = 100) -> list[dict]:
    items = store.list_reviews("pending")
    return items[:limit]


def approve(store, review_id: str, reviewer: str = "reviewer",
            confidence_boost: float = 0.9) -> dict:
    """Approve a queued row: re-ingest its raw payload as trusted seed-grade input."""
    from pipeline.ingestion.loader import BatchLoader

    item = store.resolve_review(review_id, "approved")
    if not item:
        raise KeyError(f"review {review_id} not found")
    raw = (item.get("raw") or {}).get("raw", item.get("raw"))
    if isinstance(raw, dict) and "raw" in raw and isinstance(raw["raw"], dict):
        raw = raw["raw"]
    loader = BatchLoader(store, source_kind="reviewed", mode="review",
                         confidence_floor=0.0)
    # Boost: a human looked at it, so it clears the low-confidence gate.
    if isinstance(raw, dict):
        raw = {**raw, "extraction_quality": max(
            float(raw.get("extraction_quality", 0) or 0), confidence_boost)}
        metrics = loader.load([raw])
    else:
        metrics = None
    store.write_audit(item.get("canonical_key") or review_id, "review_approved",
                      {"by": reviewer}, {"metrics": metrics.as_dict() if metrics else None})
    logger.info("Review %s approved by %s", review_id, reviewer)
    return {"review": item, "metrics": metrics.as_dict() if metrics else None}


def reject(store, review_id: str, reviewer: str = "reviewer", note: str = "") -> dict:
    item = store.resolve_review(review_id, "rejected")
    if not item:
        raise KeyError(f"review {review_id} not found")
    store.write_audit(item.get("canonical_key") or review_id, "review_rejected",
                      {"by": reviewer}, {"note": note})
    logger.info("Review %s rejected by %s: %s", review_id, reviewer, note)
    return {"review": item}


def summary(store) -> dict:
    return {
        "pending": len(store.list_reviews("pending")),
        "approved": len(store.list_reviews("approved")),
        "rejected": len(store.list_reviews("rejected")),
    }
