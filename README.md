# glosse

Spoiler-aware AI reading companion for EPUBs. See [`description.md`](./description.md) for the pitch.

## Stack

- **Backend**: Python + [uv](https://docs.astral.sh/uv/) + FastAPI — pure JSON API on `:8123`.
- **Frontend**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 — on `:3000`, proxies `/api/*` to the backend.
- **Data**: ingested EPUBs live under `data/books/<book_id>/` as pickled `Book` objects + image files.

## First-time setup

Requires `uv`, `pnpm` (or npm), and Node ≥ 20.

```bash
make install
# ≡ uv sync && pnpm --prefix frontend install
```

## Daily usage

Ingest an EPUB (once per book):

```bash
make ingest EPUB=path/to/dracula.epub
# ≡ uv run glosse ingest path/to/dracula.epub
```

Run both services:

```bash
make dev
# FastAPI on http://localhost:8123  (docs: /docs)
# Next.js on http://localhost:3000  (the reader)
```

Or run them individually in separate terminals:

```bash
make api   # FastAPI only
make web   # Next.js only
```

Open <http://localhost:3000>.

## Layout

```
glosse/
├── glosse/             # Python package
│   ├── engine/         # Book intelligence: ingest, chunking, embeddings, retrieval
│   ├── codex/          # Agent orchestration: modes, tools, system prompts
│   ├── server/         # FastAPI app + JSON routes
│   └── cli.py          # `glosse ingest | serve | list`
├── frontend/           # Next.js 16 app
│   ├── src/app/        # App Router pages (/, /read/[bookId]/[chapter])
│   ├── src/components/ # GuidePanel + more to come
│   └── src/lib/api.ts  # Typed client for the FastAPI backend
├── data/books/         # Ingested books (gitignored)
└── Makefile
```

## Ownership

- `glosse/engine/` + `glosse/codex/` — **engine dev**. The stubs have explicit `NotImplementedError` and contract docstrings.
- `glosse/server/` — boundary; rarely touched outside of adding new endpoints.
- `frontend/` — **frontend work**. The design lives in a sibling repo (`glosse-design/`) as React/JSX; port components into `frontend/src/components/`.

## What's implemented vs stubbed

| Area | Status |
|---|---|
| EPUB ingest (reader3 parity) | Implemented |
| JSON API: library, book, chapter, guide, progress | Implemented |
| Next.js library + reader shell | **Minimal** — usable, not yet designed |
| Guide panel round-trip to `/api/guide` | Implemented (returns stub response) |
| Chunking | **Stub** — `glosse/engine/chunking.py` |
| Embeddings | **Stub** — `glosse/engine/embeddings.py` |
| Spoiler-aware retrieval | **Filter done, ranking stubbed** — `glosse/engine/retrieval.py` |
| Codex agent | **Stub** — `glosse/codex/agent.py` |
| Mode system prompts | Defined — `glosse/codex/modes.py` |
| Full design port (4 surface modes, drawers, selection menu, quiz flow, etc.) | **LATER** — see `glosse-design/src/` |

## Attribution

Built on top of [reader3](https://github.com/karpathy/reader3) by Andrej Karpathy (MIT). See [`NOTICE.md`](./NOTICE.md) for details.

## License

MIT — see [`LICENSE`](./LICENSE).
