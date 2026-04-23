"""
Spoiler-aware retrieval.

This is the heart of the glosse product, so the filter logic is implemented
here even though the semantic-ranking half is a stub.

The public entry point is:

    retrieve_safe_chunks(book_id, progress, query, k) -> list[Chunk]

Contract:

1. NEVER returns a chunk whose `chapter_index > progress`. This is the
   spoiler boundary. It is enforced here, once, so the agent can't bypass it.
2. Among the safe set, returns the top `k` by semantic similarity to `query`.
3. If no embeddings are available yet (chunking/embeddings not run), falls
   back to a lexical match so the UI still works during development.
"""

from __future__ import annotations

import math
import re
from typing import List

from glosse.engine.models import Chunk
from glosse.engine.storage import load_chunks


# --- Spoiler filter -------------------------------------------------------


def spoiler_filter(chunks: List[Chunk], progress: int) -> List[Chunk]:
    """Return only chunks the reader has already reached."""
    return [c for c in chunks if c.chapter_index <= progress]


# --- Ranking --------------------------------------------------------------


def _cosine(a: List[float], b: List[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


_WORD_RE = re.compile(r"[a-z0-9]+")
_STOP_WORDS = {"what", "is", "the", "a", "an", "to", "of", "in", "for", "on", "with", "as", "by", "at", "and", "or", "how", "why", "who", "where", "when", "does", "did", "do", "are", "was", "were", "it", "this", "that", "these", "those", "be", "can", "could", "would", "should"}
_PRIOR_CONTEXT_SIGNALS = (
    "earlier",
    "before",
    "previous",
    "prior",
    "so far",
    "up to now",
    "until now",
    "recap",
    "context",
    "introduced",
    "again",
    "remind",
    "what do we know",
)

def _lexical_score(query: str, text: str) -> float:
    """Crude overlap score used only when embeddings are unavailable."""
    q_terms = set(_WORD_RE.findall(query.lower()))
    meaningful_q_terms = q_terms - _STOP_WORDS
    if meaningful_q_terms:
        q_terms = meaningful_q_terms

    if not q_terms:
        return 0.0
    t_terms = _WORD_RE.findall(text.lower())
    if not t_terms:
        return 0.0
    hits = sum(1 for t in t_terms if t in q_terms)
    return hits / math.sqrt(len(t_terms))


def _rank_chunks(query: str, chunks: List[Chunk]) -> List[Chunk]:
    if not chunks:
        return []

    have_embeddings = any(c.embedding for c in chunks)
    if not have_embeddings:
        scored = [(c, _lexical_score(query, c.text)) for c in chunks]
        scored.sort(key=lambda x: x[1], reverse=True)
        return [c for c, _score in scored]

    # Prefer semantic ranking if we have embeddings on both sides.
    try:
        from glosse.engine.embeddings import embed_query  # deferred import

        q_vec = embed_query(query)
    except Exception:
        q_vec = None

    if q_vec is not None:
        scored = [
            (c, _cosine(q_vec, c.embedding or []))
            for c in chunks
        ]
    else:
        scored = [(c, _lexical_score(query, c.text)) for c in chunks]

    scored.sort(key=lambda x: x[1], reverse=True)
    return [c for c, _score in scored]


def wants_prior_context(query: str) -> bool:
    """Return true when the user's wording invites earlier-chapter context."""
    lower = query.lower()
    return any(signal in lower for signal in _PRIOR_CONTEXT_SIGNALS)


# --- Public API -----------------------------------------------------------


def retrieve_safe_chunks(
    book_id: str,
    progress: int,
    query: str,
    k: int = 6,
) -> List[Chunk]:
    """
    Retrieve up to `k` chunks relevant to `query`, never leaking chapters
    past `progress`.

    If embeddings are present, ranks by cosine similarity to the query
    embedding. If not, falls back to a lexical score so the agent still
    gets *something* while the engine dev is wiring up embeddings.
    """
    all_chunks = load_chunks(book_id)
    safe = spoiler_filter(all_chunks, progress)
    if not safe:
        return []

    return _rank_chunks(query, safe)[:k]


def retrieve_chapter_scoped_chunks(
    book_id: str,
    progress: int,
    current_chapter_index: int,
    query: str,
    k: int = 6,
    include_prior: bool | None = None,
) -> List[Chunk]:
    """
    Retrieve chunks for the guide panel's current reading window.

    The displayed chapter is the primary scope. Prior chapters are included
    only when the query explicitly asks for continuity/context, and future
    chapters relative to either progress or the displayed chapter are excluded.
    """
    all_chunks = load_chunks(book_id)
    boundary = min(progress, current_chapter_index)
    safe = [c for c in all_chunks if c.chapter_index <= boundary]
    if not safe:
        return []

    current = [c for c in safe if c.chapter_index == current_chapter_index]
    if include_prior is None:
        include_prior = wants_prior_context(query)

    if not include_prior:
        return _rank_chunks(query, current)[:k]

    prior = [c for c in safe if c.chapter_index < current_chapter_index]
    ranked_current = _rank_chunks(query, current)
    ranked_prior = _rank_chunks(query, prior)
    current_quota = min(len(ranked_current), max(1, k // 2))
    out = ranked_current[:current_quota]
    out.extend(ranked_prior[: max(0, k - len(out))])
    if len(out) < k:
        seen = {c.chunk_id for c in out}
        out.extend(c for c in ranked_current[current_quota:] if c.chunk_id not in seen)
    return out[:k]
