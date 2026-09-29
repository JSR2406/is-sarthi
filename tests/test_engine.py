"""Engine tests: staged Manak-style recommendation pipeline.

Every stage is pinned: exact lookup short-circuits, hybrid retrieval matches
legacy ordering, department filtering narrows before the cut, confidence gates
abstain honestly, and nothing served is invented.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

CABLE_QUERY = "3 core armoured copper cable for underground LV power distribution up to 1100V"
GIBBERISH = "xqz wkjv blorpt zzzqqq 999"


@pytest.fixture(scope="module")
def corpus():
    from pipeline.db.unified_corpus import HybridCorpus

    return HybridCorpus.from_files()


@pytest.fixture(scope="module")
def engine():
    from pipeline import engine as engine_pkg

    return engine_pkg


class TestExactLookup:
    def test_exact_number_short_circuits(self, corpus, engine):
        result = engine.recommend(corpus, "IS 1554-1", top_k=5)
        assert result["state"] == "ok"
        assert result["stages"]["exact_hit"] is True
        assert len(result["recommendations"]) == 1
        rec = result["recommendations"][0]
        assert rec["is_number"] == "IS 1554-1"
        assert rec["match_kind"] == "exact" and rec["band"] == "High"

    def test_exact_variant_forms(self, corpus, engine):
        for variant in ("IS 1554 (Part 1):1988", "is:1554-1"):
            result = engine.recommend(corpus, variant, top_k=5)
            assert result["stages"]["exact_hit"] is True
            assert result["recommendations"][0]["is_number"] == "IS 1554-1"


class TestHybridRetrieval:
    def test_matches_legacy_ordering(self, corpus, engine):
        legacy = corpus.recommend(CABLE_QUERY, top_k=5)
        staged = engine.recommend(corpus, CABLE_QUERY, top_k=5)
        assert staged["state"] == "ok"
        assert [r["is_number"] for r in staged["recommendations"]] == \
               [r["is_number"] for r in legacy["recommendations"]]

    def test_match_kinds_labeled(self, corpus, engine):
        result = engine.recommend(corpus, CABLE_QUERY, top_k=5)
        kinds = {r["match_kind"] for r in result["recommendations"]}
        assert kinds <= {"hybrid", "semantic", "keyword"}
        assert "hybrid" in kinds

    def test_stage_trace_present(self, corpus, engine):
        result = engine.recommend(corpus, CABLE_QUERY, top_k=5)
        assert result["stages"]["pool"] >= 5
        assert result["stages"]["kept"] == len(result["recommendations"])


class TestDepartmentFilter:
    def test_prefilter_narrows(self, corpus, engine):
        full = engine.recommend(corpus, "steel cement cable", top_k=5)
        etd = engine.recommend(corpus, "steel cement cable", top_k=5, division="ETD")
        assert etd["stages"]["division"] == "ETD"
        assert len(etd["recommendations"]) <= len(full["recommendations"])
        for rec in etd["recommendations"]:
            assert rec["department"] == "ETD" or rec.get("division") == "ETD"


class TestConfidenceGating:
    def test_gibberish_abstains(self, corpus, engine):
        result = engine.recommend(corpus, GIBBERISH, top_k=5)
        assert result["state"] == "low_confidence"
        assert result["recommendations"] == []

    def test_bands_are_valid(self, corpus, engine):
        result = engine.recommend(corpus, CABLE_QUERY, top_k=5)
        for rec in result["recommendations"]:
            assert rec["band"] in ("High", "Medium", "Low")
            assert 0 < rec["confidence"] <= 1


class TestNoInvention:
    def test_every_served_number_resolves(self, corpus, engine):
        for query in (CABLE_QUERY, "43 grade cement", "IS 1786", "LED lamps"):
            result = engine.recommend(corpus, query, top_k=5)
            for rec in result["recommendations"]:
                assert corpus.adapter.get_by_number(rec["is_number"]) is not None
                assert rec["justification"], f"{rec['is_number']} unexplained"
                assert rec["latest_version"]
