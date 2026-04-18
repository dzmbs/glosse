"""
JSON API routes for glosse.

The frontend (Next.js in `frontend/`) is the user-facing surface. FastAPI is a
pure JSON+image API — no HTML rendering happens here anymore.

Endpoints:
    GET  /api/library                            -- list of ingested books
    GET  /api/books/{book_id}                    -- book metadata + TOC + spine
    GET  /api/books/{book_id}/chapters/{idx}     -- one chapter's HTML + text
    GET  /api/books/{book_id}/images/{name}      -- image file referenced by a chapter
    POST /api/guide                              -- Codex Guide panel
    POST /api/progress                           -- bump reading progress
"""

from __future__ import annotations

import os
import re
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from glosse.codex.agent import GuideRequest, run_guide
from glosse.codex.modes import Mode
from glosse.engine.models import TOCEntry
from glosse.engine.storage import BOOKS_ROOT, book_dir, list_books, load_book
from glosse.server.progress import get_progress, set_progress

router = APIRouter()


# --- Helpers -------------------------------------------------------------


def _serialize_toc(entries: List[TOCEntry]) -> List[dict]:
    """Convert the TOCEntry tree into a JSON-safe dict tree."""
    out = []
    for e in entries:
        out.append(
            {
                "title": e.title,
                "href": e.href,
                "file_href": e.file_href,
                "anchor": e.anchor,
                "children": _serialize_toc(e.children),
            }
        )
    return out


_IMG_SRC_RE = re.compile(r'(<img[^>]+src=["\'])(images/)', re.IGNORECASE)


def _rewrite_image_urls(html: str, book_id: str) -> str:
    """
    Chapter HTML has `src="images/foo.jpg"` from the ingest step. Rewrite to
    absolute API paths so the browser hits the right endpoint regardless of
    the page URL it was mounted under.
    """
    return _IMG_SRC_RE.sub(lambda m: f'{m.group(1)}/api/books/{book_id}/images/', html)


# --- Library + book metadata --------------------------------------------


@router.get("/api/library")
async def api_library():
    books = []
    for meta in list_books():
        books.append(
            {
                "id": meta["book_id"],
                "title": meta.get("title", meta["book_id"]),
                "authors": meta.get("authors", []),
                "chapters": meta.get("chapters", 0),
                "progress": get_progress(meta["book_id"]),
                "has_chunks": meta.get("has_chunks", False),
                "in_inbox": meta.get("in_inbox", False),
            }
        )
    return {"books": books}


@router.get("/api/books/{book_id}")
async def api_book(book_id: str):
    book = load_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    # Keep the spine summary light — don't ship all chapter HTML here.
    spine = [
        {"index": ch.order, "title": ch.title, "href": ch.href}
        for ch in book.spine
    ]

    return {
        "id": book_id,
        "title": book.metadata.title,
        "authors": book.metadata.authors,
        "language": book.metadata.language,
        "description": book.metadata.description,
        "chapters_total": len(book.spine),
        "spine": spine,
        "toc": _serialize_toc(book.toc),
        "progress": get_progress(book_id),
    }


@router.get("/api/books/{book_id}/chapters/{chapter_index}")
async def api_chapter(book_id: str, chapter_index: int):
    book = load_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if not (0 <= chapter_index < len(book.spine)):
        raise HTTPException(status_code=404, detail="Chapter not found")

    # Progress only advances — see glosse.server.progress.set_progress.
    set_progress(book_id, chapter_index)

    ch = book.spine[chapter_index]
    prev_idx = chapter_index - 1 if chapter_index > 0 else None
    next_idx = chapter_index + 1 if chapter_index < len(book.spine) - 1 else None

    return {
        "book_id": book_id,
        "index": ch.order,
        "title": ch.title,
        "href": ch.href,
        "html": _rewrite_image_urls(ch.content, book_id),
        "text": ch.text,
        "prev_index": prev_idx,
        "next_index": next_idx,
        "progress": get_progress(book_id),
        "chapters_total": len(book.spine),
    }


@router.get("/api/books/{book_id}/images/{image_name}")
async def serve_image(book_id: str, image_name: str):
    safe_book_id = os.path.basename(book_id)
    safe_image_name = os.path.basename(image_name)
    path = os.path.join(book_dir(safe_book_id), "images", safe_image_name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path)


# --- Guide panel API -----------------------------------------------------


class GuidePayload(BaseModel):
    book_id: str
    chapter_index: int
    mode: Mode = Mode.LEARNING
    action: str = "ask"
    selection: Optional[str] = None
    user_message: Optional[str] = None


@router.post("/api/guide")
async def api_guide(payload: GuidePayload):
    """
    Single turn with the Codex agent.

    The actual agent loop is a stub — see glosse/codex/agent.py.
    """
    resp = run_guide(
        GuideRequest(
            book_id=payload.book_id,
            chapter_index=payload.chapter_index,
            mode=payload.mode,
            action=payload.action,
            selection=payload.selection,
            user_message=payload.user_message,
        )
    )
    return {
        "text": resp.text,
        "citations": resp.citations,
        "suggested": resp.suggested,
    }


# --- Progress API --------------------------------------------------------


class ProgressPayload(BaseModel):
    book_id: str
    chapter_index: int


@router.post("/api/progress")
async def api_progress(payload: ProgressPayload):
    set_progress(payload.book_id, payload.chapter_index)
    return {"book_id": payload.book_id, "progress": get_progress(payload.book_id)}


# Ensure BOOKS_ROOT exists at import time so list_books() doesn't bail.
os.makedirs(BOOKS_ROOT, exist_ok=True)
