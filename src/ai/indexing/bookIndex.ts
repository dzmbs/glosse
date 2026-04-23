import { getDb } from "../db/client";

import {
  parseBookIndexRow,
  type BookIndexConfig,
  type BookIndexRow,
} from "./bookIndexParsing";

export {
  BookIndexUnavailableError,
  bookIndexErrorSummary,
  parseBookIndexRow,
  providerLabel,
  sameEmbeddingConfig,
  type BookIndexConfig,
  type BookIndexRow,
} from "./bookIndexParsing";

/**
 * Fetch the book's stored embedding config. Returns null when the book
 * has never been indexed (the caller should treat that as a needs-index
 * state, not an error).
 */
export async function getBookIndexConfig(
  bookId: string,
): Promise<BookIndexConfig | null> {
  const db = await getDb();
  const row = (await db
    .prepare(
      `SELECT book_id, embedding_model, embedding_provider, embedding_model_id,
              embedding_dim, total_chunks, total_sections, indexed_at
       FROM book_index WHERE book_id = ?`,
    )
    .get(bookId)) as BookIndexRow | undefined;
  if (!row) return null;
  return parseBookIndexRow(row);
}
