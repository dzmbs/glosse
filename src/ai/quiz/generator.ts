import type { RetrievedChunk } from "../types";
import { generateStructuredChat } from "../providers/generate";
import { hybridRetrieve } from "../retrieval/hybrid";
import { getProfile } from "../profile";
import { insertCards, type NewCardInput } from "./scheduler";
import type { QuizCard } from "./types";
import {
  FlashcardsSchema,
  buildFlashcardsSystemPrompt,
  buildFlashcardsUserPrompt,
  buildScopeRetrievalQuery,
  filterPassagesByScope,
  type StudyDifficulty,
  type StudyScope,
} from "../prompts/study";

export type { StudyDifficulty, StudyScope };

export type GenerateFlashcardsOptions = {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  scope: StudyScope;
  count: number;
  difficulty: StudyDifficulty;
  /** Topic chips to steer the retrieval + generation. */
  focusTopics?: string[];
  /** Free-form focus text the user typed. */
  customFocus?: string;
};

export async function generateFlashcards(
  opts: GenerateFlashcardsOptions,
): Promise<QuizCard[]> {
  const focusBits = [
    ...(opts.focusTopics ?? []),
    ...(opts.customFocus ? [opts.customFocus] : []),
  ].filter(Boolean);

  const retrievalQuery = buildRetrievalQuery(opts, focusBits);

  const passages = await hybridRetrieve({
    bookId: opts.bookId,
    query: retrievalQuery,
    currentPage: opts.scope.maxPage,
    topK: Math.max(12, opts.count * 2),
    maxPage: opts.scope.maxPage,
  });

  if (passages.length === 0) {
    throw new Error(
      "No passages retrieved — has the book been indexed, and have you reached this chapter?",
    );
  }

  const scoped = filterPassagesByScope(passages, opts.scope);
  const finalPassages = scoped.length >= 4 ? scoped : passages;

  const profile = await getProfile();
  const system = buildFlashcardsSystemPrompt({
    bookTitle: opts.bookTitle,
    bookAuthor: opts.bookAuthor,
    scope: opts.scope,
    difficulty: opts.difficulty,
    tone: profile.tone,
    passages: finalPassages,
  });

  const userPrompt = buildFlashcardsUserPrompt({
    count: opts.count,
    difficulty: opts.difficulty,
    focusBits,
    scope: opts.scope,
  });

  const { object } = await generateStructuredChat("flashcards", {
    schema: FlashcardsSchema,
    system,
    prompt: userPrompt,
  });

  const pageToChunk = new Map<number, RetrievedChunk>();
  for (const p of finalPassages) {
    if (!pageToChunk.has(p.pageNumber)) pageToChunk.set(p.pageNumber, p);
  }

  const inputs: NewCardInput[] = object.cards.map((c) => {
    const chunk = pageToChunk.get(c.sourcePage);
    return {
      bookId: opts.bookId,
      front: c.front,
      back: c.back,
      explanation: c.explanation,
      sourceChunkId: chunk?.chunkId ?? null,
      sourceCfi: null,
    };
  });

  return insertCards(inputs);
}

function buildRetrievalQuery(
  opts: GenerateFlashcardsOptions,
  focusBits: string[],
): string {
  return buildScopeRetrievalQuery(
    opts.scope,
    opts.bookTitle,
    "Key concepts, definitions, and arguments",
    focusBits,
  );
}

export type GenerateFlashcardsFromPassageOptions = {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  passage: string;
  pageNumber: number;
  chapterTitle: string | null;
  /** CFI to anchor every produced card so review can jump back. */
  sourceCfi: string;
  /** Defaults to 2 — short selections rarely yield more distinct cards. */
  count?: number;
  difficulty?: StudyDifficulty;
};

/**
 * Generate flashcards from a single user-selected passage, bypassing
 * retrieval. Saves the cards to the FSRS deck and returns them.
 */
export async function generateFlashcardsFromPassage(
  opts: GenerateFlashcardsFromPassageOptions,
): Promise<QuizCard[]> {
  const count = opts.count ?? 2;
  const difficulty: StudyDifficulty = opts.difficulty ?? "medium";
  const chapterTitle = opts.chapterTitle ?? "the current section";
  const profile = await getProfile();

  const synthetic: RetrievedChunk = {
    chunkId: -1,
    text: opts.passage,
    pageNumber: opts.pageNumber,
    sectionIndex: 0,
    chapterTitle,
    score: 1,
  };

  const scope: StudyScope = {
    kind: "chapter",
    chapterTitle,
    titles: [chapterTitle],
    narrowedTo: "this passage",
    maxPage: opts.pageNumber,
  };

  const system = buildFlashcardsSystemPrompt({
    bookTitle: opts.bookTitle,
    bookAuthor: opts.bookAuthor,
    scope,
    difficulty,
    tone: profile.tone,
    passages: [synthetic],
  });
  const userPrompt = buildFlashcardsUserPrompt({
    count,
    difficulty,
    focusBits: [],
    scope,
  });

  const { object } = await generateStructuredChat("flashcards", {
    schema: FlashcardsSchema,
    system,
    prompt: userPrompt,
  });

  const inputs: NewCardInput[] = object.cards.map((c) => ({
    bookId: opts.bookId,
    front: c.front,
    back: c.back,
    explanation: c.explanation,
    sourceChunkId: null,
    sourceCfi: opts.sourceCfi,
  }));
  return insertCards(inputs);
}
