# glosse

A minimalist local book reader with optional AI. Books and everything
derived from them — index, chat, quizzes, flashcards, highlights — live
in your browser. Nothing leaves unless you point it at a cloud provider.
Built around a 2-page spread with a quiet reading-room design: white
paper, near-black ink, a proper book serif.

## Stack

- **Vite + React 19 + TypeScript** — runs fully in the browser, no backend.
- **Tailwind v4** — CSS tokens drive the paper/ink palette.
- **[foliate-js](https://github.com/johnfactotum/foliate-js)** (vendored as a
  git submodule at `vendor/foliate-js`, MIT licensed). Handles EPUB, MOBI,
  KF8/AZW3, FB2, CBZ, and PDF. Custom `@font-face` resolution works
  correctly from Blob sources.
- **IndexedDB** (via `idb`) — books, covers, progress, and annotations
  persist locally. Preferences live in `localStorage`.
- **Turso WASM SQLite** (`@tursodatabase/database-wasm`) — in-browser
  SQLite for the AI index (chunks, embeddings, conversations, quiz state).
- **Vercel AI SDK v6** (`ai`, `@ai-sdk/{anthropic,google,openai}`,
  `ai-sdk-ollama`) — chat, structured output, embeddings. Ollama is the
  default local provider; cloud keys are BYO and stored in localStorage.
- **Zod v4** — schema validation for structured model output.
- **zustand** — reader + AI panel UI state.
- **ts-fsrs** — spaced-repetition scheduler for flashcards.
- **react-router-dom 7** — `/` library, `/read/:bookId` reader, `/evals`.

## Run

```bash
git submodule update --init --recursive   # first time: pull foliate-js
pnpm install                              # auto-applies the foliate-js Vite patch
pnpm dev                                  # → http://localhost:5173
pnpm test                                 # node --test across tests/*.test.ts
pnpm bench:local                          # local-model bench (requires Ollama)
pnpm build                                # tsc -b && vite build
pnpm preview                              # serve dist/
```

## Layout

```
src/
├── main.tsx                # router entry
├── index.css               # design tokens + utility classes
├── pages/
│   ├── LibraryPage.tsx     # grid/list, search, upload, delete
│   ├── ReaderPage.tsx      # 2-page spread, TOC, AI panel host
│   └── EvalsPage.tsx       # /evals — RAG seed suite runner
├── components/
│   ├── BookCover.tsx, BookViewport.tsx, bookViewportState.ts
│   ├── TocDrawer.tsx, TweaksPanel.tsx, RuntimeBanner.tsx, Icons.tsx
│   └── ai/
│       ├── AIPanel.tsx, AISettingsPanel.tsx
│       ├── AskBody.tsx, askGate.ts           # chat tab + spoiler gating
│       ├── HighlightsBody.tsx                # highlights/notes/bookmarks
│       ├── QuizBody.tsx, FlashcardsBody.tsx, MapBody.tsx, studyShared.tsx
│       ├── ReaderProfileSection.tsx
│       └── SelectionMenu.tsx                 # in-page selection actions
├── ai/
│   ├── db/                 # Turso SQLite schema + client + init
│   ├── providers/          # catalog, registry, settings, generate helpers
│   ├── embedding/          # embedder + on-disk compat/migration
│   ├── chunking/           # paragraph/section chunker
│   ├── indexing/           # bookIndex, extract, contextualize, state
│   ├── retrieval/          # hybrid (vector+lex) + page/spoiler cap
│   ├── chat/               # conversations, lifecycle, memory, useBookChat
│   ├── quiz/               # FSRS scheduler + flashcards generator
│   ├── study/              # quiz, mindmap, topics generation
│   ├── prompts/            # companion + study system prompts
│   ├── evals/              # runner, seed, types
│   ├── highlights.ts, summaries.ts, profile.ts, weekly.ts, events.ts
│   └── index.ts, types.ts, utils/
├── lib/                    # db, covers, epub-ingest, foliate-meta,
│                           #   formats, toc, export, runtimeCheck,
│                           #   useLocalStorage
bench/                      # bench.ts + fixture.ts
tests/                      # node:test suites (ask-gate, indexer,
                            #   retrieval-cap, embedding, migrations, …)
scripts/apply-patches.mjs   # postinstall: foliate-js Vite patch
```

## Keybindings

- `←` / `PageUp` — previous page
- `→` / `Space` / `PageDown` — next page

## What's here

- Any .epub / .mobi / .azw3 / .fb2 / .cbz / .pdf — stored in IndexedDB as a Blob
- Library grid + list, search, delete
- 2-page spread that collapses to single column on narrow widths
- Hierarchical TOC drawer with active-path highlight
- Cover images from book manifest; deterministic fallback palette
- Font size + layout controls, persisted per session
- Per-book progress (CFI + %); resumes on reopen
- Highlights, notes, bookmarks (AI panel → Highlights)

## AI features

All AI runs client-side against a provider you choose in the AI panel
settings. Ollama is the default and assumed local; Anthropic / OpenAI /
Google require your own API key, stored in localStorage.

- **Index** — on demand, per book. Chunks → contextualizes → embeds →
  writes to the in-browser Turso SQLite DB.
- **Ask** — hybrid retrieval (vector + lexical) with a page cap so the
  model can't leak ahead of where you are (`ai/retrieval/cap.ts`,
  `components/ai/askGate.ts`). Streaming answers with citation footnotes.
- **Study** — quiz, flashcards, and mindmap generated from the current
  book + page window. Flashcards scheduled by FSRS (`ai/quiz/fsrs.ts`).
- **Highlights** — highlights / notes / bookmarks, persisted locally.
- **Profile + weekly** — lightweight reader profile and weekly recap.

Settings, API keys, and provider selection: AI panel → settings gear.

## Local-model bench

`bench/bench.ts` runs the production prompt builders against a real
Ollama endpoint with canned retrieval passages — no DB, no browser.
Useful for iterating on prompts/schemas and watching timings without a
full app round-trip.

```bash
pnpm bench:local                                  # default: gemma4:26b
GLOSSE_BENCH_MODEL=qwen3:30b pnpm bench:local     # different model
GLOSSE_BENCH_ONLY=chat,quiz pnpm bench:local      # skip scenarios
GLOSSE_BENCH_THINK=true pnpm bench:local          # keep Ollama "think" on
```

## What's next

- Full-text search inside a book
- Export/import of annotations + AI state

## Internal evals

- Visit `/evals` to run the built-in RAG seed suite against your local indexed books.
- Seed cases match by `book title + author`, not the upload id, so they survive re-imports.
- The suite currently focuses on:
  - spoiler safety (`page <= currentPage`)
  - current-page / local-focus retrieval
  - answer smoke checks for a few product-critical questions
- Treat the bundled cases as a starting point. The intended workflow is:
  1. run the seed suite
  2. add failures you see in real reading sessions
  3. grow the dataset from those concrete regressions

## License

MIT. See [`NOTICE.md`](./NOTICE.md) for third-party attributions.
