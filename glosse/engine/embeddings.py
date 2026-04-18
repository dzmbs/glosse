"""
Embeddings: Chunk -> Chunk (with embedding populated).

Provider: OpenAI text-embedding-3-small (1536 dims).
Batches in groups of 64 with exponential backoff on 429/5xx.
"""

from __future__ import annotations

import logging
import time
from typing import List

from glosse.engine.models import Chunk

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536
BATCH_SIZE = 64
_MAX_ATTEMPTS = 3

logger = logging.getLogger(__name__)


def _get_client():
    import os
    if not os.environ.get("OPENAI_API_KEY"):
        raise NotImplementedError("OPENAI_API_KEY not set")
    from openai import OpenAI
    return OpenAI()


def _embed_batch(client, texts: List[str], batch_idx: int) -> List[List[float]]:
    from openai import APIConnectionError, APIError, RateLimitError

    for attempt in range(_MAX_ATTEMPTS):
        try:
            resp = client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
            return [item.embedding for item in resp.data]
        except (RateLimitError, APIError, APIConnectionError) as exc:
            status = getattr(exc, "status_code", None)
            retriable = isinstance(exc, (RateLimitError, APIConnectionError)) or status in (
                429,
                500,
                502,
                503,
                504,
            )
            if retriable and attempt < _MAX_ATTEMPTS - 1:
                delay = 2 ** attempt
                logger.warning(
                    "embed batch %d attempt %d/%d failed (%s) — retrying in %ds",
                    batch_idx, attempt + 1, _MAX_ATTEMPTS, exc, delay,
                )
                time.sleep(delay)
            else:
                raise
    raise RuntimeError("unreachable")


def embed_chunks(chunks: List[Chunk]) -> List[Chunk]:
    """Populate each chunk's embedding field in place and return the list."""
    client = _get_client()
    for batch_start in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[batch_start : batch_start + BATCH_SIZE]
        batch_idx = batch_start // BATCH_SIZE
        logger.info("embedding batch %d (%d chunks)", batch_idx, len(batch))
        vectors = _embed_batch(client, [c.text for c in batch], batch_idx)
        for chunk, vec in zip(batch, vectors):
            chunk.embedding = vec
    return chunks


def embed_query(text: str) -> List[float]:
    """Embed a single query string with the same model used for chunks."""
    client = _get_client()
    resp = client.embeddings.create(model=EMBEDDING_MODEL, input=[text])
    return resp.data[0].embedding
