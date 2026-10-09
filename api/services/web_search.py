"""
Tavily web-search tool for the AI copilot (Standards Assistant).

Why this exists: the BIS corpus is a curated snapshot. It cannot answer
real-time questions — recent QCO/gazette notifications, amendments issued
this week, current prices, news, or anything outside BIS scope. Tavily
provides grounded, cited web results that complement (never replace) the
corpus retrieval.

Design rules (mirrors the codebase's grounding philosophy):
1. Corpus first, web second. Web results are ALWAYS labelled as web sources
   and kept separate from BIS citations so a reader can tell which claim
   came from where.
2. Fail-closed to corpus-only. Missing API key, timeout, or HTTP error must
   degrade to a corpus-only answer — never an error page.
3. No secrets in code. Key comes from settings / env only.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

TAVILY_API_URL = "https://api.tavily.com/search"

# Queries that strongly suggest the user needs live info the corpus snapshot
# cannot provide. Used for auto-triggering web search.
REALTIME_HINTS = re.compile(
    r"\b(latest|current|recent|today|this week|this month|202[4-9]|20[3-9]\d|"
    r"news|update[sd]?|amendment|revision|superseded|withdrawn|qco|gazette|"
    r"notification|circular|price|cost|tender|gem|mandatory now|still valid|"
    r"in force|effective from|launch|announced)\b",
    re.IGNORECASE,
)


def is_web_search_enabled(api_key: Optional[str] = None) -> bool:
    """True when a Tavily key is configured."""
    if api_key is None:
        try:
            from pipeline.config import settings

            api_key = settings.tavily_api_key or os.getenv("TAVILY_API_KEY", "")
        except Exception:
            api_key = os.getenv("TAVILY_API_KEY", "")
    return bool(api_key and api_key.strip())


def should_use_web_search(
    message: str,
    corpus_state: str = "ok",
    top_confidence: float = 1.0,
    explicit_flag: Optional[bool] = None,
) -> bool:
    """
    Decide whether to call Tavily for this assistant turn.

    - explicit True/False from the client always wins.
    - otherwise auto: web search when the corpus missed (state != ok),
      when top confidence is shaky (< 0.6), or when the query carries
      real-time intent (dates, amendments, QCO/gazette, prices, news...).
    Returns False when no API key is configured.
    """
    if explicit_flag is True:
        return is_web_search_enabled()
    if explicit_flag is False:
        return False
    if not is_web_search_enabled():
        return False
    if corpus_state != "ok":
        return True
    if top_confidence < 0.6:
        return True
    return bool(REALTIME_HINTS.search(message or ""))


def _resolve_settings() -> Dict[str, Any]:
    """Read Tavily tunables with safe defaults (works even if config is old)."""
    try:
        from pipeline.config import settings

        api_key = getattr(settings, "tavily_api_key", "") or os.getenv("TAVILY_API_KEY", "")
        return {
            "api_key": api_key,
            "max_results": getattr(settings, "tavily_max_results", 5),
            "search_depth": getattr(settings, "tavily_search_depth", "advanced"),
            "include_answer": getattr(settings, "tavily_include_answer", True),
            "include_domains": getattr(settings, "tavily_include_domains", ""),
            "timeout": getattr(settings, "tavily_timeout_seconds", 15),
        }
    except Exception:
        return {
            "api_key": os.getenv("TAVILY_API_KEY", ""),
            "max_results": 5,
            "search_depth": "advanced",
            "include_answer": True,
            "include_domains": "",
            "timeout": 15,
        }


def tavily_search(
    query: str,
    max_results: Optional[int] = None,
    search_depth: Optional[str] = None,
    include_answer: Optional[bool] = None,
    include_domains: Optional[List[str]] = None,
    api_key: Optional[str] = None,
    timeout: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Call the Tavily Search API and return normalised results.

    Returns: {"enabled": bool, "answer": str|None, "results": [...],
              "query": str, "error": str|None}
    Each result: {"title", "url", "snippet", "score", "published_date"}.
    Never raises — failures return {"enabled": False, "results": [], ...}.
    """
    cfg = _resolve_settings()
    api_key = api_key or cfg["api_key"]
    if not api_key or not api_key.strip():
        return {
            "enabled": False,
            "answer": None,
            "results": [],
            "query": query,
            "error": "Tavily API key not configured (IS_TAVILY_API_KEY / TAVILY_API_KEY).",
        }

    max_results = max_results if max_results is not None else cfg["max_results"]
    search_depth = search_depth or cfg["search_depth"]
    if include_answer is None:
        include_answer = cfg["include_answer"]
    if include_domains is None:
        raw = cfg.get("include_domains") or ""
        include_domains = [d.strip() for d in str(raw).split(",") if d.strip()] or None
    timeout = timeout or cfg.get("timeout") or 15

    payload: Dict[str, Any] = {
        "api_key": api_key,
        "query": query,
        "search_depth": search_depth,
        "max_results": max(1, min(int(max_results), 10)),
        "include_answer": bool(include_answer),
        "include_raw_content": False,
    }
    if include_domains:
        payload["include_domains"] = include_domains

    try:
        import requests

        resp = requests.post(TAVILY_API_URL, json=payload, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Tavily search failed for %r: %s", query[:80], exc)
        return {
            "enabled": False,
            "answer": None,
            "results": [],
            "query": query,
            "error": f"Tavily request failed: {exc}",
        }

    results: List[Dict[str, Any]] = []
    for item in data.get("results", []) or []:
        results.append(
            {
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "snippet": (item.get("content") or "")[:800],
                "score": item.get("score", 0.0),
                "published_date": item.get("published_date"),
            }
        )
    return {
        "enabled": True,
        "answer": data.get("answer"),
        "results": results,
        "query": query,
        "response_time": data.get("response_time"),
        "error": None,
    }


def format_web_section(web: Dict[str, Any], max_items: int = 3) -> str:
    """Render web results as a clearly-labelled answer section."""
    results = (web or {}).get("results", [])[:max_items]
    if not results and not (web or {}).get("answer"):
        return ""
    lines = ["---", "Live web context (Tavily — verify before citing in a tender):"]
    if web.get("answer"):
        lines.append(str(web["answer"]).strip()[:1200])
    for i, r in enumerate(results, start=1):
        title = r.get("title") or r.get("url") or f"Source {i}"
        snippet = (r.get("snippet") or "").strip()[:400]
        url = r.get("url") or ""
        lines.append(f"[W{i}] {title} — {snippet} ({url})")
    return "\n".join(lines)
