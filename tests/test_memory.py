"""Conversation memory tests.

resolve_followup() must rewrite only genuine follow-ups; standalone queries
must pass through untouched so retrieval is never contaminated by stale
context. memory_summary() must trim, never crash on malformed input.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.services.memory import (
    is_followup,
    last_cited_standard,
    last_substantive_query,
    memory_summary,
    resolve_followup,
)


def _history():
    return [
        {"role": "user", "content": "Which standard applies to 3-core armoured copper cable for 1100V underground laying?"},
        {"role": "assistant", "content": "Based on the BIS corpus, the closest match is **IS 1554-1** — PVC Insulated Cables."},
        {"role": "user", "content": "what about its amendments?"},
    ]


class TestFollowupDetection:
    def test_pronoun_followup_detected(self):
        assert is_followup("what about its amendments?", _history()) is True

    def test_short_pronoun_followup_detected(self):
        assert is_followup("is that mandatory?", _history()) is True

    def test_leading_marker_detected(self):
        assert is_followup("tell me more", _history()) is True

    def test_standalone_query_not_followup(self):
        msg = "Which standard applies to XLPE cables up to 1100V for underground use?"
        assert is_followup(msg, _history()) is False

    def test_no_history_never_followup(self):
        assert is_followup("what about it?", []) is False
        assert is_followup("what about it?", None) is False

    def test_current_message_duplicate_is_ignored(self):
        # history containing only the current message must not count as prior turns
        solo = [{"role": "user", "content": "what about its amendments?"}]
        assert is_followup("what about its amendments?", solo) is False


class TestResolution:
    def test_followup_rewritten_with_context(self):
        resolved, was = resolve_followup("what about its amendments?", _history())
        assert was is True
        assert "3-core armoured copper cable" in resolved
        assert "IS 1554-1" in resolved
        assert "what about its amendments?" in resolved

    def test_standalone_passes_through(self):
        msg = "Which standard applies to XLPE cables up to 1100V for underground use?"
        resolved, was = resolve_followup(msg, _history())
        assert was is False
        assert resolved == msg

    def test_empty_message_safe(self):
        resolved, was = resolve_followup("", _history())
        assert was is False
        assert resolved == ""


class TestHelpers:
    def test_last_substantive_query_skips_fragments(self):
        hist = _history() + [
            {"role": "assistant", "content": "IS 1554-1 amendments."},
            {"role": "user", "content": "and tests?"},
        ]
        assert "3-core armoured copper cable" in last_substantive_query(hist)

    def test_last_cited_standard(self):
        assert last_cited_standard(_history()) == "IS 1554-1"
        assert last_cited_standard([]) is None

    def test_memory_summary_trims_and_orders(self):
        hist = _history() + [{"role": "user", "content": "ok"}]
        summary = memory_summary(hist, max_turns=2)
        assert len(summary) == 2
        # oldest-first ordering of the trailing window
        assert summary[0]["content"] == "what about its amendments?"
        assert summary[1]["content"] == "ok"
        assert all(t["role"] in ("user", "assistant") for t in summary)

    def test_memory_summary_tolerates_garbage(self):
        assert memory_summary(None) == []
        assert memory_summary([{"role": "tool", "content": "x"}, None, 42]) == []
