"""
Book intelligence engine.

Pipeline:
    EPUB file
        -> ingest.py        (parse into a Book: chapters, TOC, images)
        -> storage.py       (persist Book as pickle under data/books/<id>/)
        -> chunking.py      (split chapter text into retrievable chunks)
        -> embeddings.py    (embed each chunk)
        -> retrieval.py     (spoiler-aware top-k by user progress)

`ingest` and `storage` are implemented. Chunking, embeddings, and the
vector-store half of retrieval are left as stubs for the engine dev.
"""

from glosse.engine.models import (
    Book,
    BookMetadata,
    ChapterContent,
    Chunk,
    TOCEntry,
)

__all__ = ["Book", "BookMetadata", "ChapterContent", "Chunk", "TOCEntry"]
