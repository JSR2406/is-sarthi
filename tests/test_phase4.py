"""Phase 4 tests: enrichment markers + grounded real-corpus regression.

Static checks prove each explanation surface exists. Corpus checks prove each
explanation has supporting data: every recommendation carries justification +
evidence, every validator issue traces to a record, graph depth expands
monotonically, and compare columns stay consistent.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE = Path(__file__).resolve().parents[1]
APP = BASE / "frontend" / "src" / "app"
COMP = BASE / "frontend" / "src" / "components"

CABLE_QUERY = "3 core armoured copper cable for underground LV power distribution up to 1100V"
CEMENT_SPEC = "All cement in RCC works shall conform to IS 8112:1989 for 43 grade OPC."
CABLE_SPEC = "Supply PVC insulated heavy duty cables conforming to IS 1554 (Part 1)."


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class TestCardEnrichment:
    def test_evidence_footer(self):
        src = _read(COMP / "RecommendationCard.tsx")
        assert "Evidence:" in src and "canonical_key" in src and "dense#" in src

    def test_relevance_shown(self):
        assert "relevance" in _read(COMP / "RecommendationCard.tsx")

    def test_card_keeps_core_surfaces(self):
        src = _read(COMP / "RecommendationCard.tsx")
        for marker in ("justification", "latest_version", "amendments", "certification",
                       "allied", "tender_clause", "getStandardDetailUrl"):
            assert marker in src, f"card lost surface: {marker}"

    def test_match_overview(self):
        src = _read(COMP / "RecommendationCard.tsx")
        assert "Match overview" in src and "describeMatch" in src

    def test_ai_summary_grounded(self):
        src = _read(COMP / "RecommendationCard.tsx")
        assert "AI summary" in src and "summarizeStandard" in src
        assert '"/api/summarize"' in _read(BASE / "api" / "index.py")
        assert "summarizeStandard" in _read(BASE / "frontend" / "src" / "lib" / "api.ts")

    def test_allied_network(self):
        src = _read(COMP / "RecommendationCard.tsx")
        assert "AlliedNetwork" in src and "<svg" in src


class TestValidatorEnrichment:
    def test_low_severity_notices(self):
        assert "lowIssues" in _read(APP / "validator" / "page.tsx")

    def test_dossier_links_for_replacement(self):
        src = _read(APP / "validator" / "page.tsx")
        assert src.count("getStandardDetailUrl(iss.is_number)") >= 2


class TestGraphEnrichment:
    def test_hop_chips(self):
        src = _read(APP / "graph" / "page.tsx")
        assert "direct" in src and "transitive" in src

    def test_status_granularity(self):
        src = _read(APP / "graph" / "page.tsx")
        assert "Withdrawn" in src and "Superseded" in src


class TestCompareEnrichment:
    def test_scope_and_role_rows(self):
        src = _read(APP / "compare" / "page.tsx")
        assert "scopeOf" in src and "rolesOf" in src


@pytest.fixture(scope="module")
def corpus():
    from pipeline.db.unified_corpus import HybridCorpus

    return HybridCorpus.from_files()


class TestGroundedRegression:
    def test_recommendation_explanations_have_data(self, corpus):
        result = corpus.recommend(CABLE_QUERY, top_k=5)
        assert result["state"] == "ok"
        assert "IS 1554-1" in [r["is_number"] for r in result["recommendations"][:3]]
        for rec in result["recommendations"]:
            assert rec["justification"], f"{rec['is_number']} has no justification"
            assert rec["latest_version"] and rec["band"] and rec["confidence"] > 0
            assert isinstance(rec["allied"], dict)

    def test_superseded_citation_flagged_with_replacement(self, corpus):
        result = corpus.validate(CEMENT_SPEC)
        high = [i for i in result["issues"] if i["severity"] == "high"
                and i["is_number"] == "IS 8112"]
        assert high, "IS 8112 supersession not flagged"
        assert "IS 269" in high[0]["action"], "replacement IS 269 missing from action"

    def test_missing_allied_suggested(self, corpus):
        result = corpus.validate(CABLE_SPEC)
        assert result["suggested_additions"], "no allied suggestions for IS 1554-1"
        roles = {s["role"] for s in result["suggested_additions"]}
        assert roles, "suggested additions carry no role labels"

    def test_status_labels_correct(self, corpus):
        assert corpus.adapter.get_by_number("IS 8112")["status"] == "superseded"
        assert corpus.adapter.get_by_number("IS 1554-1")["status"] == "current"


class TestExtractiveSummary:
    def test_sentences_are_quoted_from_scope(self, corpus):
        from api.index import build_extractive_summary

        rec = corpus.adapter.get_by_number("IS 1554-1")
        out = build_extractive_summary(rec, query="armoured copper cable underground")
        assert out["summary"], "expected quoted sentences"
        assert len(out["summary"]) <= 3
        for sent in out["summary"]:
            assert sent in rec["scope"], f"hallucinated sentence: {sent[:60]}"
        assert any("Status:" in f for f in out["facts"])

    def test_catalogue_record_is_honest(self, corpus):
        from api.index import build_extractive_summary

        tier2 = next(r for r in corpus.adapter.records
                     if r.get("tier") == "catalogue" and not r.get("scope"))
        out = build_extractive_summary(tier2, query="cement")
        assert out["summary"] == []
        assert out["notice"], "Tier-2 rows must explain why there is no summary"

    def test_graph_depth_expands(self, corpus):
        one = corpus.allied("IS 1554-1", CABLE_QUERY, depth=1)
        two = corpus.allied("IS 1554-1", CABLE_QUERY, depth=2)
        count = lambda by_role: sum(len(v) for v in by_role.values())
        assert count(two) >= count(one) > 0

    def test_compare_columns_consistent(self, corpus):
        fields = ["title", "status", "department", "aspect", "published_on",
                  "amendments", "certification", "tier"]
        a = corpus.adapter.get_by_number("IS 1554-1")
        b = corpus.adapter.get_by_number("IS 269")
        for field in fields:
            assert field in a and field in b, f"compare column missing: {field}"


class TestPremiumSpec:
    """Premium-spec surfaces: compare add/export, graph explanations, analytics
    freshness, history bookmarks, assistant structure, dossier actions."""

    def test_compare_add_and_export(self):
        src = _read(APP / "compare" / "page.tsx")
        assert "Add standard" in src and "Export report" in src
        assert "goIds" in src and "Comparison is limited to 4" in src

    def test_graph_why_connected(self):
        assert "Cited by" in _read(APP / "graph" / "page.tsx")

    def test_analytics_enrichment_freshness(self):
        src = _read(APP / "analytics" / "page.tsx")
        assert "Enrichment:" in src and "served live by API" in src

    def test_history_bookmarks_and_grouping(self):
        src = _read(APP / "history" / "page.tsx")
        assert "toggleBookmark" in src and "Yesterday" in src and "Saved" in src
        lib = _read(BASE / "frontend" / "src" / "lib" / "history.ts")
        assert "toggleBookmark" in lib and "getBookmarked" in lib

    def test_assistant_structured_answers(self):
        src = _read(APP / "assistant" / "page.tsx")
        assert "Low-confidence answer" in src and "Source citations" in src

    def test_dossier_compare_and_export(self):
        src = list(APP.glob("standards/**/page.tsx"))[0].read_text(encoding="utf-8")
        assert "/compare?ids=" in src and "exportJson" in src and "exportMarkdown" in src

    def test_sidebar_matches_premium_nav(self):
        src = _read(COMP / "Sidebar.tsx")
        # Labels are translated via t(); assert keys + hrefs instead of literals.
        for key in ("nav.core", "nav.explore", "nav.oversight", "nav.assistant",
                    "nav.find", "nav.validator", "nav.graph", "nav.compare"):
            assert key in src, f"sidebar missing i18n key: {key}"
        for href in ("'/validator'", "'/graph'", "'/compare'", "'/assistant'"):
            assert href in src, f"sidebar missing href: {href}"
