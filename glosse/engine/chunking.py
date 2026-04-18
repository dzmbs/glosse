"""
Chunking: ChapterContent.text -> list[Chunk].

Fixed-window strategy: ~600 tokens with ~80 token overlap.
Token count approximated as len(text) // 4 (no tiktoken dependency required).
Chapters with fewer than 40 words are skipped (front matter, copyright, etc.).
"""

from __future__ import annotations

from typing import List

from glosse.engine.models import Book, Chunk

WINDOW_CHARS = 2400   # ~600 tokens at 4 chars/token
OVERLAP_CHARS = 320   # ~80 tokens
MIN_WORDS = 40


def _toc_section(book: Book, chapter_href: str) -> str:
    """Return the innermost TOC title whose file_href matches chapter_href."""
    def _search(entries):
        for entry in entries:
            if entry.file_href == chapter_href:
                return entry.title
            found = _search(entry.children)
            if found:
                return found
        return None

    return _search(book.toc) or ""


def chunk_book(book: Book, book_id: str) -> List[Chunk]:
    """Split every chapter in book.spine into Chunks."""
    chunks: List[Chunk] = []

    for chapter in book.spine:
        text = chapter.text
        if not text or len(text.split()) < MIN_WORDS:
            continue

        section = _toc_section(book, chapter.href) or chapter.title
        ord_counter = 0
        pos = 0

        while pos < len(text):
            end = min(pos + WINDOW_CHARS, len(text))

            # Snap end to a word boundary to avoid cutting mid-word.
            if end < len(text):
                snap = text.rfind(" ", pos, end)
                if snap > pos:
                    end = snap

            chunk_text = text[pos:end].strip()
            if chunk_text:
                chunks.append(
                    Chunk(
                        chunk_id=f"{book_id}:{chapter.order:04d}:{ord_counter:04d}",
                        book_id=book_id,
                        chapter_index=chapter.order,
                        section_path=section,
                        start_offset=pos,
                        end_offset=end,
                        text=chunk_text,
                        embedding=None,
                    )
                )
                ord_counter += 1

            if end >= len(text):
                break
            pos = max(0, end - OVERLAP_CHARS)

    return chunks
