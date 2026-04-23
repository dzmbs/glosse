import { getDb } from "./db/client";
import type { HighlightRow } from "./db/schema";

export type Highlight = {
  id: string;
  bookId: string;
  cfi: string;
  text: string;
  note: string | null;
  color: string;
  pageNumber: number | null;
  createdAt: number;
  updatedAt: number;
};

function makeId(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `hl_${uuid}`;
}

function rowToHighlight(row: HighlightRow): Highlight {
  return {
    id: row.id,
    bookId: row.book_id,
    cfi: row.cfi,
    text: row.text,
    note: row.note,
    color: row.color,
    pageNumber: row.page_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listHighlights(bookId: string): Promise<Highlight[]> {
  const db = await getDb();
  const rows = (await db
    .prepare(
      `SELECT * FROM highlights WHERE book_id = ? ORDER BY created_at DESC`,
    )
    .all(bookId)) as HighlightRow[];
  return rows.map(rowToHighlight);
}

export async function createHighlight(input: {
  bookId: string;
  cfi: string;
  text: string;
  note?: string | null;
  color?: string;
  pageNumber?: number | null;
}): Promise<Highlight> {
  const db = await getDb();
  const id = makeId();
  await db
    .prepare(
      `INSERT INTO highlights (id, book_id, cfi, text, note, color, page_number)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.bookId,
      input.cfi,
      input.text,
      input.note ?? null,
      input.color ?? "yellow",
      input.pageNumber ?? null,
    );
  const row = (await db
    .prepare(`SELECT * FROM highlights WHERE id = ?`)
    .get(id)) as HighlightRow;
  return rowToHighlight(row);
}

export async function updateHighlightNote(
  id: string,
  note: string | null,
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `UPDATE highlights SET note = ?, updated_at = unixepoch() WHERE id = ?`,
    )
    .run(note, id);
}

export async function deleteHighlight(id: string): Promise<void> {
  const db = await getDb();
  await db.prepare(`DELETE FROM highlights WHERE id = ?`).run(id);
}

export async function countHighlights(bookId: string): Promise<number> {
  const db = await getDb();
  const row = (await db
    .prepare(`SELECT COUNT(*) AS c FROM highlights WHERE book_id = ?`)
    .get(bookId)) as { c: number };
  return row.c;
}
