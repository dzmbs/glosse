"""
Tool functions exposed to the Codex agent.

The agent does NOT read the book directly — it goes through these tools.
That gives us one place to enforce the spoiler boundary, log what the
agent actually looked at, and swap the retrieval backend later.

Each tool here is a plain Python function. The engine dev wires them into
the Codex/OpenAI Agents SDK in `agent.py` (via whatever tool-registration
mechanism ends up being used — function calling, the Agents SDK, etc).
"""

from __future__ import annotations

from typing import List, Optional

from glosse.engine import retrieval
from glosse.engine.models import Chunk
from glosse.engine.storage import load_book


# --- Tool: retrieve_safe_chunks ------------------------------------------


def retrieve_safe_chunks(
    book_id: str,
    progress: int,
    query: str,
    k: int = 6,
) -> List[dict]:
    """
    Return up to `k` passages from the book relevant to `query`, never
    including any chapter beyond `progress`.

    Returns a JSON-safe list of dicts for the agent to consume directly.
    """
    chunks = retrieval.retrieve_safe_chunks(book_id, progress, query, k=k)
    return [_chunk_to_dict(c) for c in chunks]


# --- Tool: get_current_passage -------------------------------------------


def get_current_passage(book_id: str, chapter_index: int) -> Optional[dict]:
    """
    Return the user's current chapter as `{title, chapter_index, text}`.
    """
    book = load_book(book_id)
    if not book or not (0 <= chapter_index < len(book.spine)):
        return None
    ch = book.spine[chapter_index]
    return {
        "title": ch.title,
        "chapter_index": ch.order,
        "text": ch.text,
    }


# --- Tool: get_prior_concepts (STUB) -------------------------------------


def get_prior_concepts(book_id: str, progress: int) -> List[dict]:  # pragma: no cover
    """
    Return concepts / entities that have been introduced in chapters 0..progress.

    TODO(engine): implement once the chunker emits entity / concept tags.
    For now, return an empty list so the agent degrades gracefully.
    """
    return []


# --- Tool: detect_spoiler_risk (STUB) ------------------------------------


def detect_spoiler_risk(
    book_id: str,
    progress: int,
    question: str,
) -> dict:  # pragma: no cover
    """
    Heuristic: would answering this question require material past `progress`?

    TODO(engine): a small classifier call, or keyword-based rules
    ("the ending", "how does it end", "does X die", etc.).
    Return shape: {"risk": "low" | "medium" | "high", "reason": str}
    """
    return {"risk": "low", "reason": "stub — not implemented"}


# --- Helpers -------------------------------------------------------------


def _chunk_to_dict(c: Chunk) -> dict:
    return {
        "chunk_id": c.chunk_id,
        "chapter_index": c.chapter_index,
        "section_path": c.section_path,
        "text": c.text,
    }


# --- Tool schemas (for registering with the Codex / Agents SDK) ----------
# The engine dev should translate these into whatever shape the SDK expects.
# Keeping them here as plain dicts so the server-side router can dispatch
# tool calls without importing the SDK.

TOOL_SCHEMAS: List[dict] = [
    {
        "name": "retrieve_safe_chunks",
        "description": (
            "Retrieve passages from the book that are relevant to the query. "
            "Results never include chapters past the user's current reading "
            "position. Always call this before making claims about what the "
            "book says."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "k": {"type": "integer", "default": 6},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_current_passage",
        "description": "Return the text of the chapter the user is currently on.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "detect_spoiler_risk",
        "description": (
            "Check whether answering a question would require content past "
            "the user's current reading position."
        ),
        "parameters": {
            "type": "object",
            "properties": {"question": {"type": "string"}},
            "required": ["question"],
        },
    },
]
