/**
 * /read/[bookId]/[chapter] — reader page.
 *
 * Server Component: fetches both the book detail (for the TOC drawer) and
 * the chapter content. Hands both to ReaderClient which owns all
 * interactive state (AI panel, drawers, tweaks, selection menu) and
 * performs animated chapter-to-chapter navigation client-side.
 *
 * Robustness: bogus chapter params (e.g. a garbage EPUB-internal href that
 * somehow leaked into the URL) redirect to the user's current progress
 * instead of crashing. Defence in depth — ReaderClient also intercepts
 * in-chapter anchor clicks before they become navigations.
 */

import { redirect } from "next/navigation";

import { ReaderClient } from "@/components/reader/ReaderClient";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ bookId: string; chapter: string }>;
}) {
  const { bookId, chapter } = await params;

  // Parse. If the URL contains anything other than a pure integer, bounce
  // the reader to the resume page which sends them to their last chapter.
  const chapterIndex = Number(chapter);
  if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
    redirect(`/read/${bookId}`);
  }

  // Fetch book first so we can validate chapter range without a 404 from
  // the chapter endpoint.
  const book = await api.book(bookId);
  if (chapterIndex >= book.chapters_total) {
    redirect(`/read/${bookId}`);
  }

  const ch = await api.chapter(bookId, chapterIndex);
  return <ReaderClient book={book} chapter={ch} />;
}
