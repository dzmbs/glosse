import type { ReviewCardRow } from "../db/schema";

export type Grade = "again" | "hard" | "good" | "easy";

/** Card shape seen by the UI — DB row normalized + parsed FSRS state. */
export type QuizCard = {
  id: string;
  bookId: string;
  front: string;
  back: string;
  explanation: string | null;
  sourceChunkId: number | null;
  sourceCfi: string | null;
  dueAt: number;
  lastReviewedAt: number | null;
  createdAt: number;
  fsrs: FsrsCardState;
};

/** Serialized FSRS card state — we keep this identical to ts-fsrs's
 *  `Card` interface so the scheduler round-trips without conversion. */
export type FsrsCardState = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
};

export function rowToCard(row: ReviewCardRow): QuizCard {
  let fsrs: FsrsCardState;
  try {
    fsrs = JSON.parse(row.fsrs_state) as FsrsCardState;
  } catch {
    fsrs = defaultFsrsState();
  }
  return {
    id: row.id,
    bookId: row.book_id,
    front: row.front,
    back: row.back,
    explanation: row.explanation ?? null,
    sourceChunkId: row.source_chunk_id,
    sourceCfi: row.source_cfi,
    dueAt: row.due_at,
    lastReviewedAt: row.last_reviewed_at,
    createdAt: row.created_at,
    fsrs,
  };
}

export function defaultFsrsState(): FsrsCardState {
  const now = new Date().toISOString();
  return {
    due: now,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    state: 0,
  };
}
