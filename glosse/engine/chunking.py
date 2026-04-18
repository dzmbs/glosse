"""
Chunking: ChapterContent.text -> list[Chunk].

This is a stub. The contract is intentionally narrow so the engine dev can
drop in any chunking strategy (fixed-window, sentence-aware, tiktoken-based,
etc.) without touching the rest of the pipeline.

Guarantees the rest of the system relies on:

1. Every returned Chunk carries `chapter_index == ChapterContent.order` for
   the chapter it came from. This is how the spoiler boundary is enforced.
2. `start_offset` and `end_offset` index into the ORIGINAL
   `ChapterContent.text` for that chapter, so the server can render a
   chunk's source passage back to the reader.
3. `chunk_id` is stable across re-runs given the same Book and parameters.
   A recommended format is `f"{book_id}:{chapter_index:04d}:{ord:04d}"`.

Suggested first implementation (for the dev):

- Flatten each chapter's text into windows of ~600 tokens with ~80 token
  overlap. Use `tiktoken` with the model's tokenizer if available, otherwise
  approximate on whitespace (~4 chars per token).
- Skip chapters with < 40 words (front matter, copyright pages, etc.).
- Set `section_path` from the TOC: find the innermost TOC entry whose
  `file_href` matches the chapter's `href`; fall back to the chapter title.
"""

from __future__ import annotations

from typing import List

from glosse.engine.models import Book, Chunk


def chunk_book(book: Book, book_id: str) -> List[Chunk]:  # pragma: no cover
    """
    Split every chapter in `book.spine` into Chunks.

    TODO(engine): implement. See module docstring for the contract.
    """
    raise NotImplementedError(
        "chunking.chunk_book is not implemented yet. See glosse/engine/chunking.py."
    )
