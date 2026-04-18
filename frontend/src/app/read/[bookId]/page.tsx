/**
 * /read/[bookId] — resume reading.
 *
 * Server-side redirects to the user's current chapter. Progress lives in
 * FastAPI (glosse.server.progress) and is returned as part of the book
 * detail response.
 */

import { redirect } from "next/navigation";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ResumeReading({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const book = await api.book(bookId);
  redirect(`/read/${bookId}/${book.progress}`);
}
