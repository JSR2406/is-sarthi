"""Phase 1 migration + canonical-loader tests.

DB-optional by design: static SQL assertions + pure-python loader tests always
run. Live-Postgres round-trip runs only when IS_POSTGRES_URL / POSTGRES_URL is
reachable, otherwise skipped (never fails the gate on a laptop with no DB).
"""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.db.canonical_loader import (
    batch_partition,
    content_hash_of,
    merge_records,
    relation_rows,
    to_canonical_record,
    version_rows,
)

BASE = Path(__file__).resolve().parents[1]
MIGRATION = BASE / "deploy" / "migrations" / "002_canonical_schema.sql"
ROLLBACK = BASE / "deploy" / "migrations" / "002_rollback.sql"

REQUIRED_TABLES = [
    "standards", "standard_versions", "standard_relations",
    "certification_rules", "sources", "ingestion_runs",
    "search_history", "feedback", "audit_logs", "review_queue",
]


def _sql(name: Path) -> str:
    assert name.exists(), f"missing migration file: {name}"
    return name.read_text(encoding="utf-8")


class TestMigrationFiles:
    def test_all_required_tables_covered(self):
        # certification_rules + feedback live in 001 (schema.sql); 002 must add the rest.
        sql_001 = (BASE / "deploy" / "schema.sql").read_text(encoding="utf-8")
        sql_002 = _sql(MIGRATION)
        combined = sql_001 + sql_002
        for table in REQUIRED_TABLES:
            assert table in combined, f"table missing from schema: {table}"

    def test_migration_is_idempotent_syntax(self):
        sql = _sql(MIGRATION)
        assert "IF NOT EXISTS" in sql
        assert "CREATE TABLE IF NOT EXISTS standards" in sql
        assert "CREATE TABLE IF NOT EXISTS standard_versions" in sql
        assert "CREATE TABLE IF NOT EXISTS standard_relations" in sql
        assert "CREATE TABLE IF NOT EXISTS sources" in sql
        assert "CREATE TABLE IF NOT EXISTS ingestion_runs" in sql
        assert "CREATE TABLE IF NOT EXISTS search_history" in sql
        assert "CREATE TABLE IF NOT EXISTS audit_logs" in sql
        assert "CREATE TABLE IF NOT EXISTS review_queue" in sql

    def test_index_strategy_present(self):
        sql = _sql(MIGRATION)
        for idx in ("idx_standards_key", "idx_standards_fts", "idx_versions_key",
                    "idx_relations_target", "idx_sources_key", "idx_hist_lowconf",
                    "idx_rq_status", "idx_audit_key"):
            assert idx in sql, f"index missing: {idx}"

    def test_rollback_covers_new_tables_only(self):
        rb = _sql(ROLLBACK)
        for table in ("standards", "standard_versions", "standard_relations",
                      "sources", "ingestion_runs", "search_history",
                      "audit_logs", "review_queue"):
            assert table in rb, f"rollback missing: {table}"
        # legacy tables must NOT be dropped
        for legacy in ("DROP TABLE IF EXISTS is_standards;",
                       "DROP TABLE IF EXISTS certification_rules",
                       "DROP TABLE IF EXISTS feedback"):
            assert legacy not in rb, f"rollback must not drop legacy: {legacy}"

    def test_no_source_specific_columns(self):
        sql = _sql(MIGRATION)
        # sources table must be generic (source_type), not per-portal columns
        assert "source_type" in sql
        assert "gem_column" not in sql.lower()


class TestCanonicalLoader:
    def test_seed_record_canonical(self):
        raw = {"is_number": "IS 1554 (Part 1) : 1988", "title": "PVC cables",
               "scope": "Covers cables.", "division": "ETD",
               "normative_references": ["IS 8130"], "source_url": "http://x"}
        rec = to_canonical_record(raw, "seed", 0.95)
        assert rec["canonical_key"] == "IS 1554-1"
        assert rec["tier"] == "enriched"

    def test_catalogue_record_no_fabrication(self):
        raw = {"is_number": "IS 269:2015", "title": "Cement",
               "department_alias": "CED", "withdrawn": False}
        rec = to_canonical_record(raw, "bis_catalogue", 0.6)
        assert rec["canonical_key"] == "IS 269"
        assert rec["tier"] == "catalogue"

    def test_ambiguous_number_returns_none_for_review_queue(self):
        assert to_canonical_record({"is_number": "nope", "title": "x"}, "seed") is None
        assert to_canonical_record({"title": "x"}, "seed") is None
        assert to_canonical_record({"is_number": "IS 456"}, "seed") is None  # missing title

    def test_content_hash_dedupe(self):
        a = {"title": "Cement", "scope": "s", "status": "current"}
        assert content_hash_of(a) == content_hash_of(dict(a))
        assert content_hash_of(a) != content_hash_of({**a, "scope": "other"})

    def test_merge_never_clobbers_with_weaker_source(self):
        stored = {"title": "T", "scope": "rich scope", "division": "ETD",
                  "status": "current", "extraction_confidence": 0.95,
                  "content_hash": "aaa"}
        weak = {"title": "", "scope": None, "division": None, "status": "current",
                "extraction_confidence": 0.4, "content_hash": "bbb"}
        merged = merge_records(stored, weak)
        assert merged["scope"] == "rich scope"
        assert merged["content_hash"] == "aaa"

    def test_withdrawal_outranks_confidence(self):
        stored = {"title": "T", "status": "current", "extraction_confidence": 0.95}
        incoming = {"status": "withdrawn", "superseded_by": "IS 269",
                    "extraction_confidence": 0.4}
        assert merge_records(stored, incoming)["status"] == "withdrawn"

    def test_version_rows_one_to_many(self):
        rec = {"canonical_key": "IS 269", "year": 2015, "scope": "s",
               "source_url": "", "content_hash": "h", "superseded_by": None}
        rows = version_rows(rec, {"amendments": [{"number": "1", "date": "2019"}],
                                  "published_on": "2015-01-01"})
        assert len(rows) == 2
        assert rows[1]["amendment_no"] == "1"

    def test_relations_dedupe_and_no_self_ref(self):
        rows = relation_rows("IS 456", ["IS 269", "IS 269", "IS 456", "IS 383"])
        assert [r["target_key"] for r in rows] == ["IS 269", "IS 383"]

    def test_batch_partition(self):
        assert batch_partition(list(range(1200)), 500) == [list(range(500)), list(range(500, 1000)), list(range(1000, 1200))]

    def test_seed_corpus_loads_through_loader(self):
        import json
        with open(BASE / "data" / "seed" / "standards.json", encoding="utf-8") as fh:
            seeds = json.load(fh)
        recs = [to_canonical_record(r, "seed", r.get("extraction_quality", 0.9)) for r in seeds]
        assert all(r is not None for r in recs)
        keys = [r["canonical_key"] for r in recs]
        assert len(keys) == len(set(keys)), "duplicate canonical keys in seed"


@pytest.mark.skipif(not (os.getenv("IS_POSTGRES_URL") or os.getenv("POSTGRES_URL")),
                    reason="no Postgres DSN; static checks above already passed")
class TestLivePostgresRoundTrip:
    def test_insert_update_dedupe_relation(self):
        import psycopg2
        dsn = os.getenv("IS_POSTGRES_URL") or os.getenv("POSTGRES_URL")
        conn = psycopg2.connect(dsn)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(open(MIGRATION, encoding="utf-8").read())
        cur.execute("DELETE FROM standard_relations WHERE target_key LIKE 'TEST-%'")
        cur.execute("DELETE FROM standard_versions WHERE canonical_key LIKE 'TEST-%'")
        cur.execute("DELETE FROM sources WHERE canonical_key LIKE 'TEST-%'")
        cur.execute("DELETE FROM standards WHERE canonical_key LIKE 'TEST-%'")
        cur.execute(
            "INSERT INTO standards (canonical_key, is_number, title, content_hash)"
            " VALUES ('TEST-1','TEST 1','Widget', 'h1') ON CONFLICT (canonical_key) DO NOTHING")
        cur.execute(
            "INSERT INTO standards (canonical_key, is_number, title, content_hash)"
            " VALUES ('TEST-1','TEST 1','Widget', 'h1') ON CONFLICT (canonical_key) DO NOTHING")
        cur.execute("SELECT COUNT(*) FROM standards WHERE canonical_key='TEST-1'")
        assert cur.fetchone()[0] == 1
        cur.execute("SELECT id FROM standards WHERE canonical_key='TEST-1'")
        sid = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO standard_relations (source_id, target_key) VALUES (%s,'TEST-2')"
            " ON CONFLICT DO NOTHING", (sid,))
        cur.execute("SELECT COUNT(*) FROM standard_relations WHERE source_id=%s", (sid,))
        assert cur.fetchone()[0] == 1
        conn.close()
