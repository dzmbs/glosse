/**
 * Library — home page.
 *
 * Server Component: fetches the list of ingested books from FastAPI and
 * renders with SSR. The "Add book" button is a client component
 * (LibraryActions) so it can open the upload dialog without forcing this
 * whole page into a client boundary.
 *
 * Clicking a book links directly to its first section (/read/{id}/0).
 * Resume-at-progress is an explicit choice made elsewhere; the library
 * is the "start over" entry point.
 */

import Link from "next/link";

import { LibraryActions } from "@/components/library/LibraryActions";
import { BookCover } from "@/components/library/BookCover";
import { api, type BookSummary } from "@/lib/api";

export const dynamic = "force-dynamic";

type BookWithProgress = BookSummary & { pct: number; inProgress: boolean; finished: boolean };

export default async function LibraryPage() {
  const { books: rawBooks } = await api.library();
  const books = rawBooks.map(decorate);
  const reading = books.filter((b) => b.inProgress);
  const shelf = books.filter((b) => !b.inProgress);

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <LibraryHeader total={books.length} reading={reading.length} />

      {books.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mx-auto max-w-[1200px] px-10 pb-20 pt-9">
          {reading.length > 0 && (
            <>
              <SectionLabel>Continue reading</SectionLabel>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {reading.map((b) => (
                  <BookTile key={b.id} book={b} size="large" />
                ))}
              </div>
            </>
          )}

          {shelf.length > 0 && (
            <>
              <div className="mt-12">
                <SectionLabel>On your shelf</SectionLabel>
              </div>
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-5">
                {shelf.map((b) => (
                  <BookTile key={b.id} book={b} size="small" />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// -- Helpers --------------------------------------------------------------

function decorate(b: BookSummary): BookWithProgress {
  const pct = b.chapters > 0 ? (b.progress + 1) / b.chapters : 0;
  const finished = b.chapters > 0 && b.progress >= b.chapters - 1;
  const inProgress = b.progress > 0 && !finished;
  return { ...b, pct, inProgress, finished };
}

function LibraryHeader({ total, reading }: { total: number; reading: number }) {
  return (
    <header
      className="flex items-center gap-5 border-b px-10 py-6"
      style={{ borderColor: "var(--rule-soft)" }}
    >
      <div className="flex-1">
        <div
          className="leading-none"
          style={{
            fontFamily: "var(--heading-stack)",
            fontSize: 32,
            fontWeight: 500,
            color: "var(--ink)",
          }}
        >
          Library
        </div>
        <div
          className="mt-1"
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 12,
            color: "var(--ink-muted)",
          }}
        >
          {total} {total === 1 ? "book" : "books"}
          {reading > 0 ? ` · ${reading} in progress` : ""}
        </div>
      </div>
      <LibraryActions />
    </header>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-4 font-semibold uppercase"
      style={{
        fontFamily: "var(--inter-stack)",
        fontSize: 10.5,
        letterSpacing: 1.4,
        color: "var(--ink-muted)",
      }}
    >
      {children}
    </div>
  );
}

function BookTile({
  book,
  size,
}: {
  book: BookWithProgress;
  size: "large" | "small";
}) {
  const author = book.authors.join(", ");
  // Library clicks always start at section 0. Resume-to-last-read is a
  // separate affordance (the top bar's book title, a bookmark, etc.) —
  // the library is the "start fresh" entry point.
  const href = `/read/${book.id}/0`;
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
        size={size}
        markRead={book.finished}
      />
      <div className="mt-3">
        <div
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: size === "large" ? 17 : 13.5,
            fontWeight: 500,
            color: "var(--ink)",
          }}
        >
          {book.title}
        </div>
        <div
          className="italic"
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: size === "large" ? 13.5 : 11.5,
            color: "var(--ink-muted)",
          }}
        >
          {author || "—"}
        </div>
        {size === "large" && (
          <div className="mt-1.5 flex items-center gap-2">
            <span
              style={{
                fontFamily: "var(--mono-stack)",
                fontSize: 10.5,
                letterSpacing: 0.5,
                color: "var(--ink-muted)",
              }}
            >
              {book.finished
                ? "finished"
                : `${Math.round(book.pct * 100)}% · section ${book.progress + 1}`}
            </span>
            <IndexBadge book={book} />
          </div>
        )}
      </div>
    </Link>
  );
}

/**
 * Tiny status pill shown on each book card.
 *   - "indexed" — chunks.pkl exists, RAG retrieval is ready.
 *   - "queued"  — EPUB sitting in data/inbox/ awaiting the next server boot.
 * Nothing is rendered when neither signal is present.
 */
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

function EmptyState() {
  return (
    <div className="mx-auto max-w-xl px-10 py-20 text-center">
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
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 14,
          color: "var(--ink-muted)",
        }}
      >
        Click <span className="font-semibold">Add book</span> above to upload an
        EPUB, or drop one into <code
          className="mx-1 rounded px-1.5 py-0.5"
          style={{
            fontFamily: "var(--mono-stack)",
            fontSize: 12,
            background: "var(--rule-soft)",
          }}
        >data/inbox/</code> and restart the server.
      </p>
    </div>
  );
}
