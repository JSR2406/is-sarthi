"""Manak-style staged recommendation engine (additive).

Eight explicit stages over the unified corpus — the same retrieval math as
HybridCorpus, but with exact-identifier short-circuit, department pre-filter,
per-record match-kind labels, a stage trace for auditability, and honest
abstention. Response shape mirrors HybridCorpus.recommend() so every existing
consumer keeps working; two additive fields appear per recommendation
(match_kind) and per response (stages).

Never invents: every served is_number resolves in the adapter, and low
confidence abstains instead of guessing.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

MIN_CONFIDENCE = 0.25
POOL_MULTIPLIER = 4


def _match_kind(entry: dict) -> str:
    if entry.get("dense_rank") and entry.get("sparse_rank"):
        return "hybrid"
    if entry.get("dense_rank"):
        return "semantic"
    if entry.get("sparse_rank"):
        return "keyword"
    return "unranked"


def _match_sentence(kind: str, entry: dict) -> str:
    if kind == "exact":
        return "Exact IS-number match against the unified catalogue."
    dense, sparse = entry.get("dense_rank"), entry.get("sparse_rank")
    if kind == "hybrid":
        return (f"Keyword and semantic retrieval agree "
                f"(keyword #{sparse} · semantic #{dense}).")
    if kind == "semantic":
        return f"Semantic match (semantic #{dense}); no exact keyword hit."
    if kind == "keyword":
        return f"Keyword match (keyword #{sparse}); semantic similarity is weak."
    return "Ranked by overall corpus relevance."


def _version_label(record: dict) -> str:
    year = record.get("year")
    version = f"{record['is_number']}:{year}" if year else record["is_number"]
    amendments = record.get("amendments") or []
    if amendments:
        version += f" (Amdt {amendments[-1]['number']}, {amendments[-1].get('date', '')})"
    return version


def recommend(corpus, query: str, top_k: int = 5,
              division: Optional[str] = None) -> dict:
    """Run the staged pipeline. `corpus` is a fitted HybridCorpus."""
    stages: dict[str, Any] = {"exact_hit": False, "pool": 0, "kept": 0,
                              "division": division or "All Divisions"}

    # Stage 1 — exact identifier lookup (short-circuit, highest trust).
    exact = corpus.adapter.get_by_number((query or "").strip())
    if exact:
        stages["exact_hit"] = True
        record = exact
        tier = record.get("tier", "catalogue")
        rec = _assemble(corpus, record, query, confidence=0.95, band="High",
                        match_kind="exact", dense_rank=None, sparse_rank=None)
        stages["kept"] = 1
        return {"query": query, "state": "ok", "recommendations": [rec],
                "stages": stages}

    # Stages 2+3 — hybrid retrieval (dense semantic + sparse keyword, RRF fused).
    pool_k = max(top_k * POOL_MULTIPLIER, 20)
    ranked = corpus.retrieve(query, top_k=pool_k)
    stages["pool"] = len(ranked)

    # Stage 4 — category/department pre-filter (before cut, not after).
    if division and division not in ("All Divisions", "All"):
        ranked = [e for e in ranked
                  if (corpus.by_number.get(e["is_number"], {}).get("department")
                      == division
                      or corpus.by_number.get(e["is_number"], {}).get("division")
                      == division)]
    ranked = ranked[:top_k]

    # Stage 7 — confidence gating with honest abstention.
    if not ranked or ranked[0]["confidence"] < MIN_CONFIDENCE:
        return {
            "query": query,
            "state": "low_confidence",
            "message": "No confident match. Add material, rating or application detail.",
            "recommendations": [],
            "stages": {**stages, "kept": 0},
        }

    # Stages 5+6+8 — graph expansion, relevance blend, grounded explanation.
    recommendations = []
    for entry in ranked:
        record = corpus.by_number[entry["is_number"]]
        kind = _match_kind(entry)
        recommendations.append(_assemble(
            corpus, record, query, confidence=entry["confidence"],
            band=("High" if entry["confidence"] >= 0.75
                  else "Medium" if entry["confidence"] >= 0.50 else "Low"),
            match_kind=kind, dense_rank=entry["dense_rank"],
            sparse_rank=entry["sparse_rank"], match_sentence=_match_sentence(kind, entry),
        ))
    stages["kept"] = len(recommendations)
    return {"query": query, "state": "ok",
            "recommendations": recommendations, "stages": stages}


def _assemble(corpus, record: dict, query: str, confidence: float, band: str,
              match_kind: str, dense_rank: Optional[int], sparse_rank: Optional[int],
              match_sentence: Optional[str] = None) -> dict:
    tier = record.get("tier", "catalogue")
    justification = corpus.justify(query, record)
    if match_sentence:
        justification = f"{match_sentence} {justification}"
    return {
        "is_number": record["is_number"],
        "canonical_key": record.get("canonical_key", record["is_number"]),
        "title": record.get("title"),
        "title_hindi": record.get("title_hindi"),
        "tier": tier,
        "is_enriched": tier == "enriched",
        "status": record.get("status", "current"),
        "department": record.get("department"),
        "department_name": record.get("department_name"),
        "aspect": record.get("aspect"),
        "published_on": record.get("published_on"),
        "valid_upto": record.get("valid_upto"),
        "superseded_by": record.get("superseded_by"),
        "latest_version": _version_label(record),
        "confidence": confidence,
        "band": band,
        "match_kind": match_kind,
        "justification": justification,
        "certification": record.get("certification"),
        "amendments": record.get("amendments") or [],
        "allied": corpus.allied(record["is_number"], query) if tier == "enriched" else {},
        "signals": {"dense_rank": dense_rank, "sparse_rank": sparse_rank},
    }
