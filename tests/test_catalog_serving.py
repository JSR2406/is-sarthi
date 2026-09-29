"""Unified catalogue serving tests: the full 13k corpus must be browsable.

Guards the fix for "only 57 visible": /api/standards serves Tier-1 + Tier-2
with filters, sorting, and pagination; /api/divisions rolls up categories.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def api():
    import api.index as api_index

    return api_index


class TestUnifiedCatalog:
    def test_total_covers_national_catalogue(self, api):
        catalog = api.get_standards()
        assert catalog["total"] > 13000, f"expected 13k+ unified, got {catalog['total']}"

    def test_rows_carry_tier_and_evidence(self, api):
        catalog = api.get_standards(limit=200)
        tiers = {r["tier"] for r in catalog["standards"]}
        assert {"enriched", "catalogue"} <= tiers
        for row in catalog["standards"]:
            assert {"is_number", "title", "division", "status",
                    "mandatory_qco", "tier", "is_enriched"} <= set(row)

    def test_pagination_slices_stably(self, api):
        first = api.get_standards(limit=50, offset=0)
        second = api.get_standards(limit=50, offset=50)
        assert first["total"] == second["total"]
        assert len(first["standards"]) == 50 and len(second["standards"]) == 50
        assert {r["is_number"] for r in first["standards"]} \
            .isdisjoint({r["is_number"] for r in second["standards"]})

    def test_division_filter_narrows(self, api):
        full = api.get_standards()
        etd = api.get_standards(division="ETD")
        assert 0 < etd["total"] < full["total"]
        assert all(r["division"] == "ETD" for r in etd["standards"])

    def test_search_narrows(self, api):
        result = api.get_standards(search="cement")
        assert 0 < result["total"] < api.get_standards()["total"]

    def test_status_filter_only_withdrawn(self, api):
        result = api.get_standards(status="withdrawn", limit=100)
        assert result["total"] > 0
        assert all(r["status"] == "withdrawn" for r in result["standards"])

    def test_sort_orders(self, api):
        result = api.get_standards(sort="title", limit=200)
        titles = [r["title"] for r in result["standards"]]
        assert titles == sorted(titles)


class TestDivisionsRollup:
    def test_rollup_matches_catalog_total(self, api):
        divisions = api.list_divisions()
        catalog = api.get_standards()
        assert divisions["total"] == catalog["total"] > 13000
        assert sum(d["total"] for d in divisions["divisions"]) == divisions["total"]

    def test_known_divisions_present(self, api):
        names = {d["division"] for d in api.list_divisions()["divisions"]}
        assert {"ETD", "CED", "MTD"} <= names

    def test_rollup_fields(self, api):
        for entry in api.list_divisions()["divisions"]:
            assert {"division", "total", "current", "enriched", "qco", "outdated"} <= set(entry)

    def test_aspect_and_status_breakdowns(self, api):
        rollup = api.list_divisions()
        assert rollup["aspects"], "aspect breakdown missing"
        assert sum(a["total"] for a in rollup["aspects"]) == rollup["total"]
        assert sum(rollup["statuses"].values()) == rollup["total"]
        assert rollup["statuses"].get("current", 0) > 13000

    def test_department_breakdown(self, api):
        rollup = api.list_divisions()
        depts = rollup["departments"]
        assert len(depts) >= 15, f"expected 15+ departments, got {len(depts)}"
        names = {d["name"] for d in depts}
        assert "ELECTROTECHNICAL DEPARTMENT" in names
        assert "CIVIL ENGINEERING DEPARTMENT" in names
        for d in depts:
            assert {"name", "alias", "total"} <= set(d)
            assert d["total"] > 0


class TestFrontendWiring:
    def test_api_client_supports_pagination_and_divisions(self):
        src = (BASE / "frontend" / "src" / "lib" / "api.ts").read_text(encoding="utf-8")
        assert "fetchDivisions" in src and "limit" in src and "offset" in src

    def test_browse_is_server_paginated(self):
        src = (BASE / "frontend" / "src" / "app" / "browse" / "page.tsx").read_text(encoding="utf-8")
        assert "fetchDivisions" in src and "Previous page" in src

    def test_backend_routes_present(self):
        src = (BASE / "api" / "index.py").read_text(encoding="utf-8")
        assert '"/api/divisions"' in src
