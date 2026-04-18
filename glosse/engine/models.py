"""
Data model for an ingested book.

`BookMetadata`, `ChapterContent`, `TOCEntry`, and `Book` are adapted from
reader3 (MIT, Karpathy). `Chunk` is new to glosse and is what retrieval
operates on.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class ChapterContent:
    """
    One physical file in the EPUB spine.

    A single file may contain multiple logical chapters (TOC entries point
    into it by anchor). The spine preserves linear reading order.
    """

    id: str            # internal EPUB id (e.g. 'item_1')
    href: str          # filename (e.g. 'part01.html')
    title: str         # best-guess title; real titles come from the TOC
    content: str       # cleaned inner-body HTML, image src rewritten
    text: str          # plain text — used for chunking / retrieval
    order: int         # index in the spine; this IS the chapter_index used
                       # by the spoiler boundary


@dataclass
class TOCEntry:
    """One logical entry in the navigation sidebar."""

    title: str
    href: str                        # original (may include #anchor)
    file_href: str                   # filename only
    anchor: str                      # anchor only, '' if none
    children: List["TOCEntry"] = field(default_factory=list)


@dataclass
class BookMetadata:
    title: str
    language: str
    authors: List[str] = field(default_factory=list)
    description: Optional[str] = None
    publisher: Optional[str] = None
    date: Optional[str] = None
    identifiers: List[str] = field(default_factory=list)
    subjects: List[str] = field(default_factory=list)


@dataclass
class Book:
    """
    The pickled object that the server loads per book.

    `spine` drives linear reading and the spoiler boundary:
    a user reading chapter index `p` is allowed to see content from any
    chunk whose `chapter_index <= p`.
    """

    metadata: BookMetadata
    spine: List[ChapterContent]
    toc: List[TOCEntry]
    images: dict              # map: original_path -> local relative path

    source_file: str
    processed_at: str
    version: str = "glosse-0.1"


# --- Retrieval-side data model ---------------------------------------------


@dataclass
class Chunk:
    """
    One retrievable unit of book text.

    Chunks are produced by glosse/engine/chunking.py from a Book's spine and
    persisted alongside it. The embedding is stored as a plain list of floats
    so the scaffold stays dependency-free; the engine dev may swap in numpy
    arrays or a vector store later.

    The spoiler boundary is enforced purely on `chapter_index` — retrieval
    filters out any chunk with `chapter_index > user_progress` before doing
    semantic ranking.
    """

    chunk_id: str            # stable id, e.g. f"{book_id}:{chapter_index}:{ord}"
    book_id: str
    chapter_index: int       # == ChapterContent.order; the spoiler key
    section_path: str        # best-effort TOC path for citation, e.g. "Ch. III"
    start_offset: int        # char offset into ChapterContent.text
    end_offset: int
    text: str                # the chunk text itself
    embedding: Optional[List[float]] = None
