import { createEmptyCard, fsrs, Rating, type Card, type RecordLog } from "ts-fsrs";

import type { FsrsCardState, Grade } from "./types";

/**
 * Thin wrapper around ts-fsrs. We serialize the FSRS `Card` as JSON into
 * `review_cards.fsrs_state` and use this module for the two round-trips
 * (create + review). Everything else in the quiz code stays typed against
 * our own `FsrsCardState`.
 *
 * Defaults match ts-fsrs v5's FSRS-6 defaults (retention 0.9, 14-day
 * relearning). If you tune these per-user later, expose them through
 * reader_profile.
 */
const scheduler = fsrs();

const GRADE_TO_RATING: Record<Grade, Rating.Again | Rating.Hard | Rating.Good | Rating.Easy> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export function newCardState(now: Date = new Date()): FsrsCardState {
  return fsrsToState(createEmptyCard(now));
}

export type ReviewResult = {
  next: FsrsCardState;
  /** ms-since-epoch when the card is next due. */
  dueAt: number;
  /** Interval in days before the next review. */
  scheduledDays: number;
};

export function applyReview(
  state: FsrsCardState,
  grade: Grade,
  now: Date = new Date(),
): ReviewResult {
  const card = stateToFsrs(state);
  const log: RecordLog = scheduler.repeat(card, now);
  const item = log[GRADE_TO_RATING[grade]];
  const nextState = fsrsToState(item.card);
  return {
    next: nextState,
    dueAt: new Date(nextState.due).getTime(),
    scheduledDays: item.log.scheduled_days,
  };
}

// -- Conversions ----------------------------------------------------------

function fsrsToState(card: Card): FsrsCardState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : undefined,
  };
}

function stateToFsrs(state: FsrsCardState): Card {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsed_days,
    scheduled_days: state.scheduled_days,
    learning_steps: state.learning_steps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    last_review: state.last_review ? new Date(state.last_review) : undefined,
  };
}
