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


def _lexical_score(query: str, text: str) -> float:
    """Crude overlap score used only when embeddings are unavailable."""
    q_terms = set(_WORD_RE.findall(query.lower()))
    if not q_terms:
        return 0.0
    t_terms = _WORD_RE.findall(text.lower())
    if not t_terms:
        return 0.0
    hits = sum(1 for t in t_terms if t in q_terms)
    return hits / math.sqrt(len(t_terms))


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

    # Prefer semantic ranking if we have embeddings on both sides.
    try:
        from glosse.engine.embeddings import embed_query  # deferred import

        q_vec = embed_query(query)
        have_embeddings = any(c.embedding for c in safe)
    except NotImplementedError:
        q_vec = None
        have_embeddings = False

    if q_vec is not None and have_embeddings:
        scored = [
            (c, _cosine(q_vec, c.embedding or []))
            for c in safe
        ]
    else:
        scored = [(c, _lexical_score(query, c.text)) for c in safe]

    scored.sort(key=lambda x: x[1], reverse=True)
    return [c for c, _score in scored[:k]]
