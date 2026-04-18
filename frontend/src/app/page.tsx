/**
 * Library — the home page. Server Component: fetches the list of ingested
 * books from FastAPI directly (no client round-trip), renders as SSR.
 *
 * LATER: real book covers (the design shows color-blocked covers with the
 * author/title typeset on them — for now we render a flat paper card).
 * LATER: "Continue reading" vs "On your shelf" split, "Add book" button.
 */

import Link from "next/link";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic"; // progress updates whenever we read

export default async function LibraryPage() {
  const { books } = await api.library();

  return (
    <main className="mx-auto max-w-5xl px-8 py-16">
      <header className="mb-12">
        <h1
          className="text-5xl font-medium tracking-tight"
          style={{ fontFamily: "var(--font-serif)", color: "var(--color-ink)" }}
        >
          glosse
        </h1>
        <p
          className="mt-2 text-sm"
          style={{
            fontFamily: "var(--font-sans)",
            color: "var(--color-ink-muted)",
          }}
        >
          AI that helps you think while you read.
        </p>
      </header>

      {books.length === 0 ? (
        <EmptyState />
      ) : (
        <section>
          <h2
            className="mb-4 text-xs font-semibold uppercase tracking-widest"
            style={{
              fontFamily: "var(--font-sans)",
              color: "var(--color-ink-muted)",
            }}
          >
            Your library
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((b) => (
              <BookCard key={b.id} book={b} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function BookCard({
  book,
}: {
  book: {
    id: string;
    title: string;
    authors: string[];
    chapters: number;
    progress: number;
  };
}) {
  const pct = book.chapters > 0 ? ((book.progress + 1) / book.chapters) * 100 : 0;
  return (
    <Link
      href={`/read/${book.id}`}
      className="group block rounded-lg p-5 transition-colors"
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-rule-soft)",
      }}
    >
      <div
        className="mb-2 text-lg font-medium"
        style={{ fontFamily: "var(--font-serif)", color: "var(--color-ink)" }}
      >
        {book.title}
      </div>
      <div
        className="mb-4 text-sm italic"
        style={{ fontFamily: "var(--font-serif)", color: "var(--color-ink-muted)" }}
      >
        {book.authors.join(", ") || "—"}
      </div>
      <div
        className="mb-2 text-xs"
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--color-ink-muted)",
        }}
      >
        {book.chapters} sections · at section {book.progress + 1}
      </div>
      <div
        className="h-[3px] overflow-hidden rounded-sm"
        style={{ background: "var(--color-rule)" }}
      >
        <div
          className="h-full transition-[width]"
          style={{
            width: `${pct}%`,
            background: "var(--color-accent)",
          }}
        />
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-lg p-8 text-center"
      style={{ background: "var(--color-panel)", color: "var(--color-ink-soft)" }}
    >
      <p
        className="mb-2 text-lg"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Your library is empty.
      </p>
      <p
        className="text-sm"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        Ingest an EPUB from the project root:
        <br />
        <code
          className="mt-2 inline-block rounded px-2 py-1"
          style={{
            fontFamily: "var(--font-mono)",
            background: "var(--color-rule-soft)",
          }}
        >
          uv run glosse ingest path/to/book.epub
        </code>
      </p>
    </div>
  );
}
