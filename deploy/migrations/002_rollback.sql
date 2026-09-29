-- IS Sarthi migration 002 ROLLBACK (reversible, additive-only undo)
-- Drops ONLY objects created by 002_canonical_schema.sql.
-- Legacy tables (is_standards, certification_rules, feedback, sync_runs,
-- recommendation_log, is_standards_audit) are never touched.
-- Run: psql $IS_POSTGRES_URL -f deploy/migrations/002_rollback.sql

DROP VIEW IF EXISTS v_canonical_catalog;
DROP VIEW IF EXISTS v_gov_coverage;
DROP TABLE IF EXISTS review_queue;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS search_history;
DROP TABLE IF EXISTS ingestion_runs;
DROP TABLE IF EXISTS sources;
DROP TABLE IF EXISTS standard_relations;
DROP TABLE IF EXISTS standard_versions;
DROP TABLE IF EXISTS standards;
