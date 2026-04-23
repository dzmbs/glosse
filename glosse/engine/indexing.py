"""
Indexing pipeline for ingested books.

This keeps the v1 storage format intact: books stay in book.pkl, chunks stay
in chunks.pkl. The pipeline status lives in meta.json so the API/UI can show
whether a book is ready for grounded guide answers.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from glosse.engine.models import Book
from glosse.engine.storage import delete_chunks, save_chunks, update_meta


@dataclass
class IndexResult:
    chunk_count: int
    chunks_path: str
    embedding_status: str
    embedding_model: Optional[str] = None
    embedding_error: Optional[str] = None


def index_book(
    book: Book,
    book_id: str,
    *,
    reindex: bool = False,
    embed: bool = True,
) -> IndexResult:
    """
    Chunk and optionally embed a book, persisting chunks even if embeddings are
    unavailable. Missing OPENAI_API_KEY is a normal lexical-fallback path.
    """
    from glosse.engine.chunking import chunk_book
    from glosse.engine.embeddings import EMBEDDING_MODEL, embed_chunks

    if reindex:
        delete_chunks(book_id)

    update_meta(
        book_id,
        {
            "index_status": "chunking",
            "index_error": None,
            "embedding_status": "not_started",
            "embedding_error": None,
            "chunk_count": 0,
        },
    )

    try:
        chunks = chunk_book(book, book_id)
    except Exception as exc:
        update_meta(
            book_id,
            {
                "index_status": "failed",
                "index_error": f"chunking failed: {exc}",
                "indexed_at": datetime.now().isoformat(),
            },
        )
        raise

    embedding_status = "skipped"
    embedding_model: Optional[str] = None
    embedding_error: Optional[str] = None

    if embed and os.environ.get("OPENAI_API_KEY"):
        update_meta(
            book_id,
            {
                "index_status": "embedding",
                "embedding_status": "running",
                "embedding_model": EMBEDDING_MODEL,
            },
        )
        try:
            chunks = embed_chunks(chunks)
            embedding_status = "ready"
            embedding_model = EMBEDDING_MODEL
        except Exception as exc:
            # Embeddings improve ranking but are not required for grounded
            # answers: retrieval falls back to lexical scoring.
            embedding_status = "failed"
            embedding_model = EMBEDDING_MODEL
            embedding_error = str(exc)

    try:
        chunks_path = save_chunks(chunks, book_id)
    except Exception as exc:
        update_meta(
            book_id,
            {
                "index_status": "failed",
                "index_error": f"saving chunks failed: {exc}",
                "indexed_at": datetime.now().isoformat(),
            },
        )
        raise

    update_meta(
        book_id,
        {
            "index_status": "ready",
            "index_error": None,
            "embedding_status": embedding_status,
            "embedding_model": embedding_model,
            "embedding_error": embedding_error,
            "chunk_count": len(chunks),
            "indexed_at": datetime.now().isoformat(),
        },
    )

    return IndexResult(
        chunk_count=len(chunks),
        chunks_path=chunks_path,
        embedding_status=embedding_status,
        embedding_model=embedding_model,
        embedding_error=embedding_error,
    )
