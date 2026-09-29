"""Phase 5 regression gate: smoke tests for every stable flow.

Merge is BLOCKED if any test here fails: these encode the original working
contract (recommend / validate / graph / analytics shapes, known queries,
API models, additive-only schema/pages). New features are exercised only
through the same contracts the UI consumes.
"""
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def api():
    import api.index as api_index

    return api_index


@pytest.fixture(scope="module")
def hybrid(api):
    return api.get_hybrid_corpus()


class TestRecommendSmoke:
    QUERIES = [
        "3 core armoured copper cable for underground LV power distribution up to 1100V",
        "43 grade ordinary portland cement for RCC foundation work",
        "High strength deformed steel bars Fe 500 grade for concrete reinforcement",
    ]

    def test_shape(self, hybrid):
        for query in self.QUERIES:
            result = hybrid.recommend(query, top_k=5)
            assert set(result) >= {"query", "state", "recommendations"}
            assert result["state"] in ("ok", "low_confidence")
            for rec in result["recommendations"]:
                assert {"is_number", "title", "status", "confidence", "band",
                        "justification", "latest_version"} <= set(rec)

    def test_known_query(self, hybrid):
        result = hybrid.recommend(self.QUERIES[0], top_k=5)
        assert result["state"] == "ok"
        assert "IS 1554-1" in [r["is_number"] for r in result["recommendations"]]

    def test_performance(self, hybrid):
        started = time.perf_counter()
        hybrid.recommend(self.QUERIES[0], top_k=5)
        assert time.perf_counter() - started < 10


class TestValidateSmoke:
    def test_shape_and_cases(self, hybrid):
        spec = ("Cement shall conform to IS 8112:1989. Reinforcement per IS 1786. "
                "Cables per IS 1554 (Part 1).")
        result = hybrid.validate(spec)
        assert {"cited", "issues", "suggested_additions"} <= set(result)
        assert "IS 8112" in result["cited"] and "IS 1786" in result["cited"]
        assert any(i["severity"] == "high" for i in result["issues"])
        assert result["suggested_additions"]

    def test_empty_spec(self, hybrid):
        result = hybrid.validate("Plain concrete work, no citations here.")
        assert result["cited"] == [] and result["issues"] == []


class TestGraphSmoke:
    def test_neighbourhood_shape(self, api):
        graph = api.resolve_standard_graph("IS 1554-1", depth=1)
        assert set(graph) == {"target", "nodes", "edges"}
        assert any(n.get("is_target") for n in graph["nodes"])
        assert len(graph["edges"]) > 0
        for edge in graph["edges"]:
            assert {"source", "target", "role"} <= set(edge)

    def test_depth_expands(self, api):
        one = api.resolve_standard_graph("IS 1554-1", depth=1)
        two = api.resolve_standard_graph("IS 1554-1", depth=2)
        assert len(two["nodes"]) >= len(one["nodes"])
        assert len(two["edges"]) >= len(one["edges"])

    def test_unknown_standard_404s(self, api):
        from fastapi import HTTPException

        with pytest.raises(HTTPException):
            api.resolve_standard_detail("IS 0000-0")


class TestAnalyticsSmoke:
    def test_catalog_shape(self, api):
        catalog = api.get_standards()
        assert catalog["total"] == len(catalog["standards"]) > 50
        for row in catalog["standards"][:5]:
            assert {"is_number", "title", "division", "status",
                    "mandatory_qco", "tier"} <= set(row)


class TestApiContracts:
    def test_models_accept_valid_payloads(self, api):
        api.RecommendRequest(query="cables", top_k=5)
        api.ValidateRequest(spec_text="Conforms to IS 456.")
        api.AssistantChatRequest(message="Which IS for cement?")
        api.FeedbackRequest(is_number="IS 456", verdict="relevant")

    def test_models_reject_garbage(self, api):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            api.RecommendRequest(query="x")
        with pytest.raises(ValidationError):
            api.FeedbackRequest(is_number="IS 456", verdict="maybe")


class TestAdditiveOnly:
    def test_new_tables_do_not_replace_legacy(self):
        legacy = (BASE / "deploy" / "schema.sql").read_text(encoding="utf-8")
        assert "CREATE TABLE IF NOT EXISTS is_standards (" in legacy
        rollback = (BASE / "deploy" / "migrations" / "002_rollback.sql").read_text(encoding="utf-8")
        assert "DROP TABLE IF EXISTS is_standards;" not in rollback

    def test_stable_backend_entrypoints_present(self):
        src = (BASE / "api" / "index.py").read_text(encoding="utf-8")
        for marker in ("def recommend_standards", "def validate_specification",
                       "def resolve_standard_detail", "def resolve_standard_graph",
                       "def get_standards", "def health_check"):
            assert marker in src, f"stable entrypoint removed: {marker}"
