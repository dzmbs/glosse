# glosse

A minimalist local book reader. Your books live in your browser — nothing
leaves unless you want it to. Built around a 2-page spread with a quiet
reading-room design: white paper, near-black ink, a proper book serif.

## Stack

- **Vite + React 19 + TypeScript** — runs fully in the browser, no backend.
- **Tailwind v4** — CSS tokens drive the paper/ink palette.
- **[foliate-js](https://github.com/johnfactotum/foliate-js)** (vendored as a
  git submodule at `vendor/foliate-js`, MIT licensed). Handles EPUB, MOBI,
  KF8/AZW3, FB2, CBZ, and PDF. Custom `@font-face` resolution works
  correctly from Blob sources.
- **IndexedDB** (via `idb`) — books, covers, and reading progress persist
  locally. Preferences live in `localStorage`.
- **react-router-dom** — `/` library, `/read/:bookId` reader.

## Run

```bash
git submodule update --init --recursive   # first time: pull foliate-js
pnpm install                              # also auto-applies the foliate-js Vite patch
pnpm dev
# → http://localhost:5173
```

## Layout

```
src/
├── main.tsx              # router entry
├── index.css             # design tokens + utility classes
├── pages/
│   ├── LibraryPage.tsx   # home: grid / list, search, upload, delete
│   └── ReaderPage.tsx    # reader: 2-page spread, TOC, top/bottom bar
├── components/
│   ├── BookCover.tsx     # cover from the book, or color-blocked fallback
│   ├── BookViewport.tsx  # <foliate-view> wrapper (open, theme, nav)
│   ├── TocDrawer.tsx     # hierarchical contents with active-path highlight
│   ├── TweaksPanel.tsx   # font-size + 1-page/2-page toggle
│   └── Icons.tsx
└── lib/
    ├── db.ts             # IndexedDB: books + progress
    ├── covers.ts         # deterministic cover palette fallback
    ├── epub-ingest.ts    # extract title / author / cover on upload
    ├── foliate-meta.ts   # title/author extractors for foliate metadata
    ├── foliate.d.ts      # minimal types for the vendored library
    ├── formats.ts        # supported file extensions
    ├── toc.ts            # TOC href resolution (active item + ancestors)
    └── useLocalStorage.ts
```

## Keybindings

- `←` / `PageUp` — previous page
- `→` / `Space` / `PageDown` — next page

## What's here

- Pick any .epub / .mobi / .azw3 / .fb2 / .cbz / .pdf — stored in IndexedDB as a Blob
- Library grid + list views, search, delete
- 2-page spread that collapses to single column on narrow widths
- Hierarchical TOC drawer with current-section accent bar and ancestor-path bolding
- Real cover images pulled from each book's manifest
- Font size and layout controls, persisted across sessions
- Per-book progress (CFI + %); resumes where you left off

## What's next (on purpose: not here yet)

- Annotations (highlights, notes, bookmarks)
- RAG + AI integration (chat, quiz, retention)
- File drag-drop onto the library page
- Full-text search inside a book

## License

MIT. See [`NOTICE.md`](./NOTICE.md) for third-party attributions.
