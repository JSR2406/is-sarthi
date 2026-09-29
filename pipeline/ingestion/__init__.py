"""Phase 2 bulk ingestion package (additive).

Stages: source discovery -> raw fetch -> metadata extraction -> text
enrichment -> normalization -> deduplication -> version resolution ->
relation extraction -> certification extraction -> PostgreSQL load ->
audit logging -> incremental delta sync.

Nothing here touches the live recommend/validate paths. The runner writes
only the Phase-1 canonical tables (standards, standard_versions,
standard_relations, sources, audit_logs, ingestion_runs, review_queue).
"""
from pipeline.ingestion.loader import BatchLoader, LoadMetrics
from pipeline.ingestion.parsers import parse_bis_catalogue_row, parse_seed_record
from pipeline.ingestion.stages import enrich_record, extract_metadata


def run_ingestion(*args, **kwargs):
    """Lazy entry point (keeps `py -m pipeline.ingestion.runner` warning-free)."""
    from pipeline.ingestion.runner import run as _run

    return _run(*args, **kwargs)


__all__ = [
    "BatchLoader", "LoadMetrics", "parse_bis_catalogue_row",
    "parse_seed_record", "extract_metadata", "enrich_record", "run_ingestion",
]
