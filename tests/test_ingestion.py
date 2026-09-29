"""Phase 2 ingestion tests (DB-optional: InMemoryCanonicalStore).

Covers the validation contract: dedupe, idempotent reruns, failure
isolation, source-sample fidelity, delta sync, review capture, metrics,
traceability, weak-source protection, batching, and the review workflow.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.ingestion import (
    enrich_record,
    extract_metadata,
    parse_bis_catalogue_row,
    parse_seed_record,
)
from pipeline.ingestion.loader import BatchLoader
from pipeline.ingestion.review import approve, list_pending, reject, summary
from pipeline.ingestion.store import InMemoryCanonicalStore

SEED_SAMPLE = {
    "is_number": "IS 1554-1", "title": "PVC Insulated Cables", "year": 1988,
    "status": "current", "division": "ETD", "scope": "Covers cables.",
    "normative_references": ["IS 8130"], "amendments": [{"number": "1", "date": "1993"}],
    "certification": {"scheme": "ISI", "mandatory": True},
    "extraction_quality": 0.95, "sources": ["seed"],
}

CAT_SAMPLE = {
    "is_number": "IS 10069:2017", "title": "Hydraulic fluid power",
    "withdrawn": True, "withdraw_status": 1, "department_alias": "MED",
    "department_name": "Mechanical", "published_on": "2017-03-31",
    "valid_upto": "2022-03-31", "source": "BIS Know Your Standard",
    "source_url": None, "standard_id": 662,
}


def _seed_loader(store=None, **kw):
    kw.setdefault("confidence_floor", 0.0)  # tests control review gating explicitly
    return BatchLoader(store or InMemoryCanonicalStore(), source_kind="seed", **kw)


class TestParsers:
    def test_seed_parser_keeps_rich_fields(self):
        parsed = parse_seed_record(SEED_SAMPLE)
        assert parsed["scope"] == "Covers cables."
        assert parsed["normative_references"] == ["IS 8130"]
        assert parsed["certification"]["scheme"] == "ISI"

    def test_catalogue_parser_never_fabricates(self):
        parsed = parse_bis_catalogue_row(CAT_SAMPLE)
        assert parsed["scope"] is None
        assert parsed["normative_references"] == []
        assert parsed["certification"] is None
        assert parsed["status"] == "withdrawn"

    def test_catalogue_sample_matches_source(self):
        parsed = parse_bis_catalogue_row(CAT_SAMPLE)
        assert parsed["is_number"] == "IS 10069:2017"
        assert parsed["published_on"] == "2017-03-31"


class TestStageSeparation:
    def test_metadata_has_no_enrichment_fields(self):
        skel = extract_metadata(SEED_SAMPLE, "seed")
        assert skel["canonical_key"] == "IS 1554-1"
        assert "scope" not in skel
        assert "_references" not in skel

    def test_enrichment_attaches_scope_and_hash(self):
        skel = enrich_record(extract_metadata(SEED_SAMPLE, "seed"),
                             {"scope": "Covers cables.",
                              "normative_references": ["IS 8130"]})
        assert skel["content_hash"]
        assert skel["_references"] == ["IS 8130"]

    def test_unresolvable_never_raises(self):
        skel = extract_metadata({"is_number": "???", "title": "x"}, "seed")
        assert skel["_unresolvable"] == "ambiguous_number"


class TestLoader:
    def test_insert_and_traceability(self):
        store = InMemoryCanonicalStore()
        metrics = _seed_loader(store).load([SEED_SAMPLE])
        assert metrics.inserted == 1
        assert store.get_record("IS 1554-1")["title"] == "PVC Insulated Cables"
        assert len(store.versions) >= 2  # base + 1 amendment
        assert any(r["target_key"] == "IS 8130" for r in store.relations)
        assert any(s["canonical_key"] == "IS 1554-1" for s in store.sources)
        assert store.audit[0]["change_type"] == "insert"

    def test_duplicate_detection_and_idempotent_rerun(self):
        store = InMemoryCanonicalStore()
        loader = _seed_loader(store)
        first = loader.load([SEED_SAMPLE])
        second = loader.load([SEED_SAMPLE])
        assert (first.inserted, first.skipped_unchanged) == (1, 0)
        assert (second.inserted, second.skipped_unchanged) == (0, 1)
        assert len(store.standards) == 1

    def test_failed_rows_isolated_not_destructive(self):
        store = InMemoryCanonicalStore()
        metrics = _seed_loader(store).load([SEED_SAMPLE, None, SEED_SAMPLE])
        assert metrics.failed == 1
        assert metrics.inserted == 1  # good rows still landed
        assert len(metrics.errors) == 1

    def test_malformed_go_to_review_never_dropped(self):
        store = InMemoryCanonicalStore()
        metrics = _seed_loader(store).load([
            {"is_number": "???", "title": "mystery"},
            {"is_number": "IS 9999", "title": ""},
        ])
        assert metrics.queued_review == 2
        assert metrics.inserted == 0
        assert len(store.list_reviews("pending")) == 2

    def test_low_confidence_gated_to_review(self):
        store = InMemoryCanonicalStore()
        weak = dict(SEED_SAMPLE, extraction_quality=0.1)
        loader = BatchLoader(store, source_kind="seed", confidence_floor=0.35)
        metrics = loader.load([weak])
        assert metrics.queued_review == 1 and metrics.inserted == 0
        assert store.list_reviews("pending")[0]["reason"] == "low_confidence"

    def test_delta_sync_updates_only_changed(self):
        store = InMemoryCanonicalStore()
        other = {**SEED_SAMPLE, "is_number": "IS 269", "title": "Cement",
                 "scope": "Cement scope."}
        _seed_loader(store).load([SEED_SAMPLE, other])
        changed = dict(SEED_SAMPLE, scope="Covers cables up to 1100V.")
        same_other = dict(other)
        loader = _seed_loader(store, mode="delta")
        metrics = loader.load([changed, same_other],
                              changes_only=store.snapshot_hashes())
        # changed flows through as update; untouched key pre-filtered as skipped
        assert metrics.updated == 1
        assert metrics.skipped_unchanged == 1
        assert store.get_record("IS 1554-1")["scope"] == "Covers cables up to 1100V."

    def test_weak_source_never_overwrites(self):
        store = InMemoryCanonicalStore()
        _seed_loader(store).load([SEED_SAMPLE])
        weak_twin = {"is_number": "IS 1554-1", "title": "PVC Insulated Cables",
                     "division": None, "extraction_quality": 0.4}
        loader = BatchLoader(store, source_kind="bis_catalogue", confidence_floor=0.0)
        loader.load([weak_twin])
        assert store.get_record("IS 1554-1")["scope"] == "Covers cables."

    def test_batching_and_metrics(self):
        store = InMemoryCanonicalStore()
        rows = [{**SEED_SAMPLE, "is_number": f"IS {1000 + i}"} for i in range(7)]
        metrics = BatchLoader(store, source_kind="seed", batch_size=3,
                              confidence_floor=0.0).load(rows)
        assert metrics.attempted == 7 and metrics.inserted == 7
        run = store.runs[-1]
        assert run["attempted"] == 7 and run["healthy"] is True


class TestReviewWorkflow:
    def test_approve_reingests_and_reject_closes(self):
        store = InMemoryCanonicalStore()
        BatchLoader(store, source_kind="seed", confidence_floor=0.35).load(
            [dict(SEED_SAMPLE, extraction_quality=0.1)])
        pending = list_pending(store)
        assert len(pending) == 1
        out = approve(store, pending[0]["id"], reviewer="qa")
        assert out["metrics"]["inserted"] == 1
        assert store.get_record("IS 1554-1") is not None

        BatchLoader(store, source_kind="seed", confidence_floor=0.35).load(
            [dict(SEED_SAMPLE, is_number="IS 9999-1", extraction_quality=0.1)])
        pending2 = list_pending(store)
        reject(store, pending2[0]["id"], reviewer="qa", note="out of scope")
        assert summary(store) == {"pending": 0, "approved": 1, "rejected": 1}
