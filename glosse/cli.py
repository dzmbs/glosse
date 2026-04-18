"""
Glosse command-line interface.

    glosse ingest <file.epub>   Parse the EPUB into data/books/<id>/.
    glosse serve                Start the reader at http://localhost:8123.
    glosse list                 Show ingested books.
"""

from __future__ import annotations

import argparse
import sys

from glosse.engine.ingest import ingest
from glosse.engine.storage import (
    delete_chunks,
    ensure_book_dir,
    list_books,
    load_book,
    save_book,
    save_chunks,
    slugify,
)


def _cmd_ingest(args: argparse.Namespace) -> int:
    book_id = args.book_id or slugify(args.epub)
    target_dir = ensure_book_dir(book_id)
    book = ingest(args.epub, target_dir)
    save_book(book, book_id)

    print()
    print(f"  id:       {book_id}")
    print(f"  title:    {book.metadata.title}")
    print(f"  authors:  {', '.join(book.metadata.authors) or '-'}")
    print(f"  chapters: {len(book.spine)}")
    print(f"  images:   {len(book.images)}")
    print(f"  saved to: {target_dir}")
    print()
    print("Next steps for the engine dev:")
    print("  1. Implement glosse/engine/chunking.py -> chunk_book(book, book_id)")
    print("  2. Implement glosse/engine/embeddings.py -> embed_chunks(chunks)")
    print("  3. Run:  uv run python -m glosse.cli index", book_id)
    print("     (index subcommand is stubbed below — wire it up when ready)")
    return 0


def _cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    uvicorn.run(
        "glosse.server.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )
    return 0


def _cmd_list(_: argparse.Namespace) -> int:
    books = list_books()
    if not books:
        print("No ingested books yet. Run: glosse ingest path/to/book.epub")
        return 0
    for b in books:
        print(f"{b['book_id']:24s}  {b.get('title', '-')}")
    return 0


def _cmd_index(args: argparse.Namespace) -> int:
    from glosse.engine.chunking import chunk_book
    from glosse.engine.embeddings import EMBEDDING_DIM, EMBEDDING_MODEL, embed_chunks

    book_id = args.book_id
    book = load_book(book_id)
    if book is None:
        print(f"Error: book '{book_id}' not found. Run: glosse ingest <file.epub> first.")
        return 1

    if args.reindex:
        print(f"  --reindex: removing existing chunks.pkl for '{book_id}'")
        delete_chunks(book_id)

    print(f"  chunking '{book_id}' ({len(book.spine)} chapters)…")
    chunks = chunk_book(book, book_id)
    print(f"  produced {len(chunks)} chunks")

    print(f"  embedding with {EMBEDDING_MODEL} (dim={EMBEDDING_DIM})…")
    chunks = embed_chunks(chunks)

    path = save_chunks(chunks, book_id)
    print(f"  saved {len(chunks)} chunks → {path}")
    print()
    print(f"  glosse index '{book_id}' complete.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="glosse", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_ingest = sub.add_parser("ingest", help="Parse an EPUB into the library")
    p_ingest.add_argument("epub", help="Path to the .epub file")
    p_ingest.add_argument(
        "--book-id",
        help="Override the auto-generated book id (default: slug of the filename)",
    )
    p_ingest.set_defaults(func=_cmd_ingest)

    p_serve = sub.add_parser("serve", help="Start the reader web server")
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, default=8123)
    p_serve.add_argument("--reload", action="store_true")
    p_serve.set_defaults(func=_cmd_serve)

    p_list = sub.add_parser("list", help="List ingested books")
    p_list.set_defaults(func=_cmd_list)

    p_index = sub.add_parser("index", help="Chunk + embed a book for semantic retrieval")
    p_index.add_argument("book_id")
    p_index.add_argument(
        "--reindex",
        action="store_true",
        help="Delete existing chunks.pkl before indexing (required on schema change)",
    )
    p_index.set_defaults(func=_cmd_index)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
