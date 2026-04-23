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
from typing import List, Literal, Optional, get_args

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import BaseModel

from glosse.codex.agent import GuideRequest, run_guide
from glosse.codex.modes import Mode
from glosse.engine.html_safety import sanitize_html_fragment
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
    validate_book_id,
)
from glosse.server.progress import get_all_progress, get_progress, set_progress

logger = logging.getLogger(__name__)

SurfaceId = Literal["novel", "study", "article", "focus"]
_VALID_SURFACES: frozenset[str] = frozenset(get_args(SurfaceId))
DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        logger.warning("%s must be an integer; using default %d", name, default)
        return default
    return value if value > 0 else default


MAX_UPLOAD_BYTES = _env_int("GLOSSE_MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES)

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


def _require_valid_book_id(book_id: str) -> None:
    try:
        validate_book_id(book_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Book not found") from None


def _clamp_progress(progress: int, chapters_total: int) -> int:
    if chapters_total <= 0:
        return 0
    return max(0, min(int(progress), chapters_total - 1))


def _require_valid_chapter_index(book, chapter_index: int) -> None:
    if not (0 <= chapter_index < len(book.spine)):
        raise HTTPException(status_code=404, detail="Chapter not found")


_IMG_REF_RE = re.compile(
    # Matches three shapes in one pass:
    #   <img ... src="...">
    #   <image ... xlink:href="...">   (SVG 1.1, common in ebookmaker covers)
    #   <image ... href="...">          (SVG 2)
    r'(<(?:img|image)\b[^>]*?\b(?:src|xlink:href|href)=["\'])([^"\']+)(["\'])',
    re.IGNORECASE,
)


def _rewrite_image_urls(html: str, book_id: str) -> str:
    """
    Rewrite every image reference to point at the per-book images endpoint.

    Covers three tags we've seen in the wild:
      - <img src="…">              — the common case
      - <image xlink:href="…">      — SVG 1.1 wrappers around raster covers
                                      (ebookmaker emits these for Dracula-
                                      style cover pages; skipping them left
                                      the browser rendering a stretched
                                      broken-image glyph on section 1)
      - <image href="…">            — SVG 2

    Ingest also tries to rewrite srcs at parse time, but not every EPUB
    wires its cover cleanly into the image map and some books embed
    arbitrary relative paths (`assets/cover.png`, `../Images/fig3.jpg`).
    Collapsing to basename here is a safe fallback — extracted images are
    stored flat under `data/books/<id>/images/` by basename.

    External http(s) / data URIs are left alone.
    """
    sanitized = sanitize_html_fragment(html)

    def replace(m: re.Match) -> str:
        prefix, src, quote = m.group(1), m.group(2), m.group(3)
        if re.match(r"^(https?:|data:|/api/)", src, re.IGNORECASE):
            return m.group(0)
        basename = os.path.basename(src.split("#", 1)[0].split("?", 1)[0])
        if not basename:
            return m.group(0)
        return f"{prefix}/api/books/{book_id}/images/{basename}{quote}"

    return _IMG_REF_RE.sub(replace, sanitized)


# --- Library + book metadata --------------------------------------------


@router.get("/api/library")
async def api_library():
    books = []
    progress = await run_in_threadpool(get_all_progress)
    for meta in await run_in_threadpool(list_books):
        book_id = meta["book_id"]
        chapters = meta.get("chapters", 0)
        books.append(
            {
                "id": book_id,
                "title": meta.get("title", book_id),
                "authors": meta.get("authors", []),
                "chapters": chapters,
                "progress": _clamp_progress(progress.get(book_id, 0), chapters),
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
    # Remember whether the directory pre-existed so we only remove it on
    # failure if *we* created it — not if a good prior ingest was already there.
    dir_pre_existed = os.path.exists(os.path.join(target_dir, "book.pkl"))

    # Stream the upload to a temp file. EPUBs are small enough for disk
    # round-trip to be cheap, and ebooklib wants a path, not a stream.
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".epub", prefix="glosse_upload_")
    try:
        with os.fdopen(tmp_fd, "wb") as tmp:
            total_bytes = 0
            while True:
                chunk = await file.read(1024 * 256)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"EPUB exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit.",
                    )
                tmp.write(chunk)

        def persist_upload():
            uploaded_book = ingest(tmp_path, target_dir)
            save_book(uploaded_book, book_id)
            update_meta(book_id, {"default_surface": surface_norm})
            return uploaded_book

        book = await run_in_threadpool(persist_upload)
    except HTTPException:
        if not dir_pre_existed:
            shutil.rmtree(target_dir, ignore_errors=True)
        raise
    except Exception:
        logger.exception("upload: ingest failed for %s", filename)
        # Only wipe the directory if we created it this request; preserve an
        # existing valid ingest from a prior upload of the same file.
        if not dir_pre_existed:
            shutil.rmtree(target_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="ingest failed")
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
    _require_valid_book_id(book_id)
    book = await run_in_threadpool(load_book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    # Keep the spine summary light — don't ship all chapter HTML here.
    spine = [
        {"index": ch.order, "title": ch.title, "href": ch.href}
        for ch in book.spine
    ]

    meta = await run_in_threadpool(read_meta, book_id)
    default_surface = meta.get("default_surface")
    if default_surface not in _VALID_SURFACES:
        default_surface = None

    progress = _clamp_progress(
        await run_in_threadpool(get_progress, book_id),
        len(book.spine),
    )

    return {
        "id": book_id,
        "title": book.metadata.title,
        "authors": book.metadata.authors,
        "language": book.metadata.language,
        "description": book.metadata.description,
        "chapters_total": len(book.spine),
        "spine": spine,
        "toc": _serialize_toc(book.toc),
        "progress": progress,
        "default_surface": default_surface,
    }


@router.get("/api/books/{book_id}/chapters/{chapter_index}")
async def api_chapter(book_id: str, chapter_index: int):
    _require_valid_book_id(book_id)
    book = await run_in_threadpool(load_book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    _require_valid_chapter_index(book, chapter_index)

    # Progress only advances — see glosse.server.progress.set_progress.
    await run_in_threadpool(set_progress, book_id, chapter_index)

    ch = book.spine[chapter_index]
    prev_idx = chapter_index - 1 if chapter_index > 0 else None
    next_idx = chapter_index + 1 if chapter_index < len(book.spine) - 1 else None

    progress = _clamp_progress(
        await run_in_threadpool(get_progress, book_id),
        len(book.spine),
    )

    return {
        "book_id": book_id,
        "index": ch.order,
        "title": ch.title,
        "href": ch.href,
        "html": _rewrite_image_urls(ch.content, book_id),
        "text": ch.text,
        "prev_index": prev_idx,
        "next_index": next_idx,
        "progress": progress,
        "chapters_total": len(book.spine),
    }


@router.get("/api/books/{book_id}/images/{image_name}")
async def serve_image(book_id: str, image_name: str):
    _require_valid_book_id(book_id)
    safe_image_name = os.path.basename(image_name)
    if not safe_image_name or safe_image_name != image_name:
        raise HTTPException(status_code=404, detail="Image not found")
    images_dir = os.path.realpath(os.path.join(book_dir(book_id), "images"))
    path = os.path.realpath(os.path.join(images_dir, safe_image_name))
    if os.path.commonpath([images_dir, path]) != images_dir:
        raise HTTPException(status_code=404, detail="Image not found")
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
    """Single turn with the Codex agent."""
    _require_valid_book_id(payload.book_id)
    book = await run_in_threadpool(load_book, payload.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    _require_valid_chapter_index(book, payload.chapter_index)
    progress = _clamp_progress(
        await run_in_threadpool(get_progress, payload.book_id),
        len(book.spine),
    )
    if payload.chapter_index > progress:
        raise HTTPException(status_code=403, detail="Chapter has not been opened yet")
    resp = await run_in_threadpool(
        run_guide,
        GuideRequest(
            book_id=payload.book_id,
            chapter_index=payload.chapter_index,
            progress=progress,
            mode=payload.mode,
            action=payload.action,
            selection=payload.selection,
            user_message=payload.user_message,
        ),
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
    _require_valid_book_id(payload.book_id)
    book = await run_in_threadpool(load_book, payload.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    _require_valid_chapter_index(book, payload.chapter_index)
    await run_in_threadpool(set_progress, payload.book_id, payload.chapter_index)
    progress = _clamp_progress(
        await run_in_threadpool(get_progress, payload.book_id),
        len(book.spine),
    )
    return {"book_id": payload.book_id, "progress": progress}


# Ensure BOOKS_ROOT exists at import time so list_books() doesn't bail.
os.makedirs(BOOKS_ROOT, exist_ok=True)
