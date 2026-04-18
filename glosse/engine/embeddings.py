"""
Embeddings: Chunk -> Chunk (with embedding populated).

This is a stub. The contract:

1. Input: a list of Chunks with `embedding is None`.
2. Output: the same list, with `embedding` set to a list of floats of a fixed
   dimension. Dimension must be consistent across all chunks in a book.
3. The embedding model is a module-level constant so the query-side code in
   `retrieval.py` can use the exact same model for the user's question.

Suggested first implementation (for the dev):

- Use OpenAI `text-embedding-3-small` (1536 dims) via the already-installed
  `openai` client. Read the API key from `OPENAI_API_KEY`.
- Batch in groups of 128 chunks to stay under rate / size limits.
- Persist the model name alongside the chunks (add a field to a future
  BookIndex dataclass) so we refuse to mix embeddings across models.
"""

from __future__ import annotations

from typing import List

from glosse.engine.models import Chunk

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536


def embed_chunks(chunks: List[Chunk]) -> List[Chunk]:  # pragma: no cover
    """
    Populate each chunk's `embedding` field.

    TODO(engine): implement. See module docstring for the contract.
    """
    raise NotImplementedError(
        "embeddings.embed_chunks is not implemented yet. "
        "See glosse/engine/embeddings.py."
    )


def embed_query(text: str) -> List[float]:  # pragma: no cover
    """
    Embed a single user query with the same model used for chunks.

    TODO(engine): implement.
    """
    raise NotImplementedError(
        "embeddings.embed_query is not implemented yet. "
        "See glosse/engine/embeddings.py."
    )
