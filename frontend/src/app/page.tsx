/**
 * Library — home page.
 *
 * Server Component: fetches the list of ingested books from FastAPI and
 * decorates each with progress flags, then hands off to LibraryCatalog
 * (client) for search/view-toggle interactivity.
 *
 * Clicking a book links directly to its first section (/read/{id}/0).
 * Resume-at-progress is an explicit choice made elsewhere; the library
 * is the "start over" entry point.
 */

import {
  LibraryCatalog,
  type BookWithProgress,
} from "@/components/library/LibraryCatalog";
import { api, type BookSummary } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const { books: rawBooks } = await api.library();
  const books = rawBooks.map(decorate);

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <LibraryCatalog books={books} />
    </div>
  );
}

function decorate(b: BookSummary): BookWithProgress {
  const pct = b.chapters > 0 ? (b.progress + 1) / b.chapters : 0;
  const finished = b.chapters > 0 && b.progress >= b.chapters - 1;
  const inProgress = b.progress > 0 && !finished;
  return { ...b, pct, inProgress, finished };
}
