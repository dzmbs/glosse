import { getDb } from "./client";
import type { BookRow } from "./schema";

export type BookMetadata = {
  id: string;
  title: string;
  author: string;
  addedAt: number;
};

function rowToMetadata(row: BookRow): BookMetadata {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    addedAt: row.added_at,
  };
}

export async function putBookMetadata(book: BookMetadata): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `INSERT INTO books (id, title, author, added_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         author = excluded.author,
         added_at = excluded.added_at`,
    )
    .run(book.id, book.title, book.author, book.addedAt);
}

export async function getBookMetadata(
  id: string,
): Promise<BookMetadata | undefined> {
  const db = await getDb();
  const row = (await db
    .prepare(`SELECT * FROM books WHERE id = ?`)
    .get(id)) as BookRow | undefined;
  return row ? rowToMetadata(row) : undefined;
}

export async function listBookMetadata(): Promise<BookMetadata[]> {
  const db = await getDb();
  const rows = (await db
    .prepare(`SELECT * FROM books ORDER BY added_at DESC`)
    .all()) as BookRow[];
  return rows.map(rowToMetadata);
}

export async function deleteBookMetadata(id: string): Promise<void> {
  const db = await getDb();
  await db.prepare(`DELETE FROM books WHERE id = ?`).run(id);
}
