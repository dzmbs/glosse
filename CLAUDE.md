# CLAUDE.md — Glosse

Spoiler-aware AI reading companion for EPUBs. Single-user, local. Built on
FastAPI + Jinja2, using reader3 (Karpathy) as the EPUB parsing and reader UI
foundation.

The one invariant everything orbits: **the agent can only access book content
where `chapter_index <= progress`.** Violating this is the one bug that breaks
the product.

## Repo layout

```
codex-project/
├── glosse/
│   ├── cli.py              # CLI: ingest, serve, list, index
│   ├── engine/             # Book intelligence
│   │   ├── ingest.py       # EPUB → Book (reader3-derived, MIT)
│   │   ├── models.py       # Book, ChapterContent, TOCEntry, Chunk
│   │   ├── storage.py      # Pickle save/load for books & chunks
│   │   ├── retrieval.py    # Spoiler-filtered semantic/lexical retrieval
│   │   ├── chunking.py     # 🚧 stub
│   │   └── embeddings.py   # 🚧 stub — targets text-embedding-3-small, 1536 dims
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
│   └── static/             # style.css, guide.js (vanilla JS, no build step)
└── data/                   # Runtime state — gitignored, never commit
    ├── books/<id>/         # book.pkl, chunks.pkl, meta.json, images/
    └── progress.json       # { book_id: chapter_index }
```

## Commands

```bash
uv sync
uv run glosse ingest path/to/book.epub   # ingest once per book
uv run glosse serve                       # http://127.0.0.1:8123
uv run glosse list
uv run glosse index <book_id>             # stub until chunking lands
```

Alt serve: `uv run uvicorn glosse.server.app:app --port 8123 --reload`

Requires Python >= 3.10. Uses `uv` for dependency management.

## What's real vs. stubbed

| Area | Status | Location |
|---|---|---|
| EPUB ingest | ✅ Implemented | `glosse/engine/ingest.py` |
| Pickle storage | ✅ Implemented | `glosse/engine/storage.py` |
| Domain models | ✅ Implemented | `glosse/engine/models.py` |
| FastAPI routes | ✅ Implemented | `glosse/server/routes.py` |
| Library + reader UI | ✅ Implemented | `web/templates/` |
| Guide panel (UI shell) | ✅ Implemented | `web/templates/reader.html`, `web/static/js/guide.js` |
| JSON-file progress | ✅ Implemented | `glosse/server/progress.py` |
| 5 mode prompts | ✅ Implemented | `glosse/codex/modes.py` |
| Retrieval (lexical fallback) | ✅ Implemented | `glosse/engine/retrieval.py` |
| Agent model loop | 🚧 Scaffold | `glosse/codex/agent.py:58` — returns visible placeholder |
| Chunking | 🚧 Stub | `glosse/engine/chunking.py` — contract defined |
| Embeddings | 🚧 Stub | `glosse/engine/embeddings.py` — contract defined |
| `detect_spoiler_risk`, `get_prior_concepts` | 🚧 Stub | `glosse/codex/tools.py` |
| Tests | ❌ Not started | No test harness exists yet |

## Key contracts

| Concern | Location |
|---|---|
| Agent entry | `glosse/codex/agent.py:58` — `run_guide(GuideRequest) -> GuideResponse` |
| Core guardrail (every mode) | `glosse/codex/modes.py:40-49` |
| Mode specs | `glosse/codex/modes.py` — `LEARNING`, `DISCUSSION`, `TECHNICAL`, `STORY`, `FAST` |
| Tool schemas (SDK-agnostic) | `glosse/codex/tools.py:107-142` |
| Spoiler filter | `glosse/engine/retrieval.py:33` |
| Spoiler-safe retrieval | `glosse/engine/retrieval.py:70-108` |
| Advance-only progress | `glosse/server/progress.py:44` |
| HTTP routes | `glosse/server/routes.py` — `/`, `/read/{id}/{ch}`, `/api/guide`, `/api/progress` |
| Guide UI logic | `web/static/js/guide.js` |

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
```

## The spoiler-boundary invariant

- **Single source of truth:** `chapter_index <= progress`. Nothing else defines what the agent may see.
- **Enforcement point:** `glosse/engine/retrieval.py:33`. Every tool that returns book content flows through this filter.
- **Progress is monotonic:** `glosse/server/progress.py:44` — reading an earlier chapter after a later one does not rewind the boundary.
- **Rule for new code:** never give the agent raw chapter text directly. Add a tool that takes `progress` and filters through `spoiler_filter()`. Don't duplicate the invariant in multiple places.

## Common agent tasks

**Wire a model provider** → edit `glosse/codex/agent.py`. Register tools from
`TOOL_SCHEMAS` in `glosse/codex/tools.py`; close each tool over
`book_id=req.book_id, progress=req.chapter_index` so the spoiler boundary
travels with every call.

**Implement chunking / embeddings** → fill in `glosse/engine/chunking.py` and
`glosse/engine/embeddings.py`; persist via `save_chunks()` in
`glosse/engine/storage.py`. Retrieval already handles presence/absence of
embeddings gracefully.

**Add a new mode** → extend the `Mode` enum and `MODES` dict in
`glosse/codex/modes.py`. The reader template reads `modes` from context, so
the UI picks it up automatically.

**Add a new tool** → add the function + schema in `glosse/codex/tools.py`;
make sure any content-returning tool routes through `retrieve_safe_chunks()`
or `spoiler_filter()`.

## Environment variables

```
OPENAI_API_KEY=sk-...      # required for embeddings and agent
GLOSSE_DATA_DIR=...        # override data root (default: data/ relative to project)
```

## Dependencies

Core (always installed via `uv sync`):
- `fastapi`, `uvicorn`, `jinja2` — server
- `ebooklib`, `beautifulsoup4` — EPUB parsing (reader3 lineage)
- `openai>=1.50.0` — embeddings + agent

Retrieval extras (add to `[retrieval]` in `pyproject.toml` once decided):
- Option A (lightweight): `numpy` + `sqlite-vec`
- Option B (simpler): `chromadb`
- For hackathon: brute-force cosine over a plain Python list is fine

## Attribution

`ingest.py`, `models.py`, `library.html`, and `reader.html` are derived from
[reader3](https://github.com/karpathy/reader3) by Andrej Karpathy (MIT).
See `NOTICE.md` for full details. Do not remove attribution.

## What not to do

- Do not give the agent raw chapter text without routing through `spoiler_filter()`
- Do not rewind progress — it is advance-only by design
- Do not touch `ingest.py` or `models.py` without checking `NOTICE.md` first
- Do not commit anything under `data/` — it is gitignored for a reason
- Do not add a reranker, knowledge graph, or external vector DB for the hackathon build
- Do not break the `Chunk` dataclass shape — agent and retrieval both depend on it

## Out of scope

Multi-user auth, a real database, deployment, and test infrastructure.
If the app grows beyond single-user local, `glosse/server/progress.py` is
the first thing to swap (the module's own comments flag this).