"""Phase 1 canonical loader helpers (pure-python, DB-optional).

Converts Tier-1 seed records and Tier-2 BIS catalogue rows into the
Phase-1 canonical shape (standards / standard_versions / standard_relations
/ sources) without touching legacy is_standards writes.

Idempotency rule: (canonical_key, content_hash) decides insert vs skip;
a weaker source never overwrites a richer one (confidence-gated merge).
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Optional

from pipeline.utils.normalize import normalize_is_number, split_number_and_year


def content_hash_of(payload: dict) -> str:
    blob = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def to_canonical_record(raw: dict, source_type: str, confidence: float = 0.0) -> Optional[dict]:
    """Return canonical standards-row dict, or None if unresolvable -> review_queue."""
    raw_num = (raw.get("is_number") or "").strip()
    if not raw_num:
        return None
    canonical = normalize_is_number(raw_num)
    if not canonical:
        return None  # caller routes to review_queue(reason='ambiguous_number')
    _, year = split_number_and_year(raw_num)
    status = raw.get("status", "current")
    if raw.get("withdrawn") is True:
        status = "withdrawn"
    tier = "enriched" if raw.get("scope") or raw.get("normative_references") else "catalogue"
    if source_type == "seed":
        tier = "enriched"
    title = (raw.get("title") or "").strip()
    if not title:
        return None  # caller routes to review_queue(reason='missing_title')
    payload = {"title": title, "scope": raw.get("scope") or "", "status": status}
    return {
        "canonical_key": canonical,
        "is_number": raw_num,
        "raw_designation": raw_num,
        "title": title,
        "title_hindi": raw.get("title_hindi"),
        "year": raw.get("year", year),
        "status": status,
        "tier": tier,
        "division": raw.get("division") or raw.get("department_alias") or raw.get("department"),
        "ministry": raw.get("ministry"),
        "department": raw.get("department_alias") or raw.get("department") or raw.get("division"),
        "department_name": raw.get("department_name"),
        "grp": raw.get("group") or raw.get("committee"),
        "aspect": raw.get("aspect"),
        "degree_of_equivalence": raw.get("degree_of_equivalence"),
        "scope": raw.get("scope"),
        "superseded_by": raw.get("superseded_by"),
        "content_hash": content_hash_of(payload),
        "extraction_confidence": confidence,
        "source_type": source_type,
        "source_url": raw.get("source_url", ""),
    }


def merge_records(stored: dict, incoming: dict) -> dict:
    """Confidence-gated merge: richer source wins, partial NULLs never clobber.

    Rule: incoming replaces a field only if it is non-empty AND
    (stored field is empty OR incoming confidence >= stored confidence).
    """
    merged = dict(stored)
    stored_conf = float(stored.get("extraction_confidence", 0) or 0)
    incoming_conf = float(incoming.get("extraction_confidence", 0) or 0)
    for field in ("title", "title_hindi", "scope", "division", "department",
                  "department_name", "aspect", "ministry", "grp"):
        new_val = incoming.get(field)
        if new_val and (not merged.get(field) or incoming_conf >= stored_conf):
            merged[field] = new_val
    # status transitions are explicit, not confidence-gated (withdrawn outranks)
    if incoming.get("status") in ("withdrawn", "superseded"):
        merged["status"] = incoming["status"]
        merged["superseded_by"] = incoming.get("superseded_by") or merged.get("superseded_by")
    if incoming_conf >= stored_conf:
        merged["extraction_confidence"] = incoming_conf
        merged["content_hash"] = incoming.get("content_hash", merged.get("content_hash"))
    return merged


def version_rows(canonical: dict, raw: dict) -> list[dict]:
    """One row per edition/amendment. Amendments list drives rows; base row always present."""
    base = {
        "canonical_key": canonical["canonical_key"],
        "year": canonical.get("year"),
        "amendment_no": "",
        "scope": canonical.get("scope"),
        "source_url": canonical.get("source_url", ""),
        "content_hash": canonical["content_hash"],
        "superseded_by": canonical.get("superseded_by"),
        "published_on": raw.get("published_on"),
        "valid_upto": raw.get("valid_upto"),
    }
    rows = [base]
    for amd in raw.get("amendments", []) or []:
        rows.append({**base, "amendment_no": str(amd.get("number", "")),
                     "amendment_date": amd.get("date")})
    return rows


def relation_rows(canonical_key: str, references: list[str], ref_types: dict[str, str] | None = None) -> list[dict]:
    """Relational normative references. Dedupes + drops self-references."""
    ref_types = ref_types or {}
    seen: list[dict] = []
    for ref in references or []:
        target = normalize_is_number(ref) or ref
        if target == canonical_key or any(r["target_key"] == target for r in seen):
            continue
        seen.append({"source_key": canonical_key, "target_key": target,
                     "ref_type": ref_types.get(target, "related_product"), "hop": 1})
    return seen


def batch_partition(items: list[Any], size: int = 500) -> list[list[Any]]:
    return [items[i:i + size] for i in range(0, len(items), size)]
