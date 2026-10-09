"""
Conversational memory for the Standards Assistant (AI copilot).

The chat endpoint historically ignored the `history` field it accepted: every
message was retrieved in isolation, so a follow-up like "what tests apply to
it?" searched for the literal word "it" and usually found nothing — and the
answer could not refer back to what had already been established in the
conversation.

This module turns history into two cheap, deterministic capabilities:

1. Follow-up resolution — when a message is clearly a follow-up (pronoun-led,
   short, or explicitly referencing the previous turn), the retrieval/web
   query is rewritten to carry the last substantive user query and the last
   cited IS standard. Retrieval then has the referent it needs.

2. Prompt memory — a trimmed transcript of recent turns for any downstream
   consumer (answer builder, future LLM path) that needs conversational state.

Heuristics only, no LLM: the system must keep working in the stub/on-premise
path where no model is configured, and deterministic rewriting is testable.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

# Leading phrases that mark a follow-up regardless of length.
_FOLLOWUP_START = re.compile(
    r"""^(what about|how about|and\b|is (it|that|this|there)\b|does (it|that|this)\b|"""
    r"""will (it|that|this)\b|why (is|are|does|do|did)\b|how (do|does|can|would)\b|"""
    r"""tell me|more detail|continue\b|elaborate\b|also\b|same\b|"""
    r"""the (above|previous|former|earlier)\b|that (one|standard)\b|those\b|these\b|"""
    r"""it['’]?s\b|its\b|their\b|there\b)""",
    re.IGNORECASE,
)

# Pronouns that only resolve against prior context; meaningful in short messages.
_PRONOUN = re.compile(
    r"\b(it|it's|its|they|them|their|this|that|these|those|above|previous|former|same)\b",
    re.IGNORECASE,
)

_IS_REF = re.compile(r"\bIS\s*\d+(?:-\d+)?(?::\d{4})?\b", re.IGNORECASE)

# A prior user turn shorter than this is itself probably a follow-up fragment.
_SUBSTANTIVE_MIN_CHARS = 30


def _turns(history: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    return [
        t
        for t in (history or [])
        if isinstance(t, dict)
        and t.get("role") in ("user", "assistant")
        and isinstance(t.get("content"), str)
        and t["content"].strip()
    ]


def _prior_history(
    history: Optional[List[Dict[str, Any]]], message: str
) -> List[Dict[str, Any]]:
    """Drop a trailing duplicate of the current message (defensive: some
    callers include it)."""
    turns = _turns(history)
    if turns and turns[-1]["role"] == "user" and turns[-1]["content"].strip() == (message or "").strip():
        turns = turns[:-1]
    return turns


def is_followup(message: str, history: Optional[List[Dict[str, Any]]]) -> bool:
    """True when `message` only makes sense with prior turns."""
    turns = _prior_history(history, message)
    if not turns:
        return False
    msg = (message or "").strip()
    if not msg:
        return False
    if _FOLLOWUP_START.search(msg):
        return True
    # Short pronoun-bearing messages ("and its amendments?", "is that mandatory?")
    # are follow-ups even without a leading marker.
    if len(msg) <= 60 and _PRONOUN.search(msg):
        return True
    return False


def last_substantive_query(history: Optional[List[Dict[str, Any]]]) -> str:
    """Most recent user turn with enough content to stand as retrieval context."""
    turns = _prior_history(history, "")
    user_turns = [t["content"].strip() for t in turns if t["role"] == "user"]
    if not user_turns:
        return ""
    for content in reversed(user_turns):
        if len(content) >= _SUBSTANTIVE_MIN_CHARS:
            return content
    # Chain of fragments — fall back to the most recent user turn regardless.
    return user_turns[-1]


def last_cited_standard(history: Optional[List[Dict[str, Any]]]) -> Optional[str]:
    """First IS reference in the most recent assistant answer (the topic under
    discussion)."""
    turns = _prior_history(history, "")
    for turn in reversed(turns):
        if turn["role"] == "assistant":
            match = _IS_REF.search(turn["content"])
            if match:
                return re.sub(r"\s+", " ", match.group(0)).strip()
            return None
    return None


def resolve_followup(
    message: str, history: Optional[List[Dict[str, Any]]]
) -> Tuple[str, bool]:
    """
    Rewrite a follow-up into a self-contained retrieval query.

    Returns (resolved_query, was_followup). Non-follow-ups return the message
    untouched so standalone queries are never contaminated by stale context.
    """
    msg = (message or "").strip()
    if not msg:
        return msg, False
    if not is_followup(msg, history):
        return msg, False

    prior = _prior_history(history, msg)
    prev_query = last_substantive_query(prior)
    cited = last_cited_standard(prior)

    pieces: List[str] = []
    if prev_query:
        pieces.append(prev_query)
    combined = " ".join(pieces)
    if cited and cited.lower() not in msg.lower() and cited.lower() not in combined.lower():
        pieces.append(cited)
    if not pieces:
        return msg, False

    return f"{' | '.join(pieces)} | Follow-up: {msg}", True


def memory_summary(
    history: Optional[List[Dict[str, Any]]], max_turns: int = 6
) -> List[Dict[str, str]]:
    """Recent turns, trimmed, oldest first — a compact conversational record."""
    turns = _prior_history(history, "")
    return [
        {"role": t["role"], "content": t["content"].strip()[:1000]}
        for t in turns[-max_turns:]
    ]
