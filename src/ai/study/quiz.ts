import { generateObject } from "ai";
import { z } from "zod";

import type { RetrievedChunk } from "../types";
import { getChatProvider } from "../providers/registry";
import { useAISettings } from "../providers/settings";
import { hybridRetrieve } from "../retrieval/hybrid";
import type { StudyDifficulty, StudyScope } from "../quiz/generator";

export type QuestionType = "mcq" | "tf" | "mixed";

export type McqQuestion = {
  kind: "mcq";
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sourcePage: number;
};

export type TfQuestion = {
  kind: "tf";
  id: string;
  question: string;
  answer: boolean;
  explanation: string;
  sourcePage: number;
};

export type QuizQuestion = McqQuestion | TfQuestion;

export type GenerateQuizOptions = {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  scope: StudyScope;
  count: number;
  difficulty: StudyDifficulty;
  questionType: QuestionType;
  focusTopics?: string[];
  customFocus?: string;
};

const McqSchema = z.object({
  kind: z.literal("mcq"),
  question: z.string().min(6).max(280),
  options: z.array(z.string().min(1).max(160)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(10).max(500),
  sourcePage: z.number().int().min(1),
});

const TfSchema = z.object({
  kind: z.literal("tf"),
  question: z.string().min(6).max(280),
  answer: z.boolean(),
  explanation: z.string().min(10).max(500),
  sourcePage: z.number().int().min(1),
});

const QuizSchema = z.object({
  questions: z.array(z.discriminatedUnion("kind", [McqSchema, TfSchema])).min(3).max(20),
});

export async function generateQuizSession(
  opts: GenerateQuizOptions,
): Promise<QuizQuestion[]> {
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

  const system = buildSystem({
    bookTitle: opts.bookTitle,
    bookAuthor: opts.bookAuthor,
    scope: opts.scope,
    difficulty: opts.difficulty,
    questionType: opts.questionType,
    passages: finalPassages,
  });

  const userPrompt = buildUserPrompt(opts, focusBits);

  const { object } = await generateObject({
    model: getChatProvider(settings.chatModel),
    schema: QuizSchema,
    system,
    prompt: userPrompt,
  });

  return object.questions.map((q) => {
    const id = makeId();
    if (q.kind === "mcq") {
      return {
        kind: "mcq",
        id,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        sourcePage: q.sourcePage,
      } satisfies McqQuestion;
    }
    return {
      kind: "tf",
      id,
      question: q.question,
      answer: q.answer,
      explanation: q.explanation,
      sourcePage: q.sourcePage,
    } satisfies TfQuestion;
  });
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `q_${crypto.randomUUID()}`;
  }
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildRetrievalQuery(
  opts: GenerateQuizOptions,
  focusBits: string[],
): string {
  const base =
    opts.scope.kind === "chapter"
      ? `Key concepts, claims, and distinctions in ${opts.scope.chapterTitle}`
      : `Key concepts and arguments of ${opts.bookTitle}`;
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
  questionType: QuestionType;
  passages: RetrievedChunk[];
}): string {
  const scopeText =
    input.scope.kind === "chapter"
      ? `the chapter "${input.scope.chapterTitle}"`
      : `the material we've read so far (pages 1–${input.scope.maxPage})`;

  const typeHint =
    input.questionType === "mcq"
      ? "Every question MUST be kind='mcq' with exactly 4 options and one correctIndex."
      : input.questionType === "tf"
        ? "Every question MUST be kind='tf' with a boolean answer."
        : "Mix kinds: roughly 2/3 kind='mcq' and 1/3 kind='tf'. Never mix kinds within a single question object.";

  const difficultyHint =
    input.difficulty === "easy"
      ? "Test direct recall of facts and definitions. MCQ distractors should be clearly wrong."
      : input.difficulty === "hard"
        ? "Test reasoning, subtle distinctions, and application. MCQ distractors should be plausible misreadings."
        : "Test understanding, not just trivia. MCQ distractors should be related but incorrect.";

  const passageBlock = input.passages
    .map(
      (p) =>
        `[${p.chapterTitle || `Section ${p.sectionIndex + 1}`}, p. ${p.pageNumber}]\n${p.text}`,
    )
    .join("\n\n---\n\n");

  return `You are writing a quiz over "${input.bookTitle}"${input.bookAuthor ? ` by ${input.bookAuthor}` : ""}.

SCOPE: ${scopeText}. Only use facts from the provided passages — never invent content.

QUESTION TYPE: ${typeHint}
DIFFICULTY: ${difficultyHint}

RULES (MCQ):
- Exactly 4 options. One is unambiguously correct given the passages.
- Distractors must be same grammatical shape and similar length — never obvious "none of the above" throwaways.
- correctIndex is the 0-based index of the correct option.
- Never include "All/None of the above".

RULES (TF):
- Statement must be assessable as strictly true or false from the passages.
- Avoid trick phrasing. A careful reader should be able to decide confidently.

EXPLANATION (for every question):
- 2-4 sentences. State WHY the correct answer is right and what the reader should take away. Reference the concept, not the page.

GENERAL:
- Each question tests ONE idea.
- sourcePage points to the passage that grounds the question.
- No near-duplicates.
- If the passages don't support the requested count, return fewer.

<PASSAGES>
${passageBlock}
</PASSAGES>`;
}

function buildUserPrompt(
  opts: GenerateQuizOptions,
  focusBits: string[],
): string {
  const parts: string[] = [
    `Generate ${opts.count} ${opts.difficulty} quiz questions${
      opts.scope.kind === "chapter" ? ` on ${opts.scope.chapterTitle}` : ""
    }.`,
  ];
  if (focusBits.length > 0) {
    parts.push(`Focus on: ${focusBits.join(", ")}.`);
  }
  parts.push(`Return the questions in the requested format.`);
  return parts.join(" ");
}
