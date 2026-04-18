# glosse

Spoiler-aware AI reading companion for EPUBs. See [`description.md`](./description.md) for the pitch.

## Install

Uses [uv](https://docs.astral.sh/uv/).

```bash
uv sync
```

## Usage

Drop an EPUB in the project root (or anywhere), then ingest it:

```bash
uv run glosse ingest path/to/dracula.epub
```

This creates `data/books/<book_id>/book.pkl` and extracts images into
`data/books/<book_id>/images/`. Run ingest once per book.

Then start the reader:

```bash
uv run glosse serve
# or: uv run uvicorn glosse.server.app:app --port 8123
```

Open <http://localhost:8123>.

## Layout

- `glosse/engine/` — book intelligence: ingest, chunking, embeddings,
  spoiler-aware retrieval. **Owned by the engine dev.**
- `glosse/codex/` — agent orchestration: modes, tools, system prompts.
  **Owned by the engine dev.**
- `glosse/server/` — FastAPI app, routes, progress tracking.
- `web/` — Jinja templates and static assets. **Owned by the frontend work.**
- `data/books/` — ingested books. Gitignored.

## What's implemented vs stubbed

| Area | Status |
|---|---|
| EPUB ingest (reader3 parity) | Implemented |
| Library + chapter reader UI | Implemented |
| Reading progress (per book) | Implemented |
| Guide panel (UI shell) | Implemented |
| Chunking | **Stub** — see `glosse/engine/chunking.py` |
| Embeddings | **Stub** — see `glosse/engine/embeddings.py` |
| Spoiler-aware retrieval | **Stub (filter logic in place)** — see `glosse/engine/retrieval.py` |
| Codex agent | **Stub** — see `glosse/codex/agent.py` |
| Mode system prompts | Defined in `glosse/codex/modes.py` |

## Attribution

Built on top of [reader3](https://github.com/karpathy/reader3) by Andrej
Karpathy (MIT). See [`NOTICE.md`](./NOTICE.md) for details.

## License

MIT — see [`LICENSE`](./LICENSE).
