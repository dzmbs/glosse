import type { BookIdentity, RetrievedChunk } from "../../../src/ai/types.ts";

export const BOOK: BookIdentity & {
  currentPage: number;
  totalPages: number;
} = {
  bookId: "eval-heart-of-darkness",
  title: "Heart of Darkness",
  author: "Joseph Conrad",
  currentPage: 30,
  totalPages: 70,
};

export const PASSAGES: RetrievedChunk[] = [
  {
    chunkId: 1,
    sectionIndex: 0,
    chapterTitle: "Chapter I",
    text: "calm, and being bound down the river, the only thing for it was to come to and wait for the turn of the tide. The sea-reach of the Thames stretched before us like the beginning of an interminable waterway. In the offing the sea and the sky were welded together without a joint, and in the luminous space the tanned sails of the barges drifting up with the tide seemed to stand still in red clusters of canvas sharply peaked, with gleams of varnished sprits.",
    pageNumber: 4,
    score: 0.82,
  },
  {
    chunkId: 2,
    sectionIndex: 0,
    chapterTitle: "Chapter I",
    text: "I got my appointment—of course; and I got it very quick. It appears the Company had received news that one of their captains had been killed in a scuffle with the natives. This was my chance, and it made me the more anxious to go. It was only months and months afterwards, when I made the attempt to recover what was left of the body, that I heard the original quarrel arose from a misunderstanding about some hens.",
    pageNumber: 12,
    score: 0.78,
  },
  {
    chunkId: 3,
    sectionIndex: 0,
    chapterTitle: "Chapter I",
    text: "shed and a flag-pole lost in it; landed more soldiers—to take care of the custom-house clerks, presumably. Some, I heard, got drowned in the surf; but whether they did or not, nobody seemed particularly to care. They were just flung out there, and on we went. Every day the coast looked the same, as though we had not moved; but we passed various places—trading places—with names like Gran' Bassam, Little Popo; names that seemed to belong to some sordid farce.",
    pageNumber: 20,
    score: 0.76,
  },
  {
    chunkId: 4,
    sectionIndex: 0,
    chapterTitle: "Chapter I",
    text: "He was amazing, and had a penholder behind his ear. I shook hands with this miracle, and I learned he was the Company's chief accountant, and that all the book-keeping was done at this station. He had come out for a moment, he said, 'to get a breath of fresh air.' The expression sounded wonderfully odd, with its suggestion of sedentary desk-life. I wouldn't have mentioned the fellow to you at all, only it was from his lips that I first heard the name of Kurtz.",
    pageNumber: 27,
    score: 0.74,
  },
];
