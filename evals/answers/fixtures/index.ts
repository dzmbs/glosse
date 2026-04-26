import * as rust from "../../../bench/fixture.ts";
import * as hod from "./heart-of-darkness.ts";
import * as fr from "./frankenstein.ts";
import * as ol from "./on-liberty.ts";
import type { BookIdentity, RetrievedChunk } from "../../../src/ai/types.ts";

export type EvalBook = {
  book: BookIdentity & { currentPage: number; totalPages: number };
  passages: RetrievedChunk[];
};

export const BOOKS: Record<string, EvalBook> = {
  "rust-atomics": { book: rust.FIXTURE_BOOK, passages: rust.FIXTURE_PASSAGES },
  "heart-of-darkness": { book: hod.BOOK, passages: hod.PASSAGES },
  frankenstein: { book: fr.BOOK, passages: fr.PASSAGES },
  "on-liberty": { book: ol.BOOK, passages: ol.PASSAGES },
};
