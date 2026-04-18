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

import logging
import os
import re
import shutil
import tempfile
from typing import List, Literal, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from glosse.codex.agent import GuideRequest, run_guide
from glosse.codex.modes import Mode
from glosse.engine.ingest import ingest
from glosse.engine.models import TOCEntry
from glosse.engine.storage import (
    BOOKS_ROOT,
    book_dir,
    ensure_book_dir,
    list_books,
    load_book,
    read_meta,
    save_book,
    slugify,
    update_meta,
)
from glosse.server.progress import get_progress, set_progress

logger = logging.getLogger(__name__)

SurfaceId = Literal["novel", "study", "article", "focus"]
_VALID_SURFACES = {"novel", "study", "article", "focus"}

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


_IMG_SRC_RE = re.compile(r'(<img\b[^>]*?\bsrc=["\'])([^"\']+)(["\'])', re.IGNORECASE)


def _rewrite_image_urls(html: str, book_id: str) -> str:
    """
    Rewrite every <img src="..."> to point at the per-book images endpoint.

    Ingest already tries to rewrite srcs to `images/<safe_fname>`, but not
    every EPUB has its covers wired cleanly into the image map (ITEM_COVER
    used to be skipped, and some books embed arbitrary relative paths like
    `assets/cover.png` or `../Images/fig3.jpg`). Collapsing to the basename
    is a safe fallback — the extracted images are stored flat under
    `data/books/<id>/images/` by the same basename.

    Non-http(s), non-data URIs are rewritten. External URLs are left alone.
    """
    def replace(m: re.Match) -> str:
        prefix, src, quote = m.group(1), m.group(2), m.group(3)
        if re.match(r"^(https?:|data:|/api/)", src, re.IGNORECASE):
            return m.group(0)
        basename = os.path.basename(src.split("#", 1)[0].split("?", 1)[0])
        if not basename:
            return m.group(0)
        return f"{prefix}/api/books/{book_id}/images/{basename}{quote}"

    return _IMG_SRC_RE.sub(replace, html)


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
                "default_surface": meta.get("default_surface"),
            }
        )
    return {"books": books}


@router.post("/api/library/upload")
async def api_library_upload(
    file: UploadFile = File(...),
    surface: str = Form("novel"),
):
    """
    Accept a user-uploaded EPUB, ingest it immediately, and persist the
    reader's preferred surface mode (novel / study / article / focus).

    The file is written to a temp path, passed through the same `ingest()`
    pipeline the CLI uses, then stashed under data/books/<book_id>/.
    """
    filename = file.filename or "book.epub"
    if not filename.lower().endswith(".epub"):
        raise HTTPException(status_code=400, detail="Only .epub files are accepted.")

    surface_norm = surface.lower().strip()
    if surface_norm not in _VALID_SURFACES:
        raise HTTPException(
            status_code=400,
            detail=f"surface must be one of {sorted(_VALID_SURFACES)}",
        )

    book_id = slugify(filename)
    target_dir = ensure_book_dir(book_id)

    # Stream the upload to a temp file. EPUBs are small enough for disk
    # round-trip to be cheap, and ebooklib wants a path, not a stream.
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".epub", prefix="glosse_upload_")
    try:
        with os.fdopen(tmp_fd, "wb") as tmp:
            while True:
                chunk = await file.read(1024 * 256)
                if not chunk:
                    break
                tmp.write(chunk)
        book = ingest(tmp_path, target_dir)
        save_book(book, book_id)
        update_meta(book_id, {"default_surface": surface_norm})
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("upload: ingest failed for %s", filename)
        # Best-effort cleanup — remove the partially-ingested book dir so
        # a retry starts fresh.
        shutil.rmtree(target_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"ingest failed: {exc}")
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        await file.close()

    return {
        "id": book_id,
        "title": book.metadata.title,
        "authors": book.metadata.authors,
        "chapters": len(book.spine),
        "default_surface": surface_norm,
    }


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

    meta = read_meta(book_id)
    default_surface = meta.get("default_surface")
    if default_surface not in _VALID_SURFACES:
        default_surface = None

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
        "default_surface": default_surface,
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
