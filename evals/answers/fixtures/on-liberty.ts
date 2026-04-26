import type { BookIdentity, RetrievedChunk } from "../../../src/ai/types.ts";

export const BOOK: BookIdentity & {
  currentPage: number;
  totalPages: number;
} = {
  bookId: "eval-on-liberty",
  title: "On Liberty",
  author: "John Stuart Mill",
  currentPage: 60,
  totalPages: 175,
};

export const PASSAGES: RetrievedChunk[] = [
  {
    chunkId: 1,
    sectionIndex: 0,
    chapterTitle: "Chapter I — Introductory",
    text: "make itself recognised as the vital question of the future. It is so far from being new, that in a certain sense, it has divided mankind, almost from the remotest ages; but in the stage of progress into which the more civilised portions of the species have now entered, it presents itself under new conditions, and requires a different and more fundamental treatment. The struggle between Liberty and Authority is the most conspicuous feature in the portions of history with which we are early familiar.",
    pageNumber: 8,
    score: 0.83,
  },
  {
    chunkId: 2,
    sectionIndex: 0,
    chapterTitle: "Chapter I — Introductory",
    text: "feelings of class superiority. The morality between Spartans and Helots, between planters and negroes, between princes and subjects, between nobles and roturiers, between men and women, has been for the most part the creation of these class interests and feelings: and the sentiments thus generated, react in turn upon the moral feelings of the members of the ascendant class, in their relations among themselves.",
    pageNumber: 18,
    score: 0.74,
  },
  {
    chunkId: 3,
    sectionIndex: 0,
    chapterTitle: "Chapter I — Introductory",
    text: "himself, or if it also affects others, only with their free, voluntary, and undeceived consent and participation. When I say only himself, I mean directly, and in the first instance: for whatever affects himself, may affect others through himself; and the objection which may be grounded on this contingency, will receive consideration in the sequel. This, then, is the appropriate region of human liberty. It comprises, first, the inward domain of consciousness; demanding liberty of conscience.",
    pageNumber: 30,
    score: 0.86,
  },
  {
    chunkId: 4,
    sectionIndex: 1,
    chapterTitle: "Chapter II — Of the Liberty of Thought and Discussion",
    text: "certain that many opinions, now general, will be rejected by future ages, as it is that many, once general, are rejected by the present. The objection likely to be made to this argument, would probably take some such form as the following. There is no greater assumption of infallibility in forbidding the propagation of error, than in any other thing which is done by public authority on its own judgment and responsibility.",
    pageNumber: 42,
    score: 0.77,
  },
  {
    chunkId: 5,
    sectionIndex: 1,
    chapterTitle: "Chapter II — Of the Liberty of Thought and Discussion",
    text: "they had no theological belief; and a third, a foreigner, for the same reason, was denied justice against a thief. This refusal of redress took place in virtue of the legal doctrine, that no person can be allowed to give evidence in a court of justice, who does not profess belief in a God (any god is sufficient) and in a future state; which is equivalent to declaring such persons to be outlaws, excluded from the protection of the tribunals.",
    pageNumber: 55,
    score: 0.71,
  },
];
