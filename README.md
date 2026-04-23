# Glosse

**Glosse is an AI reading companion that helps books stay in your head.**

Most reading tools help you get through a book. Glosse helps you stay with it:
ask questions without spoilers, turn passages into recall prompts, check your
understanding, and build a durable memory of what you have read.

It is built for active reading, not passive summarizing.

## Why Glosse

Reading with AI should not feel like outsourcing your brain. Glosse sits inside
the reader and works like a sharp study partner: present, contextual, and
careful about where you are in the book.

- **Spoiler-aware by default**: the guide only uses the chapters you have
  reached.
- **Built for memory**: explanations, checks, and quizzes are designed to help
  you recall ideas later.
- **Inside the flow**: no copy-pasting between a reader and a chat tab.
- **More coach than answer machine**: Glosse nudges you to think, connect, and
  remember.

The product line is simple: **read actively, remember more.**

## What It Does

Glosse turns an EPUB into a structured learning path. The backend ingests the
book, tracks chapter position, and exposes a spoiler-safe JSON API. The frontend
gives readers a clean reading surface with a guide panel for questions,
clarifications, recall checks, and deeper discussion.

Think of it as a Kindle-like study partner for people who want the book to
change how they think, not just become another finished title.

## Stack

- **Backend**: Python, uv, and FastAPI on `:8123`.
- **Frontend**: Next.js 16, React 19, TypeScript, and Tailwind v4 on `:3000`.
- **Data**: ingested EPUBs live under `data/books/<book_id>/` as pickled `Book`
  objects plus image files.

## First-Time Setup

Requires `uv`, `pnpm` or npm, and Node 20 or newer.

```bash
make install
```

That runs:

```bash
uv sync
pnpm --prefix frontend install
```

## Daily Usage

Ingest an EPUB once per book:

```bash
make ingest EPUB=path/to/dracula.epub
```

Run both services:

```bash
make dev
```

- FastAPI: <http://localhost:8123>
- API docs: <http://localhost:8123/docs>
- Reader: <http://localhost:3000>

Or run them individually:

```bash
make api
make web
```

## Project Layout

```text
glosse/
|-- glosse/             # Python package
|   |-- engine/         # Book intelligence: ingest, chunking, embeddings, retrieval
|   |-- codex/          # Agent orchestration: modes, tools, system prompts
|   |-- server/         # FastAPI app and JSON routes
|   `-- cli.py          # glosse ingest | serve | list
|-- frontend/           # Next.js 16 app
|   |-- src/app/        # App Router pages
|   |-- src/components/ # Guide panel and reader UI
|   `-- src/lib/api.ts  # Typed client for the FastAPI backend
|-- data/books/         # Ingested books, gitignored
`-- Makefile
```

## Product Direction

Glosse is heading toward a reader that can adapt to how you want to learn:

- quick explanations when you are stuck;
- discussion mode when you want to explore a theme;
- technical mode for dense nonfiction;
- story mode for characters, motives, and plot threads;
- recall loops that help you actually remember what mattered.

The north star is not "chat with your book." It is a companion for serious,
active reading.

## Implementation Status

| Area | Status |
| --- | --- |
| EPUB ingest | Implemented |
| JSON API: library, book, chapter, guide, progress | Implemented |
| Next.js library and reader shell | Minimal but usable |
| Guide panel round-trip to `/api/guide` | Implemented with stub response |
| Chunking | Stub: `glosse/engine/chunking.py` |
| Embeddings | Stub: `glosse/engine/embeddings.py` |
| Spoiler-aware retrieval | Filter implemented, ranking stubbed |
| Codex agent | Stub: `glosse/codex/agent.py` |
| Mode system prompts | Defined in `glosse/codex/modes.py` |
| Full design port | Later: see `glosse-design/src/` |

## Attribution

Built on top of [reader3](https://github.com/karpathy/reader3) by Andrej
Karpathy. See [`NOTICE.md`](./NOTICE.md) for details.

## License

MIT. See [`LICENSE`](./LICENSE).
