"""Parsers: raw source rows -> intermediate dicts (no DB, no side effects).

Two source shapes exist today:
- Tier-1 seed (data/seed/standards.json): rich, human-curated.
- Tier-2 BIS catalogue (data/bis/standards.json -> .standards[]): flat portal rows.

Parsers never fabricate: missing scope/refs/cert stay missing (None/[]),
so catalogue rows can never poison enriched dossiers.
"""
from __future__ import annotations

from typing import Any, Optional


def parse_amendments(raw: Any) -> list[dict]:
    """Normalize amendment data to [{number, date}]. Accepts seed shape or BIS strings."""
    if not raw:
        return []
    out: list[dict] = []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict):
                out.append({"number": str(item.get("number", "")),
                            "date": item.get("date")})
            elif isinstance(item, str):
                out.append({"number": item, "date": None})
    return [a for a in out if a["number"]]


def parse_seed_record(raw: dict) -> dict:
    """Seed rows already match the enriched shape; normalize keys defensively."""
    return {
        "is_number": raw.get("is_number", ""),
        "title": raw.get("title", ""),
        "title_hindi": raw.get("title_hindi"),
        "year": raw.get("year"),
        "status": raw.get("status", "current"),
        "division": raw.get("division"),
        "ministry": raw.get("ministry"),
        "department": raw.get("division"),
        "department_name": raw.get("department_name"),
        "group": raw.get("group"),
        "aspect": raw.get("aspect"),
        "scope": raw.get("scope"),
        "normative_references": list(raw.get("normative_references", []) or []),
        "amendments": parse_amendments(raw.get("amendments")),
        "certification": raw.get("certification"),
        "superseded_by": raw.get("superseded_by"),
        "supersedes": raw.get("supersedes"),
        "published_on": raw.get("published_on"),
        "valid_upto": raw.get("valid_upto"),
        "source_url": raw.get("source_url", ""),
        "sources": list(raw.get("sources", []) or ["seed"]),
        "extraction_quality": float(raw.get("extraction_quality", 0.9) or 0.9),
    }


def parse_bis_catalogue_row(raw: dict) -> dict:
    """Flat BIS portal row -> intermediate dict. Metadata only; no scope/refs/cert.

    Withdrawal: `withdrawn=True` or `withdraw_status=1` both mean withdrawn.
    `is_status` codes are portal-internal and intentionally NOT mapped to status
    beyond withdrawn/current — unknown codes stay 'current' rather than guessing.
    """
    withdrawn = bool(raw.get("withdrawn")) or int(raw.get("withdraw_status") or 0) == 1
    return {
        "is_number": raw.get("is_number") or raw.get("matched_standard", ""),
        "title": raw.get("title", ""),
        "title_hindi": raw.get("title_hindi"),
        "year": None,  # resolved from designation by split_number_and_year downstream
        "status": "withdrawn" if withdrawn else "current",
        "division": raw.get("department_alias"),
        "ministry": None,
        "department": raw.get("department_alias"),
        "department_name": raw.get("department_name"),
        "group": None,
        "aspect": raw.get("aspect"),
        "degree_of_equivalence": raw.get("degree_of_equivalence"),
        "scope": None,
        "normative_references": [],
        "amendments": [],
        "certification": None,
        "superseded_by": None,
        "published_on": raw.get("published_on"),
        "valid_upto": raw.get("valid_upto"),
        "source_url": raw.get("source_url") or "",
        "sources": [raw.get("source") or "BIS Know Your Standard"],
        "extraction_quality": 0.6,  # catalogue metadata confidence; never outranks seed
        "portal_ids": {"standard_id": raw.get("standard_id"),
                       "department_id": raw.get("department_id"),
                       "committee_id": raw.get("committee_id")},
    }


def split_amendment_label(label: Optional[str]) -> dict:
    """'Amdt 2 (2001)' -> {number:'2', date:'2001'}. Tolerant; garbage in -> empty."""
    if not label:
        return {"number": "", "date": None}
    import re
    match = re.search(r"(\d+)", str(label))
    year = re.search(r"(19|20)\d{2}", str(label))
    return {"number": match.group(1) if match else "",
            "date": year.group(0) if year else None}
