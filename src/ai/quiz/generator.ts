import { generateObject } from "ai";
import { z } from "zod";

import type { RetrievedChunk } from "../types";
import { getChatProvider } from "../providers/registry";
import { useAISettings } from "../providers/settings";
import { hybridRetrieve } from "../retrieval/hybrid";
import { getProfile } from "../profile";
import { insertCards, type NewCardInput } from "./scheduler";
import type { QuizCard } from "./types";

export type StudyDifficulty = "easy" | "medium" | "hard";
export type StudyScope =
  | { kind: "all"; maxPage: number }
  | { kind: "chapter"; chapterTitle: string; maxPage: number };

const CardSchema = z.object({
  front: z
    .string()
    .min(6)
    .max(240)
    .describe("Question/prompt. No yes/no, no meta-questions about chapter titles."),
  back: z
    .string()
    .min(4)
    .max(400)
    .describe("Precise self-contained answer, 1-2 sentences, grounded in a passage."),
  explanation: z
    .string()
    .min(10)
    .max(600)
    .describe("Expanded reasoning: *why* the back is correct and what context it sits in. 2-4 sentences."),
  sourcePage: z
    .number()
    .int()
    .min(1)
    .describe("Page number of the passage this card is grounded in."),
});

const FlashcardsSchema = z.object({
  cards: z.array(CardSchema).min(3).max(20),
});

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
  const settings = useAISettings.getState();

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

  const scoped = filterToScope(passages, opts.scope);
  const finalPassages = scoped.length >= 4 ? scoped : passages;

  const profile = await getProfile();
  const system = buildSystem({
    bookTitle: opts.bookTitle,
    bookAuthor: opts.bookAuthor,
    scope: opts.scope,
    difficulty: opts.difficulty,
    tone: profile.tone,
    passages: finalPassages,
  });

  const userPrompt = buildUserPrompt({
    count: opts.count,
    difficulty: opts.difficulty,
    focusBits,
    scope: opts.scope,
  });

  const { object } = await generateObject({
    model: getChatProvider(settings.chatModel),
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

function filterToScope(
  passages: RetrievedChunk[],
  scope: StudyScope,
): RetrievedChunk[] {
  if (scope.kind !== "chapter") return passages;
  const wanted = scope.chapterTitle.toLowerCase();
  return passages.filter((p) => p.chapterTitle.toLowerCase() === wanted);
}

function buildSystem(input: {
  bookTitle: string;
  bookAuthor: string;
  scope: StudyScope;
  difficulty: StudyDifficulty;
  tone: string;
  passages: RetrievedChunk[];
}): string {
  const scopeText =
    input.scope.kind === "chapter"
      ? `the chapter "${input.scope.chapterTitle}"`
      : `the material we've read so far (pages 1–${input.scope.maxPage})`;

  const difficultyHint =
    input.difficulty === "easy"
      ? "Surface-level recall: names, definitions, one-step facts. Keep fronts short."
      : input.difficulty === "hard"
        ? "Demanding: ask the reader to connect ideas, reason about edge cases, or compare concepts. Don't just quote definitions."
        : "Medium: test understanding of how concepts work, not just terminology. Require a sentence of thought, not trivia recall.";

  const passageBlock = input.passages
    .map(
      (p) =>
        `[${p.chapterTitle || `Section ${p.sectionIndex + 1}`}, p. ${p.pageNumber}]\n${p.text}`,
    )
    .join("\n\n---\n\n");

  return `You are generating study flashcards from "${input.bookTitle}"${input.bookAuthor ? ` by ${input.bookAuthor}` : ""}.

SCOPE: ${scopeText}. Only use facts present in the provided passages — never invent content.

DIFFICULTY: ${difficultyHint}

CARD FORMAT:
- front: a clear question or prompt. No yes/no. No "What is the title of this chapter?" style meta-questions.
- back: the precise answer, 1-2 sentences.
- explanation: WHY the answer is correct — the context, the intuition, or the reasoning path. 2-4 sentences. This is shown to the reader AFTER they attempt recall.

RULES:
- Each card tests ONE idea. Split compound questions.
- Ground every card in a specific passage; fill sourcePage from that passage.
- No near-duplicate cards.
- Front must not leak the answer.
- If the passages don't support the requested count, return fewer cards rather than inventing material.

<PASSAGES>
${passageBlock}
</PASSAGES>`;
}

function buildUserPrompt(input: {
  count: number;
  difficulty: StudyDifficulty;
  focusBits: string[];
  scope: StudyScope;
}): string {
  const parts: string[] = [
    `Generate ${input.count} ${input.difficulty} flashcards covering the most important ideas${
      input.scope.kind === "chapter" ? ` in ${input.scope.chapterTitle}` : ""
    }.`,
  ];
  if (input.focusBits.length > 0) {
    parts.push(
      `Focus on: ${input.focusBits.join(", ")}. Skip material that doesn't touch these.`,
    );
  }
  parts.push(
    `Each card must include a real explanation — not a restatement of the back.`,
  );
  return parts.join(" ");
}
