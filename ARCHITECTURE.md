# Architecture

> Agent-facing map of Glosse. Pairs with [README.md](README.md) (user-facing quickstart). Optimized for AI coding agents landing cold — tells you where things live, what's real vs. stubbed, and the one invariant you must not break.

## TL;DR

Glosse is a single-user, local EPUB reader with a spoiler-aware AI sidebar. Users ingest EPUBs, read them in the browser, and chat with a "Guide" agent that can only see content up to the user's current reading position. The ingest pipeline, server, reader UI, progress tracking, and mode prompts are **implemented**. The agent model loop, chunking, and embeddings are **scaffolded stubs** with clear contracts — ready to wire up.

The core invariant everything else orbits: **the agent can only access book content where `chapter_index <= progress`.** Violating this is the one bug that breaks the product.

## Repo layout

```
codex-project/
├── glosse/
│   ├── cli.py              # CLI: ingest, serve, list, index
│   ├── engine/             # Book intelligence
│   │   ├── ingest.py       # EPUB → Book (reader3-derived)
│   │   ├── models.py       # Book, ChapterContent, TOCEntry, Chunk
│   │   ├── storage.py      # Pickle save/load for books & chunks
│   │   ├── retrieval.py    # Spoiler-filtered semantic/lexical retrieval
│   │   ├── chunking.py     # 🚧 stub
│   │   └── embeddings.py   # 🚧 stub
│   ├── codex/              # Agent orchestration
│   │   ├── agent.py        # 🚧 run_guide() scaffold — wire model here
│   │   ├── modes.py        # 5 pedagogical modes + core guardrail
│   │   └── tools.py        # Tool impls + SDK-agnostic schemas
│   └── server/             # FastAPI app
│       ├── app.py          # App init, static mount
│       ├── routes.py       # /, /read/..., /api/guide, /api/progress
│       └── progress.py     # JSON-file progress tracker (advance-only)
├── web/
│   ├── templates/          # library.html, reader.html (Jinja2)
│   └── static/             # style.css, guide.js (vanilla JS, no build)
└── data/                   # Runtime state (gitignored)
    ├── books/<id>/         # book.pkl, chunks.pkl, meta.json, images/
    └── progress.json       # { book_id: chapter_index }
```

## Data flow

```
EPUB file
   │
   ▼  glosse ingest
Book (pickle)  ──► [chunking 🚧] ──► [embeddings 🚧] ──► chunks.pkl
   │
   ▼  glosse serve
Browser ──GET /read/{id}/{ch}──► routes.read_chapter ──► reader.html
                                       │
                                       └─► progress.set_progress (advance-only)

Browser ──POST /api/guide──► routes.api_guide ──► codex.agent.run_guide
                                                       │
                                                       ▼
                                            MODES[mode].system_prompt
                                                       │
                                                       ▼
                                            tools (retrieve_safe_chunks,
                                                   get_current_passage)
                                                       │
                                                       ▼
                                            retrieval.spoiler_filter
                                                       │
                                                       ▼
                                            GuideResponse {text, citations, suggested}
                                                       │
                                                       ▼
                                                 guide.js renders
```

## Key contracts (file:line anchors)

| Concern | Location |
|---|---|
| Agent entry (scaffold) | [glosse/codex/agent.py:58](glosse/codex/agent.py#L58) — `run_guide(GuideRequest) -> GuideResponse` |
| Core guardrail (every mode) | [glosse/codex/modes.py:40-49](glosse/codex/modes.py#L40-L49) |
| Mode specs | [glosse/codex/modes.py](glosse/codex/modes.py) — `LEARNING`, `DISCUSSION`, `TECHNICAL`, `STORY`, `FAST` |
| Tool schemas (SDK-agnostic) | [glosse/codex/tools.py:107-142](glosse/codex/tools.py#L107-L142) |
| Spoiler filter | [glosse/engine/retrieval.py:33](glosse/engine/retrieval.py#L33) |
| Spoiler-safe retrieval | [glosse/engine/retrieval.py:70-108](glosse/engine/retrieval.py#L70-L108) |
| Advance-only progress | [glosse/server/progress.py:44](glosse/server/progress.py#L44) |
| Domain models | [glosse/engine/models.py](glosse/engine/models.py) — `Book`, `ChapterContent`, `Chunk` |
| HTTP routes | [glosse/server/routes.py](glosse/server/routes.py) — `/`, `/read/{id}/{ch}`, `/api/guide`, `/api/progress` |
| Guide UI logic | [web/static/js/guide.js](web/static/js/guide.js) |
| Reader template | [web/templates/reader.html](web/templates/reader.html) |

## The spoiler-boundary invariant

- **Single source of truth:** `chapter_index <= progress`. Nothing else defines what the agent may see.
- **Enforcement point:** [glosse/engine/retrieval.py:33](glosse/engine/retrieval.py#L33). Every tool that returns book content flows through this filter.
- **Progress is monotonic:** [glosse/server/progress.py:44](glosse/server/progress.py#L44) — reading an earlier chapter after a later one does not rewind the boundary.
- **Rule for new code:** never give the agent raw chapter text directly. Add a tool that takes `progress` and filters. If you introduce a new retrieval path, route it through `spoiler_filter()` or an equivalent check — don't duplicate the invariant in multiple places.

## What's real vs. stubbed

**Implemented (✅):** EPUB ingest, pickle storage, FastAPI routes, vanilla-JS reader UI with TOC + Guide panel, JSON-file progress, 5 mode prompts, retrieval with lexical fallback.

**Scaffolded with contracts (🚧):**
- [glosse/codex/agent.py:58-91](glosse/codex/agent.py#L58-L91) — returns a visible placeholder; wire the model-tools loop here
- [glosse/engine/chunking.py](glosse/engine/chunking.py) — `chunk_book()` contract defined
- [glosse/engine/embeddings.py](glosse/engine/embeddings.py) — targets `text-embedding-3-small`, 1536 dims
- `detect_spoiler_risk`, `get_prior_concepts` in [glosse/codex/tools.py](glosse/codex/tools.py)

**Not started (❌):** Tests. No test harness exists yet.

## Build and run

```bash
uv sync
uv run glosse ingest path/to/book.epub
uv run glosse serve              # http://127.0.0.1:8123
uv run glosse list
uv run glosse index <book_id>    # stub until chunking lands
```

Alt: `uv run uvicorn glosse.server.app:app --port 8123 --reload`.

## Configuration

- `GLOSSE_DATA_DIR` — override data root (default `data/` relative to project).
- `OPENAI_API_KEY` — expected by future embeddings and agent implementations; not read today.
- Server defaults: `127.0.0.1:8123` (CLI flags override).

## Common agent tasks

- **Wire a model provider** → edit [glosse/codex/agent.py](glosse/codex/agent.py). Register tools from `TOOL_SCHEMAS` in [glosse/codex/tools.py](glosse/codex/tools.py); close each tool over `book_id=req.book_id, progress=req.chapter_index` so the spoiler boundary travels with every call.
- **Implement chunking / embeddings** → fill in [glosse/engine/chunking.py](glosse/engine/chunking.py) and [glosse/engine/embeddings.py](glosse/engine/embeddings.py); persist via `save_chunks()` in [glosse/engine/storage.py](glosse/engine/storage.py). Retrieval already handles the presence/absence of embeddings.
- **Add a new mode** → extend the `Mode` enum and `MODES` dict in [glosse/codex/modes.py](glosse/codex/modes.py). The reader template reads `modes` from context, so the UI picks it up automatically.
- **Add a new tool** → add the function + schema in [glosse/codex/tools.py](glosse/codex/tools.py); make sure any content-returning tool routes through `retrieve_safe_chunks()` or `spoiler_filter()`.

## Out of scope today

Multi-user auth, a real database, deployment, and test infrastructure. If the app grows beyond single-user local, [glosse/server/progress.py](glosse/server/progress.py) is the first thing to swap (the module's own comments flag this).
