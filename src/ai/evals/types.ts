import type { BookIndexRow } from "../db/schema";
import type { RetrievedChunk } from "../types";

export type EvalCase = {
  id: string;
  bookTitle: string;
  bookAuthor?: string;
  question: string;
  currentPage: number;
  tags: string[];
  /**
   * Pages we strongly want to see at the top of retrieval.
   * Use this for current-page focus or exact-page grounding.
   */
  preferredPages?: number[];
  /**
   * Pages that are acceptable evidence for the question.
   * If omitted, retrieval is judged only on spoiler bounds and manual review.
   */
  acceptablePages?: number[];
  /** Pages that must never be retrieved or cited. */
  forbiddenPages?: number[];
  /**
   * Optional answer-string checks for deterministic smoke tests.
   * Keep these short and semantic, not exact-answer brittle.
   */
  requiredAnswerSubstrings?: string[];
  forbiddenAnswerSubstrings?: string[];
  notes?: string;
};

export type IndexedEvalBook = BookIndexRow;

export type ResolvedEvalCase =
  | {
      source: EvalCase;
      resolution: "matched";
      matchedBook: IndexedEvalBook;
    }
  | {
      source: EvalCase;
      resolution: "missing";
      reason: string;
    }
  | {
      source: EvalCase;
      resolution: "ambiguous";
      reason: string;
      candidates: IndexedEvalBook[];
    };

export type RetrievalEvalResult = {
  passages: RetrievedChunk[];
  retrievedPages: number[];
  top1Page: number | null;
  spoilerSafe: boolean;
  preferredHitRank: number | null;
  acceptableHitRank: number | null;
  forbiddenHitRank: number | null;
  top1Preferred: boolean | null;
  top1Acceptable: boolean | null;
  nearestPreferredDistance: number | null;
};

export type AnswerEvalResult = {
  text: string;
  citedPages: number[];
  citedOnlyRetrievedPages: boolean;
  citedSpoilerSafe: boolean;
  requiredSubstringsOk: boolean;
  forbiddenSubstringsOk: boolean;
};

export type EvalRunResult = {
  caseId: string;
  retrieval: RetrievalEvalResult;
  answer?: AnswerEvalResult;
};
