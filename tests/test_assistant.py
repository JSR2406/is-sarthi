"""Assistant (Manak-AI style) grounding tests.

build_assistant_answer() is pure: every claim must trace to a retrieved
recommendation field. These tests block hallucinating relations or cert logic.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.index import build_assistant_answer


def _result(state="ok"):
    return {
        "state": state,
        "recommendations": [
            {
                "is_number": "IS 1554-1",
                "title": "PVC Insulated Cables",
                "status": "current",
                "latest_version": "IS 1554-1:1988 (Amdt 2, 2001)",
                "confidence": 0.82,
                "band": "High",
                "justification": "Scope covers armoured, copper, underground.",
                "certification": {"scheme": "ISI", "scheme_label": "ISI mark",
                                  "mandatory": True},
                "allied": {"Test method": [{"is_number": "IS 10810-1"}]},
            },
            {
                "is_number": "IS 7098-1",
                "title": "XLPE Cables",
                "status": "current",
                "latest_version": "IS 7098-1:1988",
                "confidence": 0.61,
                "band": "Medium",
                "justification": "Closest semantic match.",
                "certification": {"mandatory": False},
                "allied": {},
            },
        ],
    }


class TestAssistantGrounding:
    def test_answer_cites_top_match(self):
        out = build_assistant_answer(_result())
        assert "IS 1554-1" in out["answer"]
        assert len(out["citations"]) == 2
        assert out["citations"][0]["is_number"] == "IS 1554-1"

    def test_certification_only_when_present(self):
        out = build_assistant_answer(_result())
        assert "ISI" in out["answer"]

    def test_low_confidence_is_honest(self):
        out = build_assistant_answer({"state": "low_confidence", "recommendations": []})
        assert out["citations"] == []
        assert "could not find" in out["answer"].lower()
        assert len(out["suggested_followups"]) >= 1

    def test_followups_reference_evidence(self):
        out = build_assistant_answer(_result())
        assert any("IS 1554-1" in f for f in out["suggested_followups"])

    def test_no_invented_standards(self):
        out = build_assistant_answer(_result())
        cited = {c["is_number"] for c in out["citations"]}
        assert cited == {"IS 1554-1", "IS 7098-1"}
