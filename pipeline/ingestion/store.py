"""Canonical stores: InMemory (tests/demo/offline) + Postgres (real runs).

Both expose the same surface so BatchLoader and the review workflow are
backend-agnostic. Postgres DDL matches deploy/migrations/002_canonical_schema.sql.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class InMemoryCanonicalStore:
    """Full-fidelity fake: standards, versions, relations, sources, audit, reviews, runs."""

    def __init__(self):
        self.standards: dict[str, dict] = {}
        self.versions: list[dict] = []
        self.relations: list[dict] = []
        self.sources: list[dict] = []
        self.audit: list[dict] = []
        self.reviews: dict[str, dict] = {}
        self.runs: list[dict] = []

    # -- reads --
    def get_hash(self, canonical_key: str) -> Optional[str]:
        rec = self.standards.get(canonical_key)
        return rec.get("content_hash") if rec else None

    def get_record(self, canonical_key: str) -> Optional[dict]:
        return self.standards.get(canonical_key)

    def snapshot_hashes(self) -> dict[str, str]:
        return {k: v.get("content_hash", "") for k, v in self.standards.items()}

    # -- writes --
    def upsert_standard(self, canonical: dict) -> str:
        """Insert or confidence-gated merge. Returns 'inserted' | 'updated' | 'unchanged'."""
        from pipeline.db.canonical_loader import merge_records

        key = canonical["canonical_key"]
        stored = self.standards.get(key)
        if stored is None:
            self.standards[key] = {**canonical, "first_seen": _now(), "updated_at": _now()}
            return "inserted"
        if stored.get("content_hash") == canonical.get("content_hash"):
            stored["last_seen"] = _now()
            return "unchanged"
        merged = merge_records(stored, canonical)
        merged["updated_at"] = _now()
        merged["last_seen"] = _now()
        self.standards[key] = merged
        return "updated"

    def replace_relations(self, canonical_key: str, rows: list[dict]) -> None:
        self.relations = [r for r in self.relations if r["source_key"] != canonical_key]
        self.relations.extend(rows)

    def add_versions(self, rows: list[dict]) -> int:
        existing = {(v["canonical_key"], v.get("year"), v.get("amendment_no", ""))
                    for v in self.versions}
        added = 0
        for row in rows:
            sig = (row["canonical_key"], row.get("year"), row.get("amendment_no", ""))
            if sig not in existing:
                self.versions.append(row)
                existing.add(sig)
                added += 1
        return added

    def add_source(self, canonical_key: str, source_type: str, source_url: str,
                   confidence: float, content_hash: str) -> None:
        self.sources.append({"canonical_key": canonical_key, "source_type": source_type,
                             "source_url": source_url or "", "confidence": confidence,
                             "content_hash": content_hash, "retrieved_at": _now()})

    def write_audit(self, canonical_key: str, change_type: str,
                    old: Optional[dict], new: Optional[dict]) -> None:
        self.audit.append({"canonical_key": canonical_key, "change_type": change_type,
                           "old": old, "new": new, "actor": "pipeline", "at": _now()})

    def enqueue_review(self, canonical_key: Optional[str], raw: dict,
                       reason: str, confidence: float) -> str:
        rid = str(uuid.uuid4())
        self.reviews[rid] = {"id": rid, "canonical_key": canonical_key, "raw": raw,
                             "reason": reason, "confidence": confidence,
                             "status": "pending", "created_at": _now()}
        return rid

    def list_reviews(self, status: str = "pending") -> list[dict]:
        return [r for r in self.reviews.values() if r["status"] == status]

    def resolve_review(self, review_id: str, decision: str) -> Optional[dict]:
        item = self.reviews.get(review_id)
        if item and decision in ("approved", "rejected"):
            item["status"] = decision
            item["resolved_at"] = _now()
        return item

    def record_run(self, metrics: dict) -> dict:
        run = {**metrics, "id": str(uuid.uuid4()), "finished_at": _now()}
        self.runs.append(run)
        return run


class PostgresCanonicalStore:
    """Thin psycopg2 adapter. Strict: raises when Postgres is unreachable.

    Per-record SAVEPOINTs isolate failures without aborting the batch.
    """

    def __init__(self, dsn: str):
        import psycopg2

        self._psycopg2 = psycopg2
        self._conn = psycopg2.connect(dsn)
        self._conn.autocommit = False

    def _q(self, sql: str, params: tuple = ()) -> list[dict]:
        from psycopg2.extras import RealDictCursor

        with self._conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            try:
                return [dict(r) for r in cur.fetchall()]
            except Exception:
                return []

    def get_hash(self, canonical_key: str) -> Optional[str]:
        rows = self._q("SELECT content_hash FROM standards WHERE canonical_key=%s",
                       (canonical_key,))
        return rows[0]["content_hash"] if rows else None

    def get_record(self, canonical_key: str) -> Optional[dict]:
        rows = self._q("SELECT * FROM standards WHERE canonical_key=%s", (canonical_key,))
        return rows[0] if rows else None

    def snapshot_hashes(self) -> dict[str, str]:
        return {r["canonical_key"]: r["content_hash"]
                for r in self._q("SELECT canonical_key, content_hash FROM standards")}

    def upsert_standard(self, canonical: dict) -> str:
        from psycopg2.extras import Json  # noqa: F401 (kept for future JSONB cols)

        with self._conn.cursor() as cur:
            cur.execute("SAVEPOINT rec")
            try:
                cur.execute("SELECT content_hash, extraction_confidence FROM standards"
                            " WHERE canonical_key=%s", (canonical["canonical_key"],))
                row = cur.fetchone()
                if row is None:
                    cur.execute(
                        """INSERT INTO standards (canonical_key, is_number, raw_designation,
                                title, title_hindi, year, status, tier, division, ministry,
                                department, department_name, grp, aspect,
                                degree_of_equivalence, scope, latest_version_label,
                                superseded_by, content_hash, extraction_confidence)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (canonical["canonical_key"], canonical.get("is_number"),
                         canonical.get("raw_designation"), canonical.get("title"),
                         canonical.get("title_hindi"), canonical.get("year"),
                         canonical.get("status", "current"), canonical.get("tier", "catalogue"),
                         canonical.get("division"), canonical.get("ministry"),
                         canonical.get("department"), canonical.get("department_name"),
                         canonical.get("grp"), canonical.get("aspect"),
                         canonical.get("degree_of_equivalence"), canonical.get("scope"),
                         canonical.get("latest_version_label"), canonical.get("superseded_by"),
                         canonical.get("content_hash", ""), canonical.get("extraction_confidence", 0)),
                    )
                    cur.execute("RELEASE SAVEPOINT rec")
                    self._conn.commit()
                    return "inserted"
                if row[0] == canonical.get("content_hash"):
                    cur.execute("UPDATE standards SET last_seen=NOW() WHERE canonical_key=%s",
                                (canonical["canonical_key"],))
                    cur.execute("RELEASE SAVEPOINT rec")
                    self._conn.commit()
                    return "unchanged"
                # Weaker source never overwrites: compare confidence in Python.
                from pipeline.db.canonical_loader import merge_records

                stored = self.get_record(canonical["canonical_key"]) or {}
                merged = merge_records(stored, canonical)
                cur.execute(
                    """UPDATE standards SET title=COALESCE(%s,title), scope=COALESCE(%s,scope),
                            status=%s, superseded_by=COALESCE(%s,superseded_by),
                            content_hash=%s, extraction_confidence=GREATEST(%s,extraction_confidence),
                            division=COALESCE(%s,division), department=COALESCE(%s,department),
                            updated_at=NOW(), last_seen=NOW()
                       WHERE canonical_key=%s""",
                    (merged.get("title"), merged.get("scope"), merged.get("status", "current"),
                     merged.get("superseded_by"), merged.get("content_hash", ""),
                     merged.get("extraction_confidence", 0), merged.get("division"),
                     merged.get("department"), canonical["canonical_key"]),
                )
                cur.execute("RELEASE SAVEPOINT rec")
                self._conn.commit()
                return "updated"
            except Exception:
                with self._conn.cursor() as rb:
                    rb.execute("ROLLBACK TO SAVEPOINT rec")
                self._conn.commit()
                raise

    def replace_relations(self, canonical_key: str, rows: list[dict]) -> None:
        with self._conn.cursor() as cur:
            cur.execute("SELECT id FROM standards WHERE canonical_key=%s", (canonical_key,))
            found = cur.fetchone()
            if not found:
                return
            sid = found[0]
            cur.execute("DELETE FROM standard_relations WHERE source_id=%s", (sid,))
            for row in rows:
                cur.execute(
                    "INSERT INTO standard_relations (source_id, target_key, ref_type, hop)"
                    " VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                    (sid, row["target_key"], row.get("ref_type", "related_product"),
                     row.get("hop", 1)),
                )
        self._conn.commit()

    def add_versions(self, rows: list[dict]) -> int:
        added = 0
        with self._conn.cursor() as cur:
            for row in rows:
                cur.execute("SELECT id FROM standards WHERE canonical_key=%s",
                            (row["canonical_key"],))
                found = cur.fetchone()
                if not found:
                    continue
                cur.execute(
                    """INSERT INTO standard_versions
                       (standard_id, canonical_key, year, amendment_no, scope, source_url,
                        content_hash, superseded_by, published_on, valid_upto)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
                    (found[0], row["canonical_key"], row.get("year"),
                     row.get("amendment_no", ""), row.get("scope"), row.get("source_url", ""),
                     row.get("content_hash", ""), row.get("superseded_by"),
                     row.get("published_on"), row.get("valid_upto")),
                )
                added += cur.rowcount
        self._conn.commit()
        return added

    def add_source(self, canonical_key: str, source_type: str, source_url: str,
                   confidence: float, content_hash: str) -> None:
        with self._conn.cursor() as cur:
            cur.execute("SELECT id FROM standards WHERE canonical_key=%s", (canonical_key,))
            found = cur.fetchone()
            if not found:
                return
            cur.execute(
                """INSERT INTO sources
                   (standard_id, canonical_key, source_type, source_url,
                    extraction_confidence, content_hash) VALUES (%s,%s,%s,%s,%s,%s)""",
                (found[0], canonical_key, source_type, source_url or "",
                 confidence, content_hash),
            )
        self._conn.commit()

    def write_audit(self, canonical_key: str, change_type: str,
                    old: Optional[dict], new: Optional[dict]) -> None:
        with self._conn.cursor() as cur:
            cur.execute(
                "INSERT INTO audit_logs (canonical_key, change_type, old_values, new_values)"
                " VALUES (%s,%s,%s,%s)",
                (canonical_key, change_type, json.dumps(old or {}), json.dumps(new or {})),
            )
        self._conn.commit()

    def enqueue_review(self, canonical_key: Optional[str], raw: dict,
                       reason: str, confidence: float) -> str:
        rid = str(uuid.uuid4())
        with self._conn.cursor() as cur:
            cur.execute(
                "INSERT INTO review_queue (id, canonical_key, raw_payload, reason, confidence)"
                " VALUES (%s,%s,%s,%s,%s)",
                (rid, canonical_key, json.dumps(raw), reason, confidence),
            )
        self._conn.commit()
        return rid

    def list_reviews(self, status: str = "pending") -> list[dict]:
        return self._q("SELECT * FROM review_queue WHERE status=%s ORDER BY created_at DESC",
                       (status,))

    def resolve_review(self, review_id: str, decision: str) -> Optional[dict]:
        with self._conn.cursor() as cur:
            cur.execute("UPDATE review_queue SET status=%s, resolved_at=NOW() WHERE id=%s",
                        (decision, review_id))
        self._conn.commit()
        rows = self._q("SELECT * FROM review_queue WHERE id=%s", (review_id,))
        return rows[0] if rows else None

    def record_run(self, metrics: dict) -> dict:
        with self._conn.cursor() as cur:
            cur.execute(
                """INSERT INTO ingestion_runs
                   (mode, source, finished_at, attempted, inserted, updated,
                    skipped_unchanged, failed, queued_review, errors, healthy)
                   VALUES (%s,%s,NOW(),%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (metrics.get("mode", "backfill"), metrics.get("source", "unknown"),
                 metrics.get("attempted", 0), metrics.get("inserted", 0),
                 metrics.get("updated", 0), metrics.get("skipped_unchanged", 0),
                 metrics.get("failed", 0), metrics.get("queued_review", 0),
                 json.dumps(metrics.get("errors", [])), metrics.get("healthy")),
            )
            rid = cur.fetchone()[0]
        self._conn.commit()
        return {**metrics, "id": str(rid)}

    def close(self) -> None:
        try:
            self._conn.close()
        except Exception:
            pass
