"""
Vercel Serverless FastAPI API for IS Sarthi.
Exposes recommendations, specification validation, dependency graph, catalog analytics,
and multilingual speech services.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from scripts.demo_offline import OfflineCorpus
from pipeline.utils.normalize import extract_all_is_references, normalize_is_number, split_number_and_year
from pipeline.classify import ROLE_LABELS
from pipeline.scrapers.doc_extractor import extract_document_text
from pipeline.scrapers.pdf_extractor import extract_text_from_pdf
from pipeline.utils.multilingual import normalize_query_for_retrieval
from pipeline.procurement.service import ProcurementService
from ui import speech_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("is_sarthi_api")

app = FastAPI(
    title="IS Sarthi API",
    description="Indian Standards Recommendation, Compliance & Allied Graph API",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Corpus
def _load_corpus() -> OfflineCorpus:
    seed_paths = [
        BASE_DIR / "data" / "seed" / "standards.json",
        Path("data/seed/standards.json"),
        Path(__file__).resolve().parent / "data" / "standards.json",
    ]
    for p in seed_paths:
        if p.exists():
            with open(p, encoding="utf-8") as f:
                records = json.load(f)
            logger.info("Loaded %d standards from %s", len(records), p)
            return OfflineCorpus(records)
    raise FileNotFoundError("Could not locate standards.json in data/seed/")

from pipeline.db.unified_corpus import HybridCorpus

corpus = _load_corpus()
procurement_service = ProcurementService(corpus)

_hybrid_corpus: Optional[HybridCorpus] = None

def get_hybrid_corpus() -> HybridCorpus:
    global _hybrid_corpus
    if _hybrid_corpus is None:
        logger.info("Initializing HybridCorpus from seed and BIS catalogue...")
        _hybrid_corpus = HybridCorpus.from_files()
    return _hybrid_corpus


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def generate_tender_clause(rec: dict) -> str:
    """
    Generate legally compliant, enforceable tender specification clause.
    Incorporates distinct certification scheme requirements (ISI/QCO, CRS, Hallmarking)
    and allied standards categorized across the role taxonomy (Test method, Safety,
    Installation, Related product, Terminology).
    """
    is_num = rec.get("is_number", "IS XXXX")
    latest = rec.get("latest_version") or is_num
    title = rec.get("title", "")
    cert = rec.get("certification") or {}

    clause_idx = 1
    clause = [
        f"{clause_idx}. Standard Conformity: The supplied materials/equipment shall strictly conform to {latest} "
        f"('{title}'), including all up-to-date amendments issued by the Bureau of Indian Standards (BIS)."
    ]

    # Granular Certification Scheme Handling
    if cert.get("mandatory") or cert.get("scheme"):
        scheme = str(cert.get("scheme") or "ISI").strip().upper()
        product = cert.get("product") or "this item"
        clause_idx += 1

        if scheme == "CRS":
            clause.append(
                f"{clause_idx}. Mandatory Compulsory Registration (CRS): The product ('{product}') must be registered "
                f"under the BIS Compulsory Registration Scheme (CRS) pursuant to Scheme-II of BIS (Conformity Assessment) "
                f"Regulations, 2018. Bidders must furnish a valid BIS Registration number (R-number) and affix the standard "
                f"words 'Self Declaration - Conforming to {is_num}' on packaging. Unregistered products shall be summarily rejected."
            )
        elif scheme == "HALLMARKING":
            clause.append(
                f"{clause_idx}. Mandatory BIS Hallmarking: All articles ('{product}') must bear mandatory BIS Hallmarking "
                f"with a 6-digit alphanumeric Hallmarking Unique Identification (HUID) and fineness grade in accordance with "
                f"the Bureau of Indian Standards (Hallmarking) Regulations. Bids offering non-hallmarked articles shall be rejected."
            )
        else:  # Standard ISI / QCO
            scheme_label = cert.get("scheme_label") or "BIS Product Certification (ISI mark)"
            clause.append(
                f"{clause_idx}. Mandatory Certification ({scheme_label}): The product must bear the valid Standard ISI Mark "
                f"under Scheme-I of BIS (Conformity Assessment) Regulations, 2018, as mandated by the applicable Gazette "
                f"Quality Control Order (QCO). Bidders must hold an active CM/L BIS license on bid submission date. "
                f"Uncertified bids shall be summarily rejected."
            )

    # Allied Standards by Taxonomy Role
    allied = rec.get("allied") or rec.get("allied_standards", {}).get("by_role", {})
    if allied:
        # 1. Test methods
        test_methods = [
            item["is_number"]
            for item in allied.get("Test method", allied.get("test_method", []))
        ]
        if test_methods:
            clause_idx += 1
            clause.append(
                f"{clause_idx}. Acceptance & Routine Testing: Acceptance testing, lot sampling, and routine quality verification "
                f"at vendor premises shall strictly comply with test procedures prescribed in {', '.join(test_methods[:4])}."
            )

        # 2. Safety
        safety = [
            item["is_number"]
            for item in allied.get("Safety", allied.get("safety", []))
        ]
        if safety:
            clause_idx += 1
            clause.append(
                f"{clause_idx}. Operational Safety & Environmental Protection: Equipment design, insulation barriers, and operational "
                f"safety mechanisms shall strictly adhere to {', '.join(safety[:3])}."
            )

        # 3. Installation & Erection
        installation = [
            item["is_number"]
            for item in allied.get("Installation", allied.get("installation", []))
        ]
        if installation:
            clause_idx += 1
            clause.append(
                f"{clause_idx}. Installation & Code of Practice: Field erection, mounting, laying, earthing, and commissioning "
                f"practices shall strictly follow {', '.join(installation[:3])}."
            )

        # 4. Related Products & Raw Materials
        related_products = [
            item["is_number"]
            for item in allied.get("Related product", allied.get("related_product", []))
        ]
        if related_products:
            clause_idx += 1
            clause.append(
                f"{clause_idx}. Normative Raw Materials & Feedstocks: Sub-components, conductors, and raw materials used in manufacture "
                f"shall conform to {', '.join(related_products[:3])}."
            )

        # 5. Terminology & Definitions
        terminology = [
            item["is_number"]
            for item in allied.get("Terminology", allied.get("terminology", []))
        ]
        if terminology:
            clause_idx += 1
            clause.append(
                f"{clause_idx}. Terminology & Standards Nomenclature: Technical definitions, ratings, and engineering nomenclature "
                f"shall be interpreted in accordance with {', '.join(terminology[:3])}."
            )

    return "\n\n".join(clause)


# -----------------------------------------------------------------------------
# Schemas
# -----------------------------------------------------------------------------
class RecommendRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=8000)
    top_k: int = Field(5, ge=1, le=15)
    division: Optional[str] = None


class ValidateRequest(BaseModel):
    spec_text: str = Field(..., min_length=3, max_length=100000)


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=3000)
    language_code: str = Field("hi-IN", pattern="^(en-IN|hi-IN|mr-IN|te-IN|ta-IN)$")


class FeedbackRequest(BaseModel):
    is_number: str
    verdict: str = Field(..., pattern="^(relevant|irrelevant)$")
    query: Optional[str] = None


class AssistantChatTurn(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=4000)


class AssistantChatRequest(BaseModel):
    message: str = Field(..., min_length=2, max_length=2000)
    history: List[Dict[str, str]] = Field(default_factory=list)
    top_k: int = Field(5, ge=1, le=10)


class SummarizeRequest(BaseModel):
    is_number: str = Field(..., min_length=3, max_length=60)
    query: Optional[str] = Field(None, max_length=2000)


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------
@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "standards_indexed": len(corpus.records),
        "voice_enabled": speech_service.is_voice_enabled(),
    }


@app.get("/api/standards")
def get_standards(
    division: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    qco: bool = False,
    sort: str = "is_number",
    limit: Optional[int] = None,
    offset: int = 0,
):
    """Unified catalogue: Tier-1 enriched dossiers + Tier-2 national catalogue.

    Shape is backward compatible ({total, standards}) — rows gained tier fields.
    No limit = full filtered set (legacy callers); pass limit/offset to paginate.
    """
    hc = get_hybrid_corpus()
    records = hc.adapter.records
    if division and division != "All":
        records = [r for r in records
                   if (r.get("division") or r.get("department")) == division]
    if status and status != "All":
        records = [r for r in records if r.get("status") == status]
    if qco:
        records = [r for r in records if (r.get("certification") or {}).get("mandatory")]
    if search and search.strip():
        kw = search.strip().lower()
        records = [
            r for r in records
            if kw in r["is_number"].lower()
            or kw in (r.get("title") or "").lower()
            or kw in (r.get("department_name") or "").lower()
            or kw in (r.get("aspect") or "").lower()
        ]

    total = len(records)
    sort_key = {"title": "title", "division": "division", "status": "status"}.get(sort, "is_number")
    records = sorted(records, key=lambda r: str(r.get(sort_key) or ""))

    page = records[offset:(offset + limit) if limit else None]
    summary = [
        {
            "is_number": r["is_number"],
            "title": r.get("title", ""),
            "division": r.get("division") or r.get("department") or "Unknown",
            "department_name": r.get("department_name"),
            "aspect": r.get("aspect"),
            "year": r.get("year"),
            "status": r.get("status", "current"),
            "mandatory_qco": bool((r.get("certification") or {}).get("mandatory")),
            "certification": r.get("certification"),
            "tier": r.get("tier", "catalogue"),
            "is_enriched": r.get("tier") == "enriched",
        }
        for r in page
    ]
    return {"total": total, "limit": limit, "offset": offset, "standards": summary}


@app.get("/api/divisions")
def list_divisions():
    """Category-wise corpus rollup for browse facets, analytics, governance, and dashboard."""
    hc = get_hybrid_corpus()
    agg: Dict[str, Dict[str, Any]] = {}
    aspects: Dict[str, int] = {}
    statuses: Dict[str, int] = {}
    dept_agg: Dict[str, Dict[str, Any]] = {}
    for r in hc.adapter.records:
        div = r.get("division") or r.get("department") or "Unknown"
        entry = agg.setdefault(div, {"division": div, "total": 0, "current": 0,
                                     "enriched": 0, "qco": 0, "outdated": 0})
        entry["total"] += 1
        status = r.get("status") or "unknown"
        statuses[status] = statuses.get(status, 0) + 1
        aspect = (r.get("aspect") or "").strip() or "unknown"
        aspects[aspect] = aspects.get(aspect, 0) + 1
        if status == "current":
            entry["current"] += 1
        if status in ("withdrawn", "superseded"):
            entry["outdated"] += 1
        if r.get("tier") == "enriched":
            entry["enriched"] += 1
        if (r.get("certification") or {}).get("mandatory"):
            entry["qco"] += 1
        dept_name = (r.get("department_name") or "").strip()
        if dept_name:
            dept = dept_agg.setdefault(dept_name, {"name": dept_name, "total": 0,
                                                   "aliases": Counter()})
            dept["total"] += 1
            if div != "Unknown":
                dept["aliases"][div] += 1
    divisions = sorted(agg.values(), key=lambda e: -e["total"])
    aspect_list = sorted(
        ({"aspect": name, "total": count} for name, count in aspects.items()),
        key=lambda e: -e["total"],
    )
    dept_rows = sorted(
        ({"name": d["name"], "total": d["total"],
          "alias": d["aliases"].most_common(1)[0][0] if d["aliases"] else None}
         for d in dept_agg.values()),
        key=lambda e: -e["total"],
    )
    return {
        "total": sum(e["total"] for e in divisions),
        "divisions": divisions,
        "aspects": aspect_list,
        "statuses": statuses,
        "departments": dept_rows,
    }


def resolve_standard_detail(is_number: str) -> dict:
    canonical = normalize_is_number(is_number) or is_number
    # 1. Tier 1 seed records first
    record = corpus.by_number.get(is_number) or corpus.by_number.get(canonical)
    if not record:
        split_num, _ = split_number_and_year(is_number)
        if split_num:
            record = corpus.by_number.get(split_num)
    if record:
        enriched = dict(record)
        enriched["tender_clause"] = generate_tender_clause(record)
        enriched["allied_by_role"] = corpus.allied(canonical, query=record.get("title", ""))
        enriched["tier"] = "enriched"
        enriched["is_enriched"] = True
        return enriched

    # 2. Check Unified Corpus (Tier 2 Catalogue)
    hc = get_hybrid_corpus()
    record = hc.adapter.get_by_number(is_number) or hc.adapter.get_by_number(canonical)
    if not record:
        split_num, _ = split_number_and_year(is_number)
        if split_num:
            record = hc.adapter.get_by_number(split_num)
    if not record:
        raise HTTPException(status_code=404, detail=f"Standard '{is_number}' not found.")

    enriched = dict(record)
    enriched["tender_clause"] = generate_tender_clause(record)
    enriched["allied_by_role"] = {}
    return enriched


def _fallback_graph(hc, record: dict, target_num: str,
                    need: int = 6) -> tuple[list, list]:
    """Honest fallback edges when no normative references are mapped.

    Two grounded sources only, each labeled so the UI can never mistake them
    for normative citations:
    - cited_by: Tier-1 standards whose reference lists include the target.
    - similar: same-division catalogue siblings ranked by aspect + title overlap.
    """
    import re as _re

    nodes: list[dict] = []
    edges: list[dict] = []
    seen = {target_num}

    def _node(num: str, rec: dict) -> dict:
        return {
            "id": num,
            "label": num,
            "title": rec.get("title", ""),
            "status": rec.get("status", "current"),
            "division": rec.get("division") or rec.get("department") or "BIS",
            "tier": rec.get("tier", "catalogue"),
            "is_target": False,
        }

    # 1. Reverse normative edges: who cites the target.
    graph = getattr(hc, "graph", {}) or {}
    for src, refs in graph.items():
        for ref in refs or []:
            target = ref.get("is_number", "")
            if target == target_num or (
                target and normalize_is_number(target) == normalize_is_number(target_num)
            ):
                rec = hc.adapter.get_by_number(src) or {}
                nodes.append(_node(src, rec))
                edges.append({
                    "source": src,
                    "target": target_num,
                    "role": "Cited by",
                    "kind": "cited_by",
                })
                seen.add(src)
                break
        if len(edges) >= need:
            break

    # 2. Catalogue similarity fill (never labeled normative).
    if len(edges) < need:
        div = record.get("division") or record.get("department")
        aspect = (record.get("aspect") or "").strip().lower()
        title_tokens = set(_re.findall(r"[a-z]{4,}", (record.get("title") or "").lower()))
        scored: list[tuple] = []
        for r in hc.adapter.records:
            num = r.get("is_number")
            if not num or num in seen:
                continue
            if div and (r.get("division") or r.get("department")) != div:
                continue
            overlap = len(title_tokens & set(_re.findall(r"[a-z]{4,}", (r.get("title") or "").lower())))
            bonus = 3 if aspect and (r.get("aspect") or "").strip().lower() == aspect else 0
            scored.append((bonus + overlap, num))
        scored.sort(reverse=True)
        for _, num in scored[: max(need - len(edges), 0)]:
            rec = hc.adapter.get_by_number(num) or {}
            nodes.append(_node(num, rec))
            edges.append({
                "source": target_num,
                "target": num,
                "role": "Similar record",
                "kind": "similar",
            })
            seen.add(num)
    return nodes, edges


def resolve_standard_graph(is_number: str, depth: int = 1) -> dict:
    canonical = normalize_is_number(is_number) or is_number
    record = corpus.by_number.get(is_number) or corpus.by_number.get(canonical)
    if not record:
        split_num, _ = split_number_and_year(is_number)
        if split_num:
            record = corpus.by_number.get(split_num)
    if not record:
        # Check Tier 2
        hc = get_hybrid_corpus()
        record = hc.adapter.get_by_number(is_number) or hc.adapter.get_by_number(canonical)
        if not record:
            split_num, _ = split_number_and_year(is_number)
            if split_num:
                record = hc.adapter.get_by_number(split_num)
        if not record:
            raise HTTPException(status_code=404, detail=f"Standard '{is_number}' not found.")

        target_num = record.get("is_number", canonical)
        # Catalogue record: no mapped normative refs — generate honest fallbacks
        # (cited-by + labeled similarity) instead of a lonely node.
        hc = get_hybrid_corpus()
        extra_nodes, extra_edges = _fallback_graph(hc, record, target_num)
        return {
            "target": target_num,
            "nodes": [
                {
                    "id": target_num,
                    "label": target_num,
                    "title": record.get("title", ""),
                    "status": record.get("status", "current"),
                    "division": record.get("division") or record.get("department") or "BIS",
                    "tier": record.get("tier", "catalogue"),
                    "is_target": True,
                }
            ] + extra_nodes,
            "edges": extra_edges,
        }

    nodes = []
    edges = []
    visited = {canonical}

    nodes.append({
        "id": canonical,
        "label": canonical,
        "title": record.get("title", ""),
        "status": record.get("status", "current"),
        "division": record.get("division", "ETD"),
        "tier": "enriched",
        "is_target": True,
    })

    frontier = [(canonical, 0)]
    while frontier:
        current, hop = frontier.pop(0)
        if hop >= depth:
            continue

        for ref in corpus.graph.get(current, []):
            child = ref["is_number"]
            role = ROLE_LABELS.get(ref.get("ref_type"), "Related product")
            edges.append({
                "source": current,
                "target": child,
                "role": role,
                "kind": "normative",
            })

            if child not in visited:
                child_rec = corpus.by_number.get(child, {})
                nodes.append({
                    "id": child,
                    "label": child,
                    "title": child_rec.get("title") or ref.get("title", ""),
                    "status": child_rec.get("status", "current"),
                    "division": child_rec.get("division", "ETD"),
                    "tier": "enriched",
                    "is_target": False,
                })
                visited.add(child)
                frontier.append((child, hop + 1))

    if not edges:
        # Enriched record with no mapped refs — same honest fallback.
        hc = get_hybrid_corpus()
        adapter_rec = hc.adapter.get_by_number(canonical) or record
        extra_nodes, extra_edges = _fallback_graph(hc, adapter_rec, canonical)
        nodes += extra_nodes
        edges += extra_edges

    return {"target": canonical, "nodes": nodes, "edges": edges}


@app.get("/api/standards/detail")
def get_standard_detail_query(is_number: str = Query(...)):
    return resolve_standard_detail(is_number)


@app.get("/api/standards/graph")
def get_standard_graph_query(is_number: str = Query(...), depth: int = 1):
    return resolve_standard_graph(is_number, depth=depth)


@app.get("/api/standards/{is_number:path}/graph")
def get_standard_graph(is_number: str, depth: int = 1):
    return resolve_standard_graph(is_number, depth=depth)


def build_extractive_summary(record: dict, query: Optional[str] = None,
                              max_sentences: int = 3) -> dict:
    """Grounded summary: quoted scope sentences + factual dossier lines.

    Pure function, no LLM. Every summary sentence is a verbatim substring of
    the record's scope; when there is no scope (Tier-2 catalogue rows) it says
    so instead of inventing one. Testable without a server.
    """
    import re

    is_number = record.get("is_number", "")
    scope = (record.get("scope") or "").strip()
    if not scope:
        return {
            "is_number": is_number,
            "summary": [],
            "facts": _summary_facts(record),
            "notice": ("Catalogue record: BIS has not published scope text for this tier, "
                       "so there is nothing to summarize. See the dossier for verified metadata."),
        }

    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", scope) if len(s.strip()) > 20]
    query_terms = set(re.findall(r"[a-z]{4,}", (query or "").lower()))
    scored = []
    for order, sent in enumerate(sentences):
        lowered = sent.lower()
        overlap = sum(1 for t in query_terms if t in lowered)
        scored.append((overlap, -len(sent), -order, sent))
    scored.sort(reverse=True)
    picks = [sent for _, _, _, sent in scored[:max_sentences]]
    # Preserve document order so the summary reads naturally.
    picks.sort(key=lambda s: sentences.index(s))
    return {"is_number": is_number, "summary": picks,
            "facts": _summary_facts(record), "notice": None}


def _summary_facts(record: dict) -> list[str]:
    """One-line verifiable facts drawn only from stored fields."""
    facts = [f"Status: {record.get('status', 'current')}."]
    year = record.get("year")
    if year:
        facts.append(f"Edition year on record: {year}.")
    amendments = record.get("amendments") or []
    if amendments:
        facts.append(f"{len(amendments)} amendment(s); latest: Amdt {amendments[-1].get('number')}.")
    cert = record.get("certification") or {}
    if cert.get("scheme"):
        facts.append(f"Certification: {cert.get('scheme_label') or cert.get('scheme')}"
                     f"{' (mandatory)' if cert.get('mandatory') else ''}.")
    allied = record.get("allied") or {}
    total_allied = sum(len(v) for v in allied.values()) if isinstance(allied, dict) else 0
    if total_allied:
        facts.append(f"Cites {total_allied} allied standard(s) across {len(allied)} role(s).")
    return facts


@app.post("/api/summarize")
def summarize_standard(req: SummarizeRequest):
    """Extractive, fully grounded summary for one standard."""
    hc = get_hybrid_corpus()
    canonical = normalize_is_number(req.is_number.strip()) or req.is_number.strip()
    record = hc.adapter.get_by_number(req.is_number.strip()) or hc.adapter.get_by_number(canonical)
    if not record:
        raise HTTPException(status_code=404, detail=f"Standard '{req.is_number}' not found.")
    query = (req.query or "").strip() or None
    return build_extractive_summary(record, query=query)


@app.get("/api/standards/graph/reverse")
def reverse_references(is_number: str = Query(...), limit: int = 20):
    """Impact analysis: which standards cite this one (would be affected by a change)."""
    from pipeline.classify import ROLE_LABELS as _LABELS

    hc = get_hybrid_corpus()
    canonical = normalize_is_number(is_number.strip()) or is_number.strip()
    citers: list[dict] = []
    graph = getattr(hc, "graph", {}) or {}
    for src, refs in graph.items():
        for ref in refs or []:
            target = ref.get("is_number", "")
            if (target == canonical or normalize_is_number(target) == canonical):
                rec = hc.adapter.get_by_number(src) or {}
                citers.append({
                    "is_number": src,
                    "title": rec.get("title") or ref.get("title", ""),
                    "role": _LABELS.get(ref.get("ref_type"), "Related product"),
                    "status": rec.get("status", "current"),
                })
                break
        if len(citers) >= limit:
            break
    return {"is_number": canonical, "cited_by_count": len(citers), "cited_by": citers}


@app.get("/api/standards/{is_number:path}")
def get_standard_detail(is_number: str):
    return resolve_standard_detail(is_number)


@app.post("/api/recommend")
def recommend_standards(req: RecommendRequest):
    # Multilingual query normalization (Hindi, Marathi, Telugu, Tamil, English)
    normalized_q, detected_lang, orig_q = normalize_query_for_retrieval(req.query.strip())

    hc = get_hybrid_corpus()
    # Staged Manak-style engine: exact lookup, hybrid retrieval, department
    # filter, graph expansion, confidence gating, grounded explanation.
    # Shape mirrors HybridCorpus.recommend(); adds match_kind + stages trace.
    import time as _time

    from pipeline.engine import recommend as engine_recommend

    _started = _time.perf_counter()
    result = engine_recommend(hc, normalized_q, top_k=req.top_k,
                              division=req.division)
    _elapsed_ms = int((_time.perf_counter() - _started) * 1000)
    recs = result.get("recommendations", [])

    # Add pre-computed tender clauses to each recommendation
    for r in recs:
        if not r.get("tender_clause"):
            r["tender_clause"] = generate_tender_clause(r)

    # Preserve original user query for UI display while exposing normalized retrieval representation
    result["query"] = orig_q
    result["normalized_query"] = normalized_q
    result["detected_language"] = detected_lang

    # Audit trail (guarded no-op without Postgres)
    log_recommendation_run(orig_q, result, ms=_elapsed_ms)

    return result


@app.post("/api/validate")
def validate_specification(req: ValidateRequest):
    hc = get_hybrid_corpus()
    result = hc.validate(req.spec_text.strip())
    result["completeness"] = completeness_score(result)
    return result


def log_recommendation_run(query: str, result: dict, ms: int = 0) -> bool:
    """Audit trail for served recommendations. Silent no-op without Postgres."""
    try:
        from pipeline.db.stores import postgres

        recs = result.get("recommendations", [])
        top_conf = recs[0].get("confidence") if recs else None
        with postgres.cursor() as cur:
            if cur is None:
                return False
            import json as _json

            cur.execute(
                """INSERT INTO recommendation_log
                   (query_text, recommended, confidence_top, corpus_snapshot, total_ms)
                   VALUES (%s, %s, %s, %s, %s)""",
                (query[:2000], _json.dumps(recs[:10], default=str), top_conf,
                 _json.dumps({"corpus": "unified"}), ms),
            )
        return True
    except Exception:
        logger.warning("recommendation audit write skipped", exc_info=True)
        return False


def completeness_score(validation: dict) -> dict:
    """Specification completeness 0-100 with plain-English grade.

    Pure function over a validate() result: cited coverage minus penalties for
    high/medium issues, plus credit for suggested allied additions present.
    Grounded — every input is a counted field, no heuristics beyond weights.
    """
    cited = validation.get("standards_checked", len(validation.get("cited", []))) or 0
    issues = validation.get("issues", [])
    high = sum(1 for i in issues if i.get("severity") == "high")
    medium = sum(1 for i in issues if i.get("severity") == "medium")
    low = sum(1 for i in issues if i.get("severity") not in ("high", "medium"))
    additions = len(validation.get("suggested_additions", []))
    if cited == 0 and not issues:
        return {"score": 0, "grade": " unscored", "detail": "No IS references found."}
    score = 100 - 25 * high - 10 * medium - 3 * low - 2 * min(additions, 10)
    score = max(0, min(100, score))
    grade = "Complete" if score >= 85 else "Needs work" if score >= 60 else "At risk"
    return {
        "score": score,
        "grade": grade,
        "detail": (f"{cited} cited, {high} critical, {medium} warnings, "
                   f"{additions} missing allied suggestions."),
    }


@app.get("/api/review-queue")
def list_review_queue(status: str = "pending", limit: int = 50):
    """Low-confidence review queue. Empty list when Postgres is unavailable."""
    try:
        from pipeline.db.stores import postgres

        with postgres.cursor(commit=False) as cur:
            if cur is None:
                return {"status": status, "total": 0, "items": [],
                        "notice": "Review store unavailable (no Postgres); ingestion runs offline."}
            cur.execute(
                """SELECT id, canonical_key, reason, confidence, status, created_at
                   FROM review_queue WHERE status = %s
                   ORDER BY created_at DESC LIMIT %s""",
                (status, limit),
            )
            items = [dict(r) for r in cur.fetchall()]
        return {"status": status, "total": len(items), "items": items}
    except Exception:
        logger.warning("review-queue read skipped", exc_info=True)
        return {"status": status, "total": 0, "items": [],
                "notice": "Review store unavailable."}


def build_assistant_answer(result: dict, max_cites: int = 3) -> dict:
    """Grounded answer builder for the Standards Assistant (Manak-AI style).

    Pure function over a HybridCorpus.recommend() result — no LLM, no invented
    relations. Every claim cites a retrieved recommendation field. Testable
    without a running server (see tests/test_assistant.py).
    """
    state = result.get("state", "error")
    recs = result.get("recommendations", [])[:max_cites]

    if state != "ok" or not recs:
        return {
            "answer": (
                "I could not find a confident match in the BIS corpus for that. "
                "Add material, rating, dimensions, or intended application "
                "(e.g. '3-core armoured copper cable, 1100V, underground laying') "
                "and ask again."
            ),
            "citations": [],
            "suggested_followups": [
                "What components or materials are involved?",
                "What voltage / rating / grade applies?",
                "Where will it be installed or used?",
            ],
        }

    top = recs[0]
    lines = [
        f"Based on the BIS corpus, the closest match is **{top.get('is_number')}** — "
        f"{top.get('title', '')}.",
        f"Why: {top.get('justification', 'Closest semantic match.')}",
        f"Status: {top.get('status', 'current')} | Current edition: "
        f"{top.get('latest_version', top.get('is_number'))} | "
        f"Confidence: {top.get('band', '')} ({top.get('confidence', '')}).",
    ]
    cert = top.get("certification") or {}
    if cert.get("mandatory") or cert.get("scheme"):
        lines.append(
            f"Certification: {cert.get('scheme_label') or cert.get('scheme')} — "
            "mandatory. State it explicitly in the tender."
        )
    allied = top.get("allied") or {}
    allied_names = [f"{role} ({len(items)})" for role, items in allied.items()][:4]
    if allied_names:
        lines.append(f"Allied standards to cite: {', '.join(allied_names)}.")
    if len(recs) > 1:
        others = ", ".join(r.get("is_number", "") for r in recs[1:])
        lines.append(f"Also relevant: {others}. Open a citation for its dossier.")

    citations = [
        {
            "is_number": r.get("is_number"),
            "title": r.get("title"),
            "tier": r.get("tier"),
            "status": r.get("status"),
            "confidence": r.get("confidence"),
            "band": r.get("band"),
        }
        for r in recs
    ]
    return {
        "answer": "\n\n".join(lines),
        "citations": citations,
        "suggested_followups": [
            f"What tests apply under {top.get('is_number')}?",
            f"Is {top.get('is_number')} mandatory for this procurement?",
            "What allied standards should the tender cite?",
        ],
    }


@app.post("/api/assistant/chat")
def assistant_chat(req: AssistantChatRequest):
    """Manak-AI style grounded chat: retrieval first, templated answer, always cited."""
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is empty.")
    normalized_q, detected_lang, orig_q = normalize_query_for_retrieval(message)

    hc = get_hybrid_corpus()
    result = hc.recommend(normalized_q, top_k=req.top_k)
    recs = result.get("recommendations", [])
    for r in recs:
        if not r.get("tender_clause"):
            r["tender_clause"] = generate_tender_clause(r)

    grounded = build_assistant_answer(result)
    logger.info("Assistant chat: %s -> %s (%s)", orig_q[:80], result.get("state"),
                detected_lang)
    return {
        "answer": grounded["answer"],
        "citations": grounded["citations"],
        "suggested_followups": grounded["suggested_followups"],
        "state": result.get("state", "error"),
        "message": result.get("message"),
        "query": orig_q,
        "normalized_query": normalized_q,
        "detected_language": detected_lang,
        "recommendations": recs,
    }



@app.post("/api/speech/transcribe")
async def transcribe_audio_file(
    file: UploadFile = File(...),
    language_code: str = Form("auto"),
):
    if not speech_service.is_voice_enabled():
        raise HTTPException(status_code=503, detail="Voice service is not configured (SARVAM_API_KEY missing).")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio upload.")

    lang_arg = "unknown" if language_code == "auto" else language_code
    transcript, detected = speech_service.transcribe_audio(content, language_code=lang_arg)
    return {
        "transcript": transcript,
        "detected_language": detected,
    }


@app.post("/api/speech/synthesize")
def synthesize_speech_narration(req: SynthesizeRequest):
    if not speech_service.is_voice_enabled():
        raise HTTPException(status_code=503, detail="Voice service is not configured (SARVAM_API_KEY missing).")

    text_to_narrate = req.text.strip()
    if req.language_code != "en-IN":
        try:
            text_to_narrate = speech_service.translate_text(
                req.text, target_language_code=req.language_code, source_language_code="en-IN"
            )
        except Exception as err:
            logger.warning("Translation error: %s, falling back to original", err)

    audio_bytes = speech_service.synthesize_speech(text_to_narrate, language_code=req.language_code)
    audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")

    return {
        "text": text_to_narrate,
        "language_code": req.language_code,
        "audio_base64": f"data:audio/wav;base64,{audio_base64}",
    }


@app.post("/api/feedback")
def record_feedback(req: FeedbackRequest):
    logger.info("Feedback for %s: %s (query: %s)", req.is_number, req.verdict, req.query)
    return {"success": True, "message": "Feedback recorded."}


@app.post("/api/extract-document")
async def extract_document_endpoint(file: UploadFile = File(...)):
    """Extract readable text from an uploaded specification document (.pdf, .docx, .txt)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is missing from upload.")

    ext = Path(file.filename).suffix.lower()
    if ext not in (".pdf", ".docx", ".txt"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported document format '{ext}'. Accepted formats: .pdf, .docx, .txt.",
        )

    content = await file.read()
    if not content or len(content) == 0:
        raise HTTPException(
            status_code=400,
            detail=f"The uploaded document '{file.filename}' is empty (0 bytes).",
        )

    try:
        text = extract_document_text(content, file.filename)
        return {
            "text": text,
            "filename": file.filename,
            "character_count": len(text),
            "format": ext.lstrip("."),
        }
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        logger.error("Document extraction error: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Unable to process document: {str(exc)}",
        )


@app.post("/api/extract-pdf")
async def extract_pdf_document(file: UploadFile = File(...)):
    """Backward compatibility endpoint for PDF extraction."""
    return await extract_document_endpoint(file)


# -----------------------------------------------------------------------------
# Procurement Portal Integration Endpoints
# -----------------------------------------------------------------------------
class ProcurementIngestRequest(BaseModel):
    tender_id_or_data: Any = Field(..., description="Tender ID (e.g. GEM/2026/B/892104) or full tender specification object")
    portal: Optional[str] = Field("gem", description="Procurement portal connector ('gem' or 'generic')")
    top_k: int = Field(5, ge=1, le=15)
    division: Optional[str] = None


@app.get("/api/procurement/sample-tenders")
def get_sample_procurement_tenders():
    """Return sample verified GeM public procurement tenders for testing."""
    return procurement_service.get_sample_tenders()


@app.post("/api/procurement/ingest")
def ingest_procurement_tender(req: ProcurementIngestRequest):
    """
    Ingest a procurement tender, normalize specification, and pass into the
    existing BIS recommendation engine.
    """
    try:
        res = procurement_service.ingest_and_recommend(
            tender_input=req.tender_id_or_data,
            connector_type=req.portal or "gem",
            top_k=req.top_k,
            division=req.division,
        )
        # Add pre-computed tender clauses to recommendations
        for r in res.get("recommendations", []):
            if not r.get("tender_clause"):
                r["tender_clause"] = generate_tender_clause(r)
        return res
    except Exception as exc:
        logger.error("Procurement ingestion failed: %s", exc)
        raise HTTPException(status_code=400, detail=f"Failed to ingest procurement tender: {exc}")

