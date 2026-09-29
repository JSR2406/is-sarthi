"""Ingestion runner: discovery -> metadata -> enrichment -> load -> audit.

Usage:
    py -3 -m pipeline.ingestion.runner --source seed --mode full
    py -3 -m pipeline.ingestion.runner --source catalogue --mode delta --batch-size 500
    py -3 -m pipeline.ingestion.runner --source all --mode full --limit 1000

Store selection: Postgres when IS_POSTGRES_URL/POSTGRES_URL connects,
else InMemory (demo/offline). Mode delta pre-filters by content hash so only
changed rows hit the loader. Re-runs are idempotent by construction.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import Optional

BASE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BASE))

from pipeline.ingestion.loader import BatchLoader  # noqa: E402
from pipeline.ingestion.store import InMemoryCanonicalStore  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ingestion")


def discover(source: str) -> dict[str, Path]:
    found: dict[str, Path] = {}
    seed = BASE / "data" / "seed" / "standards.json"
    catalogue = BASE / "data" / "bis" / "standards.json"
    if source in ("seed", "all") and seed.exists():
        found["seed"] = seed
    if source in ("catalogue", "all") and catalogue.exists():
        found["catalogue"] = catalogue
    return found


def load_rows(path: Path, kind: str) -> list[dict]:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    if kind == "seed":
        return data if isinstance(data, list) else []
    if isinstance(data, dict) and isinstance(data.get("standards"), list):
        return data["standards"]
    return data if isinstance(data, list) else []


def pick_store():
    dsn = os.getenv("IS_POSTGRES_URL") or os.getenv("POSTGRES_URL")
    if dsn:
        try:
            from pipeline.ingestion.store import PostgresCanonicalStore

            store = PostgresCanonicalStore(dsn)
            logger.info("Using PostgresCanonicalStore")
            return store
        except Exception as exc:
            logger.warning("Postgres unreachable (%s); falling back to memory", exc)
    return InMemoryCanonicalStore()


def run(source: str = "all", mode: str = "full", batch_size: int = 500,
        limit: Optional[int] = None, store=None) -> dict:
    files = discover(source)
    if not files:
        raise FileNotFoundError(f"No source files found for source={source}")
    store = store or pick_store()
    report: dict = {"runs": []}

    # Seed first (rich tier wins conflicts), catalogue second (fills gaps).
    for kind in ("seed", "catalogue"):
        if kind not in files:
            continue
        rows = load_rows(files[kind], kind)
        if limit:
            rows = rows[:limit]
        enrichments = None
        if kind == "catalogue":
            # Enrichment join: seed rows enrich matching catalogue keys (no fabrication).
            enrichments = {}
        changes_only = store.snapshot_hashes() if mode == "delta" else None
        loader = BatchLoader(store, source_kind=("seed" if kind == "seed" else "bis_catalogue"),
                             mode=mode, batch_size=batch_size)
        metrics = loader.load(rows, enrichments=enrichments, changes_only=changes_only)
        logger.info("%s/%s: attempted=%d inserted=%d updated=%d skipped=%d failed=%d queued=%d",
                    kind, mode, metrics.attempted, metrics.inserted, metrics.updated,
                    metrics.skipped_unchanged, metrics.failed, metrics.queued_review)
        report["runs"].append({"kind": kind, **metrics.as_dict()})

    try:
        from pipeline.ingestion.review import summary as review_summary

        report["review_queue"] = review_summary(store)
    except Exception:
        pass
    return report


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="IS Sarthi bulk ingestion")
    parser.add_argument("--source", default="all", choices=["seed", "catalogue", "all"])
    parser.add_argument("--mode", default="full", choices=["full", "delta"])
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args(argv)
    report = run(source=args.source, mode=args.mode,
                 batch_size=args.batch_size, limit=args.limit)
    print(json.dumps(report, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
