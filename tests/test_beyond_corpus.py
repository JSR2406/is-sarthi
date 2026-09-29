"""Beyond-corpus tests: assistant + validator must stay useful (and honest)
when queries go past the 13,812-record snapshot. Nothing may be invented:
unknown numbers get portal guidance, known numbers get corpus facts, and
family neighbours are labeled as neighbours — never replacements.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture(scope="module")
def api():
    import api.index as api_index

    return api_index


@pytest.fixture(scope="module")
def corpus(api):
    return api.get_hybrid_corpus()


def _low():
    return {"state": "low_confidence", "recommendations": [], "query": "x"}


class TestAssistantBeyondCorpus:
    def test_unknown_number_gets_portal_guidance(self, api, corpus):
        out = api.build_assistant_answer(_low(), message="Tell me about IS 99999", corpus=corpus)
        assert "not in this" in out["answer"]
        assert "bis.gov.in" in out["answer"]
        assert out["citations"] == []

    def test_known_number_in_fallback_cites_corpus(self, api, corpus):
        out = api.build_assistant_answer(_low(), message="Is IS 1554-1 still current?", corpus=corpus)
        assert "is in this corpus" in out["answer"]
        assert any(c["is_number"] == "IS 1554-1" for c in out["citations"])

    def test_withdrawn_ref_warns_in_fallback(self, api, corpus):
        out = api.build_assistant_answer(_low(), message="Can I cite IS 8112?", corpus=corpus)
        assert "IS 269" in out["answer"]  # successor surfaced, not invented

    def test_scheme_question_answered_without_corpus_hit(self, api, corpus):
        out = api.build_assistant_answer(_low(), message="What is CRS certification?", corpus=corpus)
        assert "Scheme-II" in out["answer"]
        assert "not a corpus citation" in out["answer"]

    def test_ok_path_unchanged_without_keywords(self, api, corpus):
        res = corpus.recommend(
            "3 core armoured copper cable for underground LV power distribution up to 1100V",
            top_k=3)
        out = api.build_assistant_answer(res, message="cable query", corpus=corpus)
        assert "IS 1554-1" in out["answer"]
        assert len(out["citations"]) == 3


class TestValidatorBeyondCorpus:
    def test_unknown_part_suggests_family(self, corpus):
        result = corpus.validate("All cables tested per IS 10810-99.")
        assert "IS 10810-99" in result["cited"]
        family = [s for s in result["suggested_additions"]
                  if s.get("referenced_by") == "IS 10810-99"]
        assert family, "expected same-family neighbours"
        for s in family:
            assert s["role"].startswith("Same family")
            assert corpus.adapter.get_by_number(s["is_number"]) is not None

    def test_unknown_action_points_to_portal(self, corpus):
        result = corpus.validate("Conforming to IS 99999:2020.")
        info = [i for i in result["issues"] if i["is_number"] == "IS 99999"]
        assert info and "bis.gov.in" in info[0]["action"]

    def test_known_flow_unchanged(self, corpus):
        result = corpus.validate("Cement shall conform to IS 8112:1989.")
        assert any(i["severity"] == "high" for i in result["issues"])
