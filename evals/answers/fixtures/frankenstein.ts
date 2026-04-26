import type { BookIdentity, RetrievedChunk } from "../../../src/ai/types.ts";

export const BOOK: BookIdentity & {
  currentPage: number;
  totalPages: number;
} = {
  bookId: "eval-frankenstein",
  title: "Frankenstein",
  author: "Mary Shelley",
  currentPage: 90,
  totalPages: 280,
};

export const PASSAGES: RetrievedChunk[] = [
  {
    chunkId: 1,
    sectionIndex: 0,
    chapterTitle: "Chapter 1",
    text: "My ancestors had been for many years counsellors and syndics, and my father had filled several public situations with honour and reputation. He was respected by all who knew him for his integrity and indefatigable attention to public business. He passed his younger days perpetually occupied by the affairs of his country; a variety of circumstances had prevented his marrying early, nor was it until the decline of life that he became a husband and the father of a family.",
    pageNumber: 12,
    score: 0.81,
  },
  {
    chunkId: 2,
    sectionIndex: 1,
    chapterTitle: "Chapter 2",
    text: "We were brought up together; there was not quite a year difference in our ages. Harmony was the soul of our companionship, and the diversity and contrast that subsisted in our characters drew us nearer together. Elizabeth was of a calmer and more concentrated disposition; but, with all my ardour, I was capable of a more intense application and was more deeply smitten with the thirst for knowledge.",
    pageNumber: 22,
    score: 0.78,
  },
  {
    chunkId: 3,
    sectionIndex: 2,
    chapterTitle: "Chapter 3",
    text: "He said little, but when he spoke I read in his kindling eye and in his animated glance a restrained but firm resolve not to be chained to the miserable details of commerce. We sat late. We could not tear ourselves away from each other nor persuade ourselves to say the word 'Farewell!' It was said, and we retired under the pretence of seeking repose, each fancying that the other was deceived; but when at morning's dawn I descended to the carriage which was to convey me away.",
    pageNumber: 35,
    score: 0.75,
  },
  {
    chunkId: 4,
    sectionIndex: 3,
    chapterTitle: "Chapter 4",
    text: "to prepare a frame for the reception of it, with all its intricacies of fibres, muscles, and veins, still remained a work of inconceivable difficulty and labour. I doubted at first whether I should attempt the creation of a being like myself, or one of simpler organization; but my imagination was too much exalted by my first success to permit me to doubt of my ability to give life to an animal as complex and wonderful as man.",
    pageNumber: 50,
    score: 0.84,
  },
  {
    chunkId: 5,
    sectionIndex: 5,
    chapterTitle: "Chapter 6",
    text: "A change has taken place in our little household. Do you remember on what occasion Justine Moritz entered our family? I will relate her history. Madame Moritz, her mother, was a widow with four children, of whom Justine was the third. This girl had always been the favourite of her father, but through a strange perversity, her mother could not endure her, and after the death of M. Moritz, treated her very ill. My aunt observed this.",
    pageNumber: 70,
    score: 0.72,
  },
  {
    chunkId: 6,
    sectionIndex: 6,
    chapterTitle: "Chapter 7",
    text: "Geneva, May 12th, 17—. Clerval, who had watched my countenance as I read this letter, was surprised to observe the despair that succeeded the joy I at first expressed on receiving news from my friends. I threw the letter on the table, and covered my face with my hands. 'My dear Frankenstein,' exclaimed Henry, when he perceived me weep with bitterness, 'are you always to be unhappy?'",
    pageNumber: 85,
    score: 0.79,
  },
];
