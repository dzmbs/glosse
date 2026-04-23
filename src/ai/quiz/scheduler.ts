import { getDb } from "../db/client";
import type { ReviewCardRow } from "../db/schema";

import { applyReview, newCardState } from "./fsrs";
import { rowToCard, type Grade, type QuizCard } from "./types";

function makeCardId(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `card_${uuid}`;
}

export type NewCardInput = {
  bookId: string;
  front: string;
  back: string;
  explanation?: string | null;
  sourceChunkId?: number | null;
  sourceCfi?: string | null;
};

export async function insertCards(
  cards: NewCardInput[],
): Promise<QuizCard[]> {
  if (cards.length === 0) return [];
  const db = await getDb();
  const stmt = db.prepare(
    `INSERT INTO review_cards (id, book_id, source_cfi, source_chunk_id,
      front, back, explanation, fsrs_state, due_at, last_reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  );
  const out: QuizCard[] = [];
  const now = new Date();
  for (const c of cards) {
    const id = makeCardId();
    const state = newCardState(now);
    const dueAt = new Date(state.due).getTime();
    await stmt.run(
      id,
      c.bookId,
      c.sourceCfi ?? null,
      c.sourceChunkId ?? null,
      c.front,
      c.back,
      c.explanation ?? null,
      JSON.stringify(state),
      dueAt,
    );
    const row = (await db
      .prepare(`SELECT * FROM review_cards WHERE id = ?`)
      .get(id)) as ReviewCardRow;
    out.push(rowToCard(row));
  }
  return out;
}

export async function listDueCards(
  bookId: string | null,
  limit = 20,
): Promise<QuizCard[]> {
  const db = await getDb();
  const nowMs = Date.now();
  const rows = bookId
    ? ((await db
        .prepare(
          `SELECT * FROM review_cards
           WHERE book_id = ? AND due_at <= ?
           ORDER BY due_at ASC LIMIT ?`,
        )
        .all(bookId, nowMs, limit)) as ReviewCardRow[])
    : ((await db
        .prepare(
          `SELECT * FROM review_cards
           WHERE due_at <= ?
           ORDER BY due_at ASC LIMIT ?`,
        )
        .all(nowMs, limit)) as ReviewCardRow[]);
  return rows.map(rowToCard);
}

export async function listAllCards(bookId: string): Promise<QuizCard[]> {
  const db = await getDb();
  const rows = (await db
    .prepare(
      `SELECT * FROM review_cards WHERE book_id = ? ORDER BY created_at DESC`,
    )
    .all(bookId)) as ReviewCardRow[];
  return rows.map(rowToCard);
}

export async function countCards(
  bookId: string,
): Promise<{ total: number; dueNow: number }> {
  const db = await getDb();
  const nowMs = Date.now();
  const total = ((await db
    .prepare(`SELECT COUNT(*) AS c FROM review_cards WHERE book_id = ?`)
    .get(bookId)) as { c: number }).c;
  const dueNow = ((await db
    .prepare(
      `SELECT COUNT(*) AS c FROM review_cards WHERE book_id = ? AND due_at <= ?`,
    )
    .get(bookId, nowMs)) as { c: number }).c;
  return { total, dueNow };
}

export async function recordReview(
  cardId: string,
  grade: Grade,
): Promise<QuizCard> {
  const db = await getDb();
  const row = (await db
    .prepare(`SELECT * FROM review_cards WHERE id = ?`)
    .get(cardId)) as ReviewCardRow;
  const card = rowToCard(row);
  const result = applyReview(card.fsrs, grade);
  await db
    .prepare(
      `UPDATE review_cards
       SET fsrs_state = ?, due_at = ?, last_reviewed_at = ?
       WHERE id = ?`,
    )
    .run(
      JSON.stringify(result.next),
      result.dueAt,
      Math.floor(Date.now() / 1000),
      cardId,
    );
  return {
    ...card,
    fsrs: result.next,
    dueAt: result.dueAt,
    lastReviewedAt: Math.floor(Date.now() / 1000),
  };
}

export async function deleteCard(cardId: string): Promise<void> {
  const db = await getDb();
  await db.prepare(`DELETE FROM review_cards WHERE id = ?`).run(cardId);
}
