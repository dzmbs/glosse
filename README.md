# glosse

A minimalist local EPUB reader — your books live in your browser, nothing
leaves unless you want it to. Design borrowed from the sibling `glosse`
(a quiet cream-paper reading room). Reader built fresh around `epubjs` with
a 2-page spread layout.

## Stack

- **Vite + React 19 + TypeScript** — runs fully in the browser, no backend.
- **Tailwind v4** — CSS tokens drive the three surface modes (study / novel / focus).
- **[foliate-js](https://github.com/johnfactotum/foliate-js)** (vendored as a
  git submodule at `vendor/foliate-js`, MIT licensed). Handles EPUB, MOBI,
  KF8/AZW3, FB2, CBZ, and PDF. Custom `@font-face` resolution works
  correctly from Blob sources.
- **IndexedDB** (via `idb`) — books, progress, everything persists locally.
- **react-router-dom** — `/` library, `/read/:bookId` reader.

## Run

```bash
git submodule update --init --recursive   # first time: pull foliate-js
pnpm install
pnpm dev
# → http://localhost:5173
```

## Layout

```
src/
├── main.tsx              # router entry
├── index.css             # design tokens (novel/study/focus surfaces)
├── pages/
│   ├── LibraryPage.tsx   # home: grid / list, search, upload, delete
│   └── ReaderPage.tsx    # reader: 2-page spread, TOC, top/bottom bar
├── components/
│   ├── BookCover.tsx     # color-blocked fallback cover
│   ├── EpubViewport.tsx  # thin wrapper around epubjs Rendition
│   ├── TocDrawer.tsx     # slide-in contents
│   ├── TweaksPanel.tsx   # surface + font-size + 1/2-page toggle
│   └── Icons.tsx
└── lib/
    ├── db.ts             # IndexedDB: books + progress
    ├── covers.ts         # deterministic cover palette
    └── epub-ingest.ts    # extract title/author on upload
```

## Keybindings

- `←` / `PageUp` — previous page
- `→` / `Space` / `PageDown` — next page

## What's here

- Drag-drop / pick any .epub — stored in IndexedDB as a Blob
- Library grid + list views, search, delete
- 2-page spread that auto-collapses to single column on narrow widths
- TOC drawer, surface modes (cream / white / dark), font-size stepper
- Progress persists per book (CFI + %); resumes where you left off

## What's next (on purpose: not here yet)

- Annotations (highlights, notes, bookmarks)
- RAG + your own AI integration (chat, quiz, retention)
- File drag-drop onto the library page
- Real cover extraction from the EPUB package
