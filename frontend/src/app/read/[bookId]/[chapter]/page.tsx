/**
 * /read/[bookId]/[chapter] — reader page.
 *
 * Server Component: fetches both the book detail (for the TOC drawer) and
 * the chapter content. Hands both to ReaderClient which owns all
 * interactive state (AI panel, drawers, tweaks, selection menu).
 */

import { notFound } from "next/navigation";

import { ReaderClient } from "@/components/reader/ReaderClient";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ bookId: string; chapter: string }>;
}) {
  const { bookId, chapter } = await params;
  const chapterIndex = Number.parseInt(chapter, 10);
  if (!Number.isFinite(chapterIndex)) notFound();

  const [book, ch] = await Promise.all([
    api.book(bookId),
    api.chapter(bookId, chapterIndex),
  ]);

  return <ReaderClient book={book} chapter={ch} />;
}
