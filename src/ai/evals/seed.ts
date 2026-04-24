import type { EvalCase } from "./types";

/**
 * Starter evals focused on Glosse-specific product behavior.
 *
 * These are intentionally small and opinionated. The point is to encode
 * concrete reader expectations early, then grow the set from real failures.
 * Matching is title/author based so the dataset survives re-uploads, where
 * book ids change.
 */
export const GLOSSE_EVAL_SEED: EvalCase[] = [
  {
    id: "rust-overview-cover-page",
    bookTitle: "Rust Atomics and Locks",
    bookAuthor: "Mara Bos",
    question: "what is this book about?",
    currentPage: 1,
    tags: ["overview", "front-matter", "starter"],
    preferredPages: [1],
    acceptablePages: [1],
    requiredAnswerSubstrings: ["concurrency"],
    notes:
      "Cover-page overview should stay grounded in the title/subtitle and must not reach forward.",
  },
  {
    id: "rust-mutex-local-focus",
    bookTitle: "Rust Atomics and Locks",
    bookAuthor: "Mara Bos",
    question: "what is mutex?",
    currentPage: 74,
    tags: ["local-focus", "definition", "starter"],
    preferredPages: [74],
    acceptablePages: [32, 33, 35, 40, 48, 74],
    requiredAnswerSubstrings: ["lock"],
    forbiddenPages: [75, 76, 77],
    notes:
      "Current page should win if it already defines the term. Earlier pages are acceptable support, not the main answer.",
  },
  {
    id: "rust-mutex-spoiler-boundary",
    bookTitle: "Rust Atomics and Locks",
    bookAuthor: "Mara Bos",
    question: "what is mutex?",
    currentPage: 74,
    tags: ["spoiler", "definition", "starter"],
    forbiddenPages: [75, 76, 77, 78, 79, 80],
    notes:
      "No chunk or citation should come from later pages when spoiler protection is on.",
  },
  {
    id: "rust-later-content-guard",
    bookTitle: "Rust Atomics and Locks",
    bookAuthor: "Mara Bos",
    question: "what happens later in the book?",
    currentPage: 74,
    tags: ["spoiler", "refusal", "starter"],
    forbiddenPages: [75, 76, 77, 78, 79, 80],
    notes:
      "This is mostly a spoiler-safety regression case. Manual review should confirm the answer declines rather than speculates.",
  },
  {
    id: "rust-current-page-preference-smoke",
    bookTitle: "Rust Atomics and Locks",
    bookAuthor: "Mara Bos",
    question: "explain the page i'm reading now",
    currentPage: 74,
    tags: ["local-focus", "reader-intent", "starter"],
    preferredPages: [74],
    forbiddenPages: [75, 76, 77, 78, 79, 80],
    notes:
      "When the question is explicitly page-local, top retrieval should be the current page or very near it.",
  },
];
