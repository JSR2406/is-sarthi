"""Stage separation: cheap metadata first, expensive enrichment second.

Rationale: 13k catalogue rows can be swept for numbers/titles/dates/status
without opening a single PDF. Full-text enrichment (scope, normative refs,
certification) runs only for rows that need it — new hashes, seed tier, or
explicit backfill. This keeps daily delta syncs cheap.
"""
from __future__ import annotations

from typing import Any, Optional

from pipeline.db.canonical_loader import content_hash_of
from pipeline.ingestion.parsers import parse_bis_catalogue_row, parse_seed_record
from pipeline.utils.normalize import normalize_is_number, split_number_and_year


def extract_metadata(raw: dict, source_kind: str) -> dict:
    """Stage 1 (cheap): identity + lifecycle fields only.

    Returns a skeleton with canonical_key/year/status/source. Never includes
    scope, references, or certification — those belong to enrich_record().
    Raises nothing: unresolvable rows return {'_unresolvable': reason}.
    """
    parsed = parse_seed_record(raw) if source_kind == "seed" else parse_bis_catalogue_row(raw)
    raw_num = (parsed.get("is_number") or "").strip()
    canonical = normalize_is_number(raw_num)
    if not canonical:
        return {"_unresolvable": "ambiguous_number", "_raw": raw_num}
    _, year = split_number_and_year(raw_num)
    return {
        "canonical_key": canonical,
        "display_number": raw_num,
        "title": (parsed.get("title") or "").strip(),
        "year": parsed.get("year", year),
        "status": parsed.get("status", "current"),
        "division": parsed.get("division"),
        "department": parsed.get("department"),
        "department_name": parsed.get("department_name"),
        "aspect": parsed.get("aspect"),
        "published_on": parsed.get("published_on"),
        "valid_upto": parsed.get("valid_upto"),
        "source_type": source_kind,
        "source_url": parsed.get("source_url", ""),
        "confidence": float(parsed.get("extraction_quality", 0.5) or 0.5),
        "_parsed": parsed,
    }


def enrich_record(skeleton: dict, extra: Optional[dict] = None) -> dict:
    """Stage 2 (expensive): attach scope / normative refs / certification / amendments.

    `extra` is the rich payload (seed row, PDF extraction, gazette notice).
    Catalogue skeletons enriched with nothing keep scope=None — never fabricated.
    Returns the skeleton with _enriched payload merged, plus a content hash over
    the enrichment-relevant fields (drives dedupe + delta sync).
    """
    if "_unresolvable" in skeleton:
        return skeleton
    parsed = skeleton.get("_parsed", {}) or {}
    if extra:
        for field in ("scope", "normative_references", "amendments",
                      "certification", "superseded_by", "supersedes",
                      "title_hindi", "ministry", "group"):
            if extra.get(field) not in (None, [], {}, ""):
                parsed[field] = extra[field]
        if extra.get("extraction_quality"):
            try:
                skeleton["confidence"] = max(
                    skeleton.get("confidence", 0),
                    float(extra["extraction_quality"]),
                )
            except (TypeError, ValueError):
                pass
    refs = list(parsed.get("normative_references", []) or [])
    skeleton["content_hash"] = content_hash_of({
        "title": skeleton.get("title", ""),
        "scope": parsed.get("scope") or "",
        "status": skeleton.get("status", "current"),
        "refs": sorted(refs),
        "cert": parsed.get("certification") or {},
    })
    skeleton["_parsed"] = parsed
    skeleton["_references"] = refs
    return skeleton


def to_full_record(skeleton: dict) -> dict[str, Any]:
    """Flatten an enriched skeleton into the canonical_loader shape."""
    parsed = skeleton.get("_parsed", {}) or {}
    return {
        "is_number": skeleton.get("display_number", ""),
        "title": skeleton.get("title", ""),
        "title_hindi": parsed.get("title_hindi"),
        "year": skeleton.get("year"),
        "status": skeleton.get("status", "current"),
        "division": skeleton.get("division"),
        "ministry": parsed.get("ministry"),
        "department": skeleton.get("department"),
        "department_name": skeleton.get("department_name"),
        "group": parsed.get("group"),
        "aspect": skeleton.get("aspect"),
        "degree_of_equivalence": parsed.get("degree_of_equivalence"),
        "scope": parsed.get("scope"),
        "normative_references": skeleton.get("_references", []),
        "amendments": parsed.get("amendments", []),
        "certification": parsed.get("certification"),
        "superseded_by": parsed.get("superseded_by"),
        "supersedes": parsed.get("supersedes"),
        "published_on": skeleton.get("published_on"),
        "valid_upto": skeleton.get("valid_upto"),
        "source_url": skeleton.get("source_url", ""),
        "extraction_quality": skeleton.get("confidence", 0.5),
    }
