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
  const base =
    opts.scope.kind === "chapter"
      ? `Key concepts, definitions, and arguments in ${opts.scope.chapterTitle}`
      : `Key concepts and core ideas of ${opts.bookTitle}`;
  if (focusBits.length === 0) return base;
  return `${base} — with emphasis on: ${focusBits.join(", ")}`;
}

