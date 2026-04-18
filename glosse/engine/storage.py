"""
Persistence for ingested books.

Layout:
    data/books/<book_id>/
        book.pkl        -- the Book dataclass
        chunks.pkl      -- list[Chunk], written by chunking.py (optional)
        images/         -- extracted images, served by the reader
        meta.json       -- small human-readable summary (not used at runtime)

`book_id` is a slug derived from the EPUB filename (e.g. dracula.epub -> dracula).
"""

from __future__ import annotations

import json
import logging
import os
import pickle
import re
from functools import lru_cache
from typing import List, Optional

from glosse.engine.models import Book, Chunk

logger = logging.getLogger(__name__)

CHUNK_SCHEMA_VERSION = 1

# Root for all ingested books. Can be overridden via GLOSSE_DATA_DIR.
DATA_ROOT = os.environ.get(
    "GLOSSE_DATA_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data"),
)
BOOKS_ROOT = os.path.join(DATA_ROOT, "books")


def slugify(name: str) -> str:
    """Turn a filename like 'Dracula (1897).epub' into 'dracula_1897'."""
    base = os.path.splitext(os.path.basename(name))[0].lower()
    slug = re.sub(r"[^a-z0-9]+", "_", base).strip("_")
    return slug or "book"


def book_dir(book_id: str) -> str:
    return os.path.join(BOOKS_ROOT, book_id)


def ensure_book_dir(book_id: str) -> str:
    d = book_dir(book_id)
    os.makedirs(d, exist_ok=True)
    return d


# --- Book -----------------------------------------------------------------


def save_book(book: Book, book_id: str) -> str:
    d = ensure_book_dir(book_id)
    path = os.path.join(d, "book.pkl")
    with open(path, "wb") as f:
        pickle.dump(book, f)

    # Small JSON companion for humans / debug tools.
    meta = {
        "book_id": book_id,
        "title": book.metadata.title,
        "authors": book.metadata.authors,
        "chapters": len(book.spine),
        "source_file": book.source_file,
        "processed_at": book.processed_at,
    }
    with open(os.path.join(d, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    return path


@lru_cache(maxsize=16)
def load_book(book_id: str) -> Optional[Book]:
    path = os.path.join(book_dir(book_id), "book.pkl")
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        return pickle.load(f)


def list_books() -> List[dict]:
    """Return a small summary per book — enough for the library view."""
    if not os.path.isdir(BOOKS_ROOT):
        return []
    out = []
    for book_id in sorted(os.listdir(BOOKS_ROOT)):
        meta_path = os.path.join(book_dir(book_id), "meta.json")
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                out.append(json.load(f))
        else:
            # Fall back to loading the pickle (slow path — should not happen)
            book = load_book(book_id)
            if book:
                out.append(
                    {
                        "book_id": book_id,
                        "title": book.metadata.title,
                        "authors": book.metadata.authors,
                        "chapters": len(book.spine),
                    }
                )
    return out


# --- Chunks ---------------------------------------------------------------


def save_chunks(chunks: List[Chunk], book_id: str) -> str:
    d = ensure_book_dir(book_id)
    path = os.path.join(d, "chunks.pkl")
    envelope = {"version": CHUNK_SCHEMA_VERSION, "chunks": chunks}
    with open(path, "wb") as f:
        pickle.dump(envelope, f)
    # Invalidate the cache so the next load_chunks call sees fresh data.
    load_chunks.cache_clear()
    return path


def delete_chunks(book_id: str) -> None:
    """Remove chunks.pkl for book_id; used by --reindex."""
    path = os.path.join(book_dir(book_id), "chunks.pkl")
    if os.path.exists(path):
        os.remove(path)
    load_chunks.cache_clear()


@lru_cache(maxsize=16)
def load_chunks(book_id: str) -> List[Chunk]:
    path = os.path.join(book_dir(book_id), "chunks.pkl")
    if not os.path.exists(path):
        return []
    with open(path, "rb") as f:
        raw = pickle.load(f)

    # Backwards-compat: old format was a bare list.
    if isinstance(raw, list):
        logger.warning(
            "chunks.pkl for '%s' is schema v0 (bare list) — rerun: glosse index %s",
            book_id, book_id,
        )
        return []

    version = raw.get("version", 0)
    if version != CHUNK_SCHEMA_VERSION:
        logger.warning(
            "chunks.pkl for '%s' is schema v%d, expected v%d — rerun: glosse index %s",
            book_id, version, CHUNK_SCHEMA_VERSION, book_id,
        )
        return []

    return raw["chunks"]
