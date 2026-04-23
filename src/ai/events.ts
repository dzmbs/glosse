import { getDb } from "./db/client";

export type ReadingEventInput = {
  bookId: string;
  kind: string;
  pageNumber?: number | null;
  sectionIndex?: number | null;
  durationMs?: number | null;
};

export async function recordReadingEvent(
  event: ReadingEventInput,
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `INSERT INTO reading_events (
         book_id,
         kind,
         page_number,
         section_index,
         duration_ms
       ) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      event.bookId,
      event.kind,
      event.pageNumber ?? null,
      event.sectionIndex ?? null,
      event.durationMs ?? null,
    );
}
