"use client";

/**
 * LibraryCatalog — client shell around the book grid.
 *
 * Owns the state that needs interactivity (search query, grid/list view,
 * upload-dialog open flag). The server page decorates the raw API books
 * with progress flags and hands them in here.
 *
 * The "Add to Library" dashed tile and the header's "Add book" button both
 * open the same UploadDialog instance — state lives at this level so they
 * stay in sync.
 */

import Link from "next/link";
import { useMemo, useState } from "react";

import { Icon } from "@/components/Icons";
import { BookCover } from "@/components/library/BookCover";
import { UploadDialog } from "@/components/library/UploadDialog";
import type { BookSummary } from "@/lib/api";

export type BookWithProgress = BookSummary & {
  pct: number;
  inProgress: boolean;
  finished: boolean;
};

type View = "grid" | "list";

export function LibraryCatalog({ books }: { books: BookWithProgress[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("grid");
  const [uploadOpen, setUploadOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter((b) => {
      const hay = `${b.title} ${b.authors.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [books, query]);

  const reading = filtered.filter((b) => b.inProgress);
  const shelf = filtered.filter((b) => !b.inProgress);
  const finishedCount = books.filter((b) => b.finished).length;

  return (
    <>
      <SiteChrome />

      <div className="mx-auto max-w-[1320px] px-10 pb-16 pt-10">
        <LibraryHero
          total={books.length}
          reading={books.filter((b) => b.inProgress).length}
          finished={finishedCount}
          onAdd={() => setUploadOpen(true)}
        />

        <Toolbar
          query={query}
          onQuery={setQuery}
          view={view}
          onView={setView}
          resultCount={filtered.length}
          totalCount={books.length}
          onAdd={() => setUploadOpen(true)}
        />

        {books.length === 0 ? (
          <EmptyState onAdd={() => setUploadOpen(true)} />
        ) : filtered.length === 0 ? (
          <NoMatches query={query} />
        ) : view === "grid" ? (
          <GridView
            books={[...reading, ...shelf]}
            onAdd={() => setUploadOpen(true)}
          />
        ) : (
          <ListView books={filtered} onAdd={() => setUploadOpen(true)} />
        )}
      </div>

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
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
    <header
      className="border-b"
      style={{ borderColor: "var(--rule-soft)" }}
    >
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
          <button
            type="button"
            className="icon-btn"
            aria-label="Ask the guide"
            title="Ask the guide"
          >
            <Icon.sparkle size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Settings"
            title="Settings"
          >
            <Icon.settings size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

function LibraryHero({
  total,
  reading,
  finished,
}: {
  total: number;
  reading: number;
  finished: number;
  onAdd: () => void;
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
            The guide only knows what you&apos;ve already read &mdash; no
            spoilers, ever.
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

function NavItem({ label, active }: { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      className="group"
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
        borderBottom: active ? "1px solid var(--accent)" : "1px solid transparent",
        paddingBottom: 2,
        transition: "color 0.15s, border-color 0.15s",
      }}
    >
      {label}
    </button>
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
          letterSpacing: 0,
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

// -- Grid view ------------------------------------------------------------

function GridView({
  books,
  onAdd,
}: {
  books: BookWithProgress[];
  onAdd: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {books.map((b) => (
        <BookTile key={b.id} book={b} />
      ))}
      <AddTile onClick={onAdd} />
    </div>
  );
}

function BookTile({ book }: { book: BookWithProgress }) {
  const author = book.authors.join(", ");
  const href = `/read/${book.id}/0`;
  const pct = Math.round(book.pct * 100);
  return (
    <Link
      href={href}
      className="group block transition-transform hover:-translate-y-0.5"
    >
      <BookCover
        bookId={book.id}
        title={book.title}
        author={author}
        progress={book.pct}
        size="large"
        markRead={book.finished}
      />
      <div className="mt-3 flex items-start gap-2">
        {book.inProgress && (
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
            {author || "\u2014"}
          </div>
          {(book.inProgress || book.finished) && (
            <div
              className="mt-1"
              style={{
                fontFamily: "var(--mono-stack)",
                fontSize: 10.5,
                letterSpacing: 0.4,
                color: "var(--ink-muted)",
              }}
            >
              {book.finished ? "finished" : `${pct}% \u00b7 section ${book.progress + 1}`}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function AddTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col items-center justify-center text-center transition-colors"
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
        drop an .epub,<br />begin a quiet read
      </span>
    </button>
  );
}

// -- List view ------------------------------------------------------------

function ListView({
  books,
  onAdd,
}: {
  books: BookWithProgress[];
  onAdd: () => void;
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
          gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr) 140px 120px",
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
        <div style={{ textAlign: "right" }}>Status</div>
      </div>
      {books.map((b, i) => (
        <ListRow key={b.id} book={b} last={i === books.length - 1} />
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center gap-3 border-t transition-colors"
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

function ListRow({ book, last }: { book: BookWithProgress; last: boolean }) {
  const author = book.authors.join(", ");
  const href = `/read/${book.id}/0`;
  const pct = Math.round(book.pct * 100);
  const status = book.finished
    ? "finished"
    : book.inProgress
      ? `${pct}%`
      : "unread";
  return (
    <Link
      href={href}
      className="grid items-center transition-colors"
      style={{
        gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr) 140px 120px",
        padding: "14px 18px",
        borderBottom: last ? "none" : "1px solid var(--rule-soft)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
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
          fontSize: 13,
          color: "var(--ink-muted)",
        }}
      >
        {author || "\u2014"}
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
              background: book.finished ? "var(--ink-muted)" : "var(--accent)",
            }}
          />
        </div>
      </div>
      <div
        className="flex items-center justify-end gap-2"
        style={{
          fontFamily: "var(--mono-stack)",
          fontSize: 11,
          color: "var(--ink-muted)",
          letterSpacing: 0.4,
        }}
      >
        <IndexBadge book={book} />
        <span>{status}</span>
      </div>
    </Link>
  );
}

// -- Status badges / empty states -----------------------------------------

function IndexBadge({ book }: { book: BookWithProgress }) {
  if (book.has_chunks) {
    return (
      <span
        className="uppercase"
        title="Chunks + embeddings produced. The Guide agent can ground answers in this book."
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 9,
          letterSpacing: 0.9,
          fontWeight: 600,
          color: "var(--accent)",
          border: "1px solid var(--accent)",
          borderRadius: 999,
          padding: "1px 7px",
        }}
      >
        indexed
      </span>
    );
  }
  if (book.in_inbox) {
    return (
      <span
        className="uppercase"
        title="Source EPUB is in data/inbox/. It will be auto-ingested on next server boot."
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 9,
          letterSpacing: 0.9,
          fontWeight: 600,
          color: "var(--ink-muted)",
          border: "1px solid var(--rule)",
          borderRadius: 999,
          padding: "1px 7px",
        }}
      >
        queued
      </span>
    );
  }
  return null;
}

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

function EmptyState({ onAdd }: { onAdd: () => void }) {
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
        Upload an EPUB to start reading — glosse ingests it, keeps your
        progress, and the Guide panel will only use what you&apos;ve read so
        far.
      </p>
      <button type="button" className="filled-btn" onClick={onAdd}>
        <Icon.plus size={14} />
        <span>Add your first book</span>
      </button>
    </div>
  );
}
