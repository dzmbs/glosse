import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { BookCover } from "@/components/BookCover";
import { Icon } from "@/components/Icons";
import { RuntimeBanner } from "@/components/RuntimeBanner";
import {
  deleteBook,
  getProgress,
  listBooks,
  putBook,
  type BookListEntry,
  type ProgressRecord,
} from "@/lib/db";
import { makeBookId, readBookMeta } from "@/lib/epub-ingest";
import { SUPPORTED_ACCEPT, SUPPORTED_EXT_REGEX } from "@/lib/formats";

type View = "grid" | "list";

type BookWithProgress = BookListEntry & {
  progress: ProgressRecord | undefined;
};

export function LibraryPage() {
  const [books, setBooks] = useState<BookWithProgress[] | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("grid");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const list = await listBooks();
    const withProgress: BookWithProgress[] = await Promise.all(
      list.map(async (b) => ({ ...b, progress: await getProgress(b.id) })),
    );
    setBooks(withProgress);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setImporting(true);
      try {
        const accepted = Array.from(files).filter((f) =>
          SUPPORTED_EXT_REGEX.test(f.name),
        );
        await Promise.all(
          accepted.map(async (file) => {
            const meta = await readBookMeta(file);
            await putBook({
              id: makeBookId(),
              title: meta.title,
              author: meta.author,
              addedAt: Date.now(),
              file,
              coverBlob: meta.coverBlob,
            });
          }),
        );
        await refresh();
      } finally {
        setImporting(false);
      }
    },
    [refresh],
  );

  const onUploadClick = useCallback(() => fileInputRef.current?.click(), []);

  const filtered = useMemo(() => {
    if (!books) return [];
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q),
    );
  }, [books, query]);

  // Stats reflect the full library, not the search result — otherwise the
  // "in progress" number shrinks when you type in the search box while
  // "finished" stays constant, which looks like a bug.
  const allBooks = books ?? [];
  const readingCount = allBooks.filter(
    (b) => b.progress && b.progress.percentage > 0 && b.progress.percentage < 1,
  ).length;
  const finishedCount = allBooks.filter(
    (b) => b.progress && b.progress.percentage >= 1,
  ).length;

  const loaded = books !== null;

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <SiteChrome />
      <RuntimeBanner />

      <div className="mx-auto max-w-[1320px] px-10 pb-16 pt-10">
        <Hero
          total={allBooks.length}
          reading={readingCount}
          finished={finishedCount}
        />

        <Toolbar
          query={query}
          onQuery={setQuery}
          view={view}
          onView={setView}
          resultCount={filtered.length}
          totalCount={books?.length ?? 0}
          onAdd={onUploadClick}
        />

        {!loaded ? (
          <div
            className="py-20 text-center italic"
            style={{
              fontFamily: "var(--serif-stack)",
              fontSize: 15,
              color: "var(--ink-muted)",
            }}
          >
            Opening the shelf…
          </div>
        ) : books!.length === 0 ? (
          <EmptyState onAdd={onUploadClick} importing={importing} />
        ) : filtered.length === 0 ? (
          <NoMatches query={query} />
        ) : view === "grid" ? (
          <GridView
            books={filtered}
            onAdd={onUploadClick}
            onDelete={async (id) => {
              await deleteBook(id);
              await refresh();
            }}
          />
        ) : (
          <ListView
            books={filtered}
            onAdd={onUploadClick}
            onDelete={async (id) => {
              await deleteBook(id);
              await refresh();
            }}
          />
        )}

        {importing && (
          <div
            className="fixed left-1/2 bottom-8 -translate-x-1/2 rounded-full"
            style={{
              background: "var(--ink)",
              color: "var(--paper)",
              padding: "9px 18px",
              fontFamily: "var(--inter-stack)",
              fontSize: 12.5,
              letterSpacing: 0.3,
              boxShadow: "0 10px 30px rgba(26,22,18,0.25)",
            }}
          >
            Ingesting EPUB…
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={SUPPORTED_ACCEPT}
        multiple
        style={{ display: "none" }}
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}

// -- Header ---------------------------------------------------------------

const EPIGRAPH =
  "\u201CA library is not a luxury but one of the necessities of life.\u201D";

const NAV: { label: string; active?: boolean }[] = [
  { label: "The Shelf", active: true },
  { label: "The Margins" },
  { label: "The Guide" },
];

function SiteChrome() {
  return (
    <header className="border-b" style={{ borderColor: "var(--rule-soft)" }}>
      <div className="mx-auto flex max-w-[1320px] items-center gap-8 px-10 py-4">
        <div className="flex items-baseline gap-2">
          <span
            style={{
              fontFamily: "var(--heading-stack)",
              fontStyle: "italic",
              fontSize: 22,
              fontWeight: 500,
              color: "var(--ink)",
              letterSpacing: -0.2,
            }}
          >
            glosse
          </span>
          <span
            className="hidden sm:inline"
            style={{
              fontFamily: "var(--serif-stack)",
              fontStyle: "italic",
              fontSize: 12,
              color: "var(--ink-muted)",
              opacity: 0.7,
            }}
          >
            &middot; a quiet reading room
          </span>
        </div>

        <nav className="ml-6 hidden items-center gap-8 md:flex">
          {NAV.map((n) => (
            <NavItem key={n.label} {...n} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="icon-btn" title="Ask the guide">
            <Icon.sparkle size={16} />
          </button>
          <button type="button" className="icon-btn" title="Settings">
            <Icon.settings size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

function NavItem({ label, active }: { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        fontFamily: "var(--serif-stack)",
        fontSize: 14,
        fontWeight: 500,
        color: active ? "var(--ink)" : "var(--ink-muted)",
        letterSpacing: 0.1,
        borderBottom: active
          ? "1px solid var(--accent)"
          : "1px solid transparent",
        paddingBottom: 2,
        transition: "color 0.15s, border-color 0.15s",
      }}
    >
      {label}
    </button>
  );
}

function Hero({
  total,
  reading,
  finished,
}: {
  total: number;
  reading: number;
  finished: number;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end gap-x-8 gap-y-4">
      <div className="min-w-[280px] flex-1">
        <div
          className="leading-none"
          style={{
            fontFamily: "var(--heading-stack)",
            fontSize: 44,
            fontWeight: 500,
            color: "var(--ink)",
            letterSpacing: -0.4,
          }}
        >
          Your library,{" "}
          <span style={{ fontStyle: "italic", color: "var(--accent)" }}>
            read carefully.
          </span>
        </div>
        <p
          className="mt-3 italic"
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: 14.5,
            color: "var(--ink-soft)",
            maxWidth: 620,
          }}
        >
          {EPIGRAPH}{" "}
          <span style={{ color: "var(--ink-muted)", opacity: 0.85 }}>
            Books live in your browser. Nothing leaves until you want it to.
          </span>
        </p>
      </div>

      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-1"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 11,
          color: "var(--ink-muted)",
          letterSpacing: 0.3,
        }}
      >
        <Stat label="in library" value={total} />
        <Dot />
        <Stat label="in progress" value={reading} />
        <Dot />
        <Stat label="finished" value={finished} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        style={{
          fontFamily: "var(--mono-stack)",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--ink)",
        }}
      >
        {value}
      </span>
      <span className="uppercase">{label}</span>
    </span>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      style={{
        width: 3,
        height: 3,
        borderRadius: 999,
        background: "var(--rule)",
        display: "inline-block",
      }}
    />
  );
}

// -- Toolbar --------------------------------------------------------------

function Toolbar({
  query,
  onQuery,
  view,
  onView,
  resultCount,
  totalCount,
  onAdd,
}: {
  query: string;
  onQuery: (s: string) => void;
  view: View;
  onView: (v: View) => void;
  resultCount: number;
  totalCount: number;
  onAdd: () => void;
}) {
  return (
    <div className="mb-5 mt-3 flex flex-wrap items-center gap-3">
      <div
        className="flex flex-1 items-center gap-2 rounded-[8px]"
        style={{
          border: "1px solid var(--rule)",
          background: "rgba(127,127,127,0.04)",
          padding: "6px 10px",
          minWidth: 220,
          maxWidth: 360,
        }}
      >
        <SearchGlyph />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search by title or author"
          className="flex-1 bg-transparent outline-none"
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 13,
            color: "var(--ink)",
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label="Clear search"
            className="icon-btn"
            style={{ width: 22, height: 22, borderRadius: 6 }}
          >
            <Icon.close size={12} />
          </button>
        )}
      </div>

      <div
        className="ml-auto hidden sm:block"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 11,
          color: "var(--ink-muted)",
          letterSpacing: 0.3,
        }}
      >
        {query.trim()
          ? `${resultCount} of ${totalCount}`
          : `${totalCount} ${totalCount === 1 ? "book" : "books"}`}
      </div>

      <div
        className="flex rounded-[10px] p-[3px]"
        style={{ border: "1px solid var(--rule)", background: "transparent" }}
      >
        <ViewToggle
          active={view === "grid"}
          onClick={() => onView("grid")}
          label="Grid"
        />
        <ViewToggle
          active={view === "list"}
          onClick={() => onView("list")}
          label="List"
        />
      </div>

      <div
        aria-hidden
        style={{
          width: 1,
          height: 24,
          background: "var(--rule-soft)",
          margin: "0 4px",
        }}
      />

      <button type="button" className="filled-btn" onClick={onAdd}>
        <Icon.plus size={14} />
        <span>Add book</span>
      </button>
    </div>
  );
}

function ViewToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[7px]"
      style={{
        padding: "5px 12px",
        fontFamily: "var(--inter-stack)",
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: 0.2,
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--paper)" : "var(--ink-muted)",
        border: "none",
        cursor: "pointer",
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {label}
    </button>
  );
}

function SearchGlyph() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: "var(--ink-muted)" }}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

// -- Views ----------------------------------------------------------------

function GridView({
  books,
  onAdd,
  onDelete,
}: {
  books: BookWithProgress[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {books.map((b) => (
        <BookTile key={b.id} book={b} onDelete={onDelete} />
      ))}
      <AddTile onClick={onAdd} />
    </div>
  );
}

function BookTile({
  book,
  onDelete,
}: {
  book: BookWithProgress;
  onDelete: (id: string) => void;
}) {
  const href = `/read/${book.id}`;
  const pct = book.progress?.percentage ?? 0;
  const inProgress = pct > 0 && pct < 1;
  const finished = pct >= 1;
  return (
    <div className="group relative">
      <Link
        to={href}
        className="block transition-transform group-hover:-translate-y-0.5"
      >
        <BookCover
          bookId={book.id}
          title={book.title}
          author={book.author}
          coverBlob={book.coverBlob ?? null}
          progress={pct}
        />
        <div className="mt-3 flex items-start gap-2">
          {inProgress && (
            <span
              aria-hidden
              title="in progress"
              className="mt-[7px] shrink-0"
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: "var(--accent)",
              }}
            />
          )}
          <div className="min-w-0 flex-1">
            <div
              className="truncate"
              style={{
                fontFamily: "var(--serif-stack)",
                fontSize: 15,
                fontWeight: 500,
                color: "var(--ink)",
              }}
            >
              {book.title}
            </div>
            <div
              className="truncate italic"
              style={{
                fontFamily: "var(--serif-stack)",
                fontSize: 12.5,
                color: "var(--ink-muted)",
              }}
            >
              {book.author || "\u2014"}
            </div>
            {(inProgress || finished) && (
              <div
                className="mt-1"
                style={{
                  fontFamily: "var(--mono-stack)",
                  fontSize: 10.5,
                  letterSpacing: 0.4,
                  color: "var(--ink-muted)",
                }}
              >
                {finished ? "finished" : `${Math.round(pct * 100)}%`}
              </div>
            )}
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          if (confirm(`Remove "${book.title}" from your library?`)) {
            onDelete(book.id);
          }
        }}
        className="icon-btn absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100"
        title="Remove"
        style={{
          width: 28,
          height: 28,
          background: "rgba(0,0,0,0.4)",
          color: "var(--paper)",
        }}
      >
        <Icon.trash size={14} />
      </button>
    </div>
  );
}

function AddTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col items-center justify-center text-center"
      style={{
        aspectRatio: "3 / 4",
        border: "1px dashed var(--rule)",
        borderRadius: 4,
        background: "rgba(127,127,127,0.03)",
        color: "var(--ink-muted)",
        cursor: "pointer",
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          border: "1px solid var(--rule)",
          color: "var(--ink-soft)",
        }}
      >
        <Icon.plus size={18} />
      </span>
      <span
        className="mt-3 uppercase"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 10.5,
          letterSpacing: 1.4,
          fontWeight: 600,
          color: "var(--ink-muted)",
        }}
      >
        Add a book
      </span>
      <span
        className="mt-1.5 italic"
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 12,
          color: "var(--ink-muted)",
          opacity: 0.75,
          padding: "0 18px",
        }}
      >
        drop an .epub,
        <br />
        begin a quiet read
      </span>
    </button>
  );
}

function ListView({
  books,
  onAdd,
  onDelete,
}: {
  books: BookWithProgress[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className="overflow-hidden"
      style={{
        border: "1px solid var(--rule-soft)",
        borderRadius: 12,
        background: "var(--panel-bg)",
      }}
    >
      <div
        className="grid border-b"
        style={{
          gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr) 140px 80px",
          padding: "10px 18px",
          borderColor: "var(--rule-soft)",
          fontFamily: "var(--inter-stack)",
          fontSize: 10,
          letterSpacing: 1.3,
          fontWeight: 600,
          textTransform: "uppercase",
          color: "var(--ink-muted)",
        }}
      >
        <div>Title</div>
        <div>Author</div>
        <div>Progress</div>
        <div style={{ textAlign: "right" }}>—</div>
      </div>
      {books.map((b, i) => (
        <ListRow
          key={b.id}
          book={b}
          last={i === books.length - 1}
          onDelete={onDelete}
        />
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center gap-3 border-t"
        style={{
          padding: "14px 18px",
          borderColor: "var(--rule-soft)",
          color: "var(--ink-muted)",
          fontFamily: "var(--inter-stack)",
          fontSize: 13,
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <Icon.plus size={14} />
        <span>Add another book</span>
      </button>
    </div>
  );
}

function ListRow({
  book,
  last,
  onDelete,
}: {
  book: BookWithProgress;
  last: boolean;
  onDelete: (id: string) => void;
}) {
  const href = `/read/${book.id}`;
  const pct = Math.round((book.progress?.percentage ?? 0) * 100);
  return (
    <div
      className="grid items-center"
      style={{
        gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr) 140px 80px",
        padding: "14px 18px",
        borderBottom: last ? "none" : "1px solid var(--rule-soft)",
      }}
    >
      <Link
        to={href}
        className="truncate"
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 15,
          fontWeight: 500,
          color: "var(--ink)",
          textDecoration: "none",
        }}
      >
        {book.title}
      </Link>
      <div
        className="truncate italic"
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 13,
          color: "var(--ink-muted)",
        }}
      >
        {book.author || "\u2014"}
      </div>
      <div>
        <div
          style={{
            height: 3,
            background: "var(--rule-soft)",
            borderRadius: 999,
            overflow: "hidden",
            width: 120,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.max(0, Math.min(100, pct))}%`,
              background: "var(--accent)",
            }}
          />
        </div>
      </div>
      <div className="flex items-center justify-end">
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            if (confirm(`Remove "${book.title}" from your library?`)) {
              onDelete(book.id);
            }
          }}
          title="Remove"
        >
          <Icon.trash size={14} />
        </button>
      </div>
    </div>
  );
}

// -- Empty / no-matches ---------------------------------------------------

function NoMatches({ query }: { query: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p
        className="mb-1"
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 18,
          color: "var(--ink)",
        }}
      >
        Nothing matches {'"'}
        {query.trim()}
        {'"'}.
      </p>
      <p
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 12.5,
          color: "var(--ink-muted)",
        }}
      >
        Try a different title or author.
      </p>
    </div>
  );
}

function EmptyState({
  onAdd,
  importing,
}: {
  onAdd: () => void;
  importing: boolean;
}) {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <p
        className="mb-2"
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 22,
          fontWeight: 500,
          color: "var(--ink)",
        }}
      >
        Your library is empty.
      </p>
      <p
        className="mx-auto mb-6"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 13.5,
          color: "var(--ink-muted)",
          maxWidth: 420,
        }}
      >
        Drop an EPUB to start reading. Everything stays local — books live in
        your browser&apos;s IndexedDB.
      </p>
      <button
        type="button"
        className="filled-btn"
        onClick={onAdd}
        disabled={importing}
      >
        <Icon.plus size={14} />
        <span>{importing ? "Ingesting…" : "Add your first book"}</span>
      </button>
    </div>
  );
}
