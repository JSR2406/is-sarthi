-- IS Sarthi migration 002: canonical PostgreSQL source of truth
-- ADDITIVE ONLY. Does not alter is_standards, certification_rules, feedback,
-- sync_runs, recommendation_log or their triggers. All statements are
-- IF NOT EXISTS so re-runs are idempotent. Reversible via 002_rollback.sql.
-- Design: canonical_key = normalize_is_number() (year stripped, e.g. 'IS 1554-1').

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------- standards
-- One row per canonical_key. Structured metadata only; embeddings stay optional.
CREATE TABLE IF NOT EXISTS standards (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canonical_key           TEXT UNIQUE NOT NULL,   -- e.g. 'IS 1554-1'
    is_number               TEXT NOT NULL,         -- display designation
    raw_designation         TEXT,
    title                   TEXT NOT NULL DEFAULT '',
    title_hindi             TEXT,
    year                    INTEGER,               -- latest known year (detail lives in versions)
    status                  TEXT NOT NULL DEFAULT 'current'
                            CHECK (status IN ('current','withdrawn','superseded','under_revision','enriched')),
    tier                    TEXT NOT NULL DEFAULT 'catalogue'
                            CHECK (tier IN ('enriched','catalogue')),
    division                TEXT,                  -- ETD/CED/MTD (legacy alias of department)
    ministry                TEXT,
    department              TEXT,
    department_name         TEXT,
    grp                     TEXT,                  -- BIS group/committee (named grp: GROUP is reserved)
    aspect                  TEXT,
    degree_of_equivalence   TEXT,
    scope                   TEXT,
    latest_version_label    TEXT,
    superseded_by           TEXT,
    content_hash            TEXT NOT NULL DEFAULT '',
    scope_hash              TEXT,
    extraction_confidence   REAL NOT NULL DEFAULT 0,
    first_seen              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_standards_key        ON standards(canonical_key);
CREATE INDEX IF NOT EXISTS idx_standards_status     ON standards(status);
CREATE INDEX IF NOT EXISTS idx_standards_division   ON standards(division);
CREATE INDEX IF NOT EXISTS idx_standards_ministry   ON standards(ministry);
CREATE INDEX IF NOT EXISTS idx_standards_tier       ON standards(tier);
CREATE INDEX IF NOT EXISTS idx_standards_year       ON standards(year);
CREATE INDEX IF NOT EXISTS idx_standards_updated    ON standards(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_standards_title_trgm ON standards USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_standards_fts        ON standards USING gin (to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_standards_current    ON standards(division, year) WHERE status = 'current';

-- ---------------------------------------------------- standard_versions
-- One-to-many: every edition/amendment is a row. Year never in the key.
CREATE TABLE IF NOT EXISTS standard_versions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    standard_id     UUID REFERENCES standards(id) ON DELETE CASCADE,
    canonical_key   TEXT NOT NULL,
    year            INTEGER,
    amendment_no    TEXT NOT NULL DEFAULT '',
    amendment_date  DATE,
    scope           TEXT,
    source_url      TEXT,
    content_hash    TEXT NOT NULL DEFAULT '',
    supersedes      TEXT,
    superseded_by   TEXT,
    published_on    DATE,
    valid_upto      DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (canonical_key, year, amendment_no)
);

CREATE INDEX IF NOT EXISTS idx_versions_key      ON standard_versions(canonical_key, year DESC);
CREATE INDEX IF NOT EXISTS idx_versions_std      ON standard_versions(standard_id);
CREATE INDEX IF NOT EXISTS idx_versions_created  ON standard_versions(created_at DESC);

-- ---------------------------------------------------- standard_relations
-- Many-to-many normative references in relational form (replaces JSONB-only refs).
CREATE TABLE IF NOT EXISTS standard_relations (
    source_id   UUID NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
    target_key  TEXT NOT NULL,   -- canonical_key of the cited standard
    ref_type    TEXT NOT NULL DEFAULT 'related_product',
    hop         INTEGER NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (source_id, target_key)
);

CREATE INDEX IF NOT EXISTS idx_relations_target ON standard_relations(target_key);
CREATE INDEX IF NOT EXISTS idx_relations_type   ON standard_relations(ref_type);
CREATE INDEX IF NOT EXISTS idx_relations_source ON standard_relations(source_id);

-- ------------------------------------------------------------- sources
-- Every row traceable: no source-specific columns, generic source_type instead.
CREATE TABLE IF NOT EXISTS sources (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    standard_id             UUID REFERENCES standards(id) ON DELETE CASCADE,
    canonical_key           TEXT NOT NULL DEFAULT '',
    source_type             TEXT NOT NULL,   -- seed | bis_catalogue | bis_portal | gazette | crs | pdf
    source_url              TEXT NOT NULL DEFAULT '',
    retrieved_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    extraction_confidence   REAL NOT NULL DEFAULT 0,
    raw_snapshot_path       TEXT,
    content_hash            TEXT
);

CREATE INDEX IF NOT EXISTS idx_sources_std  ON sources(standard_id);
CREATE INDEX IF NOT EXISTS idx_sources_key  ON sources(canonical_key);
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(source_type);

-- ------------------------------------------------------- ingestion_runs
-- Superset of legacy sync_runs. sync_runs is left untouched; this is the new log.
CREATE TABLE IF NOT EXISTS ingestion_runs (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mode               TEXT NOT NULL,   -- seed | full | delta | gazette | crs | backfill
    source             TEXT NOT NULL DEFAULT 'unknown',
    started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at        TIMESTAMPTZ,
    attempted          INTEGER NOT NULL DEFAULT 0,
    inserted           INTEGER NOT NULL DEFAULT 0,
    updated            INTEGER NOT NULL DEFAULT 0,
    skipped_unchanged  INTEGER NOT NULL DEFAULT 0,
    failed             INTEGER NOT NULL DEFAULT 0,
    queued_review      INTEGER NOT NULL DEFAULT 0,
    errors             JSONB NOT NULL DEFAULT '[]',
    healthy            BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_ingest_started ON ingestion_runs(started_at DESC);

-- -------------------------------------------------------- search_history
-- Query log for history/rerun + low-confidence demand signal. Tender text truncated upstream.
CREATE TABLE IF NOT EXISTS search_history (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_text       TEXT NOT NULL,
    normalized_query TEXT,
    top_k            INTEGER,
    division         TEXT,
    state            TEXT,              -- ok | low_confidence | error | no_results
    confidence_top   REAL,
    results          JSONB NOT NULL DEFAULT '[]',
    user_ref         TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hist_created ON search_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hist_lowconf ON search_history(created_at DESC) WHERE confidence_top < 0.35;

-- ----------------------------------------------------------- audit_logs
-- Canonical change log (legacy is_standards_audit stays untouched).
CREATE TABLE IF NOT EXISTS audit_logs (
    id            BIGSERIAL PRIMARY KEY,
    canonical_key TEXT NOT NULL,
    change_type   TEXT NOT NULL,   -- insert | metadata | scope | references | amendment | certification | withdrawn | superseded
    old_values    JSONB,
    new_values    JSONB,
    actor         TEXT NOT NULL DEFAULT 'pipeline',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_key  ON audit_logs(canonical_key);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_logs(change_type);

-- ---------------------------------------------------------- review_queue
-- Uncertain rows never block the batch; they land here.
CREATE TABLE IF NOT EXISTS review_queue (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canonical_key TEXT,
    raw_payload  JSONB NOT NULL,
    reason       TEXT NOT NULL,    -- ambiguous_number | low_confidence | conflicting_status | missing_title | ...
    confidence   REAL,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rq_status ON review_queue(status, created_at DESC);

-- ------------------------------------------------- governance views (Phase 5 / gov dashboard)
CREATE OR REPLACE VIEW v_gov_coverage AS
SELECT division,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'current') AS current_count,
       COUNT(*) FILTER (WHERE tier = 'enriched') AS enriched_count,
       ROUND(AVG(extraction_confidence)::numeric, 3) AS avg_confidence,
       MAX(updated_at) AS last_synced
FROM standards GROUP BY division ORDER BY total DESC;

CREATE OR REPLACE VIEW v_canonical_catalog AS
SELECT s.canonical_key, s.is_number, s.title, s.status, s.tier,
       s.division, s.department_name, s.aspect, s.year,
       s.latest_version_label, s.superseded_by, s.updated_at
FROM standards s;
