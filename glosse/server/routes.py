"""
HTTP routes for the glosse reader.

- GET  /                           -- library view
- GET  /read/{book_id}             -- redirect to last-read chapter
- GET  /read/{book_id}/{idx}       -- reader view
- GET  /read/{book_id}/images/..   -- per-book images
- POST /api/guide                  -- Codex Guide panel
- POST /api/progress               -- bump reading progress
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from glosse.codex.agent import GuideRequest, run_guide
from glosse.codex.modes import MODES, Mode
from glosse.engine.storage import BOOKS_ROOT, book_dir, list_books, load_book
from glosse.server.progress import get_progress, set_progress

router = APIRouter()

# Templates live under web/templates relative to the repo root.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
templates = Jinja2Templates(directory=os.path.join(_REPO_ROOT, "web", "templates"))


# --- Library + reader views ----------------------------------------------


@router.get("/", response_class=HTMLResponse)
async def library_view(request: Request):
    books = []
    for meta in list_books():
        books.append(
            {
                "id": meta["book_id"],
                "title": meta.get("title", meta["book_id"]),
                "author": ", ".join(meta.get("authors", []) or []),
                "chapters": meta.get("chapters", 0),
                "progress": get_progress(meta["book_id"]),
            }
        )
    return templates.TemplateResponse(request, "library.html", {"books": books})


@router.get("/read/{book_id}", response_class=HTMLResponse)
async def resume_reading(book_id: str):
    return RedirectResponse(url=f"/read/{book_id}/{get_progress(book_id)}")


@router.get("/read/{book_id}/{chapter_index}", response_class=HTMLResponse)
async def read_chapter(request: Request, book_id: str, chapter_index: int):
    book = load_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if not (0 <= chapter_index < len(book.spine)):
        raise HTTPException(status_code=404, detail="Chapter not found")

    # Update progress on every read — only advances, never rewinds.
    set_progress(book_id, chapter_index)

    current_chapter = book.spine[chapter_index]
    prev_idx = chapter_index - 1 if chapter_index > 0 else None
    next_idx = chapter_index + 1 if chapter_index < len(book.spine) - 1 else None

    return templates.TemplateResponse(
        request,
        "reader.html",
        {
            "book": book,
            "current_chapter": current_chapter,
            "chapter_index": chapter_index,
            "book_id": book_id,
            "prev_idx": prev_idx,
            "next_idx": next_idx,
            "progress": get_progress(book_id),
            "modes": list(MODES.values()),
        },
    )


@router.get("/read/{book_id}/images/{image_name}")
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
