"""Phase 3 tests: route coverage, new-page states, and stable-flow preservation.

Static (no Node required): asserts every route exists with a default export,
new pages handle loading/empty/error states, shared components and history
wiring are present, and the four stable surfaces plus API contracts are intact.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE = Path(__file__).resolve().parents[1]
APP = BASE / "frontend" / "src" / "app"
COMP = BASE / "frontend" / "src" / "components"
LIB = BASE / "frontend" / "src" / "lib"

STABLE_ROUTES = ["", "validator", "graph", "analytics"]
NEW_ROUTES = ["assistant", "browse", "compare", "pdf-analysis", "history",
              "compliance", "governance", "dashboard"]


def _read(path: Path) -> str:
    assert path.exists(), f"missing file: {path}"
    return path.read_text(encoding="utf-8")


class TestRouteCoverage:
    def test_stable_routes_intact(self):
        for route in STABLE_ROUTES:
            page = APP / route / "page.tsx" if route else APP / "page.tsx"
            assert page.exists(), f"stable route missing: /{route or '(root)'}"

    def test_new_routes_exist(self):
        for route in NEW_ROUTES:
            assert (APP / route / "page.tsx").exists(), f"new route missing: /{route}"

    def test_dynamic_dossier_route_intact(self):
        matches = list(APP.glob("standards/**/page.tsx"))
        assert matches, "dynamic /standards dossier route missing"
        # Canonical dossier URL is the query form (/standards?is_number=…):
        # path-segment dynamic routes 404 under the legacy hosting rewrite,
        # so the query page is the single supported entry point.
        assert (APP / "standards" / "page.tsx").exists()
        assert not (APP / "standards" / "[is_number]").exists()
        assert (COMP / "StandardDossier.tsx").exists()
        assert (APP / "not-found.tsx").exists()

    def test_every_page_has_default_export(self):
        for route in STABLE_ROUTES + NEW_ROUTES:
            page = APP / route / "page.tsx" if route else APP / "page.tsx"
            assert "export default function" in _read(page), f"no default export: {page}"

    def test_compare_uses_suspense_for_search_params(self):
        src = _read(APP / "compare" / "page.tsx")
        assert "Suspense" in src and "useSearchParams" in src


class TestPageStates:
    def test_new_pages_have_loading_state(self):
        # Async pages only: history reads localStorage synchronously and
        # compliance is static content, so spinners would be dishonest there.
        for route in ("browse", "compare", "pdf-analysis", "governance", "dashboard"):
            src = _read(APP / route / "page.tsx")
            assert "Loader2" in src or "loading" in src.lower(), f"no loading state: /{route}"

    def test_new_pages_have_empty_state(self):
        for route, marker in (("browse", "No standards match"),
                              ("compare", "Select 2"),
                              ("pdf-analysis", "No document"),
                              ("history", "No history")):
            assert marker in _read(APP / route / "page.tsx"), f"no empty state: /{route}"

    def test_new_pages_have_error_state(self):
        # History surfaces only guarded localStorage reads (no remote failure
        # mode exists); all remote-fetching pages must handle errors.
        for route in ("browse", "compare", "pdf-analysis", "governance", "dashboard"):
            assert "error" in _read(APP / route / "page.tsx").lower(), f"no error state: /{route}"


class TestSharedUI:
    def test_shared_components_exist(self):
        for comp in ("StatusChip.tsx", "CertBadge.tsx", "SourceTrace.tsx", "Sidebar.tsx",
                     "PageHeader.tsx", "Stat.tsx", "EmptyState.tsx", "SectionCard.tsx"):
            assert (COMP / comp).exists(), f"missing shared component: {comp}"

    def test_sidebar_covers_all_routes(self):
        src = _read(COMP / "Sidebar.tsx")
        for href in ["/", "/assistant", "/pdf-analysis", "/validator", "/compliance",
                     "/browse", "/compare", "/graph", "/analytics", "/governance", "/history",
                     "/dashboard"]:
            assert f"'{href}'" in src or f'"{href}"' in src, f"sidebar missing: {href}"

    def test_layout_uses_sidebar_and_keeps_navbar(self):
        src = _read(APP / "layout.tsx")
        assert "Sidebar" in src and "Navbar" in src

    def test_new_pages_reuse_types_and_badges(self):
        assert "StandardCatalogItem" in _read(APP / "browse" / "page.tsx")
        assert "StandardDetail" in _read(APP / "compare" / "page.tsx")
        assert "RecommendationCard" in _read(APP / "pdf-analysis" / "page.tsx")
        assert "StatusChip" in _read(APP / "browse" / "page.tsx")


class TestHistoryWiring:
    def test_history_lib(self):
        src = _read(LIB / "history.ts")
        for fn in ("logHistory", "getHistory", "clearHistory"):
            assert fn in src

    def test_stable_pages_log_without_ui_change(self):
        assert "logHistory('query'" in _read(APP / "page.tsx")
        assert "logHistory('audit'" in _read(APP / "validator" / "page.tsx")

    def test_rerun_prefill_present(self):
        assert "?q=" in _read(APP / "page.tsx") or '"q"' in _read(APP / "page.tsx")


class TestBackwardCompatibility:
    def test_recommendation_flow_intact(self):
        src = _read(APP / "page.tsx")
        assert "Find Standards" in src and "handleSearch" in src
        assert "recommendStandards" in src

    def test_validator_flow_intact(self):
        src = _read(APP / "validator" / "page.tsx")
        assert "Run Full Compliance Audit" in src and "validateSpecification" in src

    def test_graph_flow_intact(self):
        src = _read(APP / "graph" / "page.tsx")
        assert "Traversal Depth" in src and "fetchStandardGraph" in src

    def test_analytics_flow_intact(self):
        src = _read(APP / "analytics" / "page.tsx")
        assert "Corpus Analytics" in src and "fetchStandards" in src

    def test_api_client_stable(self):
        src = _read(LIB / "api.ts")
        for fn in ("recommendStandards", "validateSpecification", "fetchStandards",
                   "fetchStandardDetail", "fetchStandardGraph", "extractDocumentText",
                   "askAssistant", "fetchHealth"):
            assert fn in src, f"api client missing: {fn}"

    def test_backend_contracts_stable(self):
        src = _read(BASE / "api" / "index.py")
        for route in ('"/api/recommend"', '"/api/validate"', '"/api/standards"',
                      '"/api/health"', '"/api/assistant/chat"'):
            assert route in src, f"backend route missing: {route}"
        assert '"tier"' in src and '"is_enriched"' in src  # catalog rows carry tier evidence


class TestResponsive:
    """Mobile contract: scrollable tables, stacked controls, adaptive nav,
    touch-sized icon buttons."""

    def test_tables_scroll_horizontally(self):
        for route in ("browse", "analytics", "compare"):
            assert "overflow-x-auto" in _read(APP / route / "page.tsx"), route

    def test_sidebar_adapts(self):
        src = _read(COMP / "Sidebar.tsx")
        assert "hidden lg:block" in src and "lg:hidden" in src

    def test_control_bars_stack(self):
        for route, marker in (("graph", "flex-col sm:flex-row"),
                              ("browse", "flex-col md:flex-row"),
                              ("compare", "sm:flex-row")):
            assert marker in _read(APP / route / "page.tsx"), route

    def test_touch_targets(self):
        assert "p-2 rounded-md" in _read(APP / "history" / "page.tsx")
        assert "h-5 w-5" in _read(APP / "browse" / "page.tsx")
        assert "p-2 rounded border" in _read(APP / "analytics" / "page.tsx")
