import { z } from "zod";

import type { RetrievedChunk } from "../types";

// Shared study-surface types. Kept here (rather than in quiz.ts /
// flashcards.ts) because the bench harness and other DB-free callers
// need them without pulling in the retrieval / DB layer.

export type StudyDifficulty = "easy" | "medium" | "hard";

export type StudyScope =
  | { kind: "all"; maxPage: number }
  | {
      kind: "chapter";
      chapterTitle: string;
      // Titles to match against indexed chunk.chapter_title. Defaults to
      // the chapter heading + every section under it. The UI may narrow
      // this set when the user un-selects sections of the picked
      // chapter; the AI layer doesn't need to know — it just trusts the
      // list. `narrowedTo` is the user-visible label for the narrowing
      // (e.g. a single section title), used in prompt phrasing.
      titles: string[];
      narrowedTo?: string;
      maxPage: number;
    };

export type QuestionType = "mcq" | "tf" | "mixed";

/**
 * Keep only passages whose chapter matches a chapter-scoped request.
 * For `all`-scoped requests, returns the input unchanged.
 */
export function filterPassagesByScope(
  passages: RetrievedChunk[],
  scope: StudyScope,
): RetrievedChunk[] {
  if (scope.kind === "all") return passages;
  const wanted = new Set(scope.titles.map((t) => t.toLowerCase().trim()));
  return passages.filter((p) => wanted.has(p.chapterTitle.toLowerCase().trim()));
}

/** Human-readable scope phrase for prompts. */
export function scopePhrase(scope: StudyScope): string {
  if (scope.kind === "chapter") {
    return scope.narrowedTo
      ? `"${scope.narrowedTo}" within chapter "${scope.chapterTitle}"`
      : `the chapter "${scope.chapterTitle}"`;
  }
  return `the material we've read so far (pages 1–${scope.maxPage})`;
}

/** Short scope phrase for the user prompt suffix. */
export function scopeSuffix(scope: StudyScope): string {
  if (scope.kind === "chapter") {
    return ` on ${scope.narrowedTo ?? scope.chapterTitle}`;
  }
  return "";
}

/**
 * Build the natural-language query passed to hybrid retrieval. Quiz and
 * flashcards differ only in the noun phrase ("claims and distinctions"
 * vs. "definitions and arguments"); the rest is shared scope handling.
 */
export function buildScopeRetrievalQuery(
  scope: StudyScope,
  bookTitle: string,
  baseNoun: string,
  focusBits: string[],
): string {
  let base: string;
  if (scope.kind === "chapter") {
    base = scope.narrowedTo
      ? `${baseNoun} in ${scope.narrowedTo} (${scope.chapterTitle})`
      : `${baseNoun} in ${scope.chapterTitle}`;
  } else {
    base = `${baseNoun} of ${bookTitle}`;
  }
  if (focusBits.length === 0) return base;
  return `${base} — with emphasis on: ${focusBits.join(", ")}`;
}

// -- Quiz ---------------------------------------------------------------

// Flat schema with optional fields per kind. Discriminated unions confuse
// local JSON-mode models — Gemma/Qwen often omit the `kind` tag or mix
// fields, causing ai-sdk to reject the whole generation.
const RawQuizQuestionSchema = z.object({
  kind: z.enum(["mcq", "tf"]),
  question: z.string().min(4),
  options: z.array(z.string().min(1)).optional(),
  correctIndex: z.number().int().optional(),
  answer: z.boolean().optional(),
  explanation: z.string().min(6),
  sourcePage: z.number().int().min(1),
});

export const QuizSchema = z.object({
  questions: z.array(RawQuizQuestionSchema).min(1).max(30),
});

export type QuizGenerationInput = {
  bookTitle: string;
  bookAuthor: string;
  scope: StudyScope;
  difficulty: StudyDifficulty;
  questionType: QuestionType;
  passages: RetrievedChunk[];
};

export function buildQuizSystemPrompt(input: QuizGenerationInput): string {
  const scopeText = scopePhrase(input.scope);

  const typeHint =
    input.questionType === "mcq"
      ? "Every question MUST set kind='mcq' and include an options array of exactly 4 strings plus correctIndex (0-3). Do not include an answer field."
      : input.questionType === "tf"
        ? "Every question MUST set kind='tf' and include a boolean answer field. Do not include options or correctIndex."
        : "Mix kinds: ~2/3 kind='mcq' (with options + correctIndex) and ~1/3 kind='tf' (with boolean answer). Never mix fields within a single question object.";

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

export function buildQuizUserPrompt(input: {
  count: number;
  difficulty: StudyDifficulty;
  scope: StudyScope;
  focusBits: string[];
}): string {
  const parts: string[] = [
    `Generate ${input.count} ${input.difficulty} quiz questions${scopeSuffix(input.scope)}.`,
  ];
  if (input.focusBits.length > 0) {
    parts.push(`Focus on: ${input.focusBits.join(", ")}.`);
  }
  parts.push(`Return the questions in the requested format.`);
  return parts.join(" ");
}

// -- Flashcards ---------------------------------------------------------

const FlashcardSchema = z.object({
  front: z
    .string()
    .min(4)
    .describe("Question/prompt. No yes/no, no meta-questions about chapter titles."),
  back: z
    .string()
    .min(3)
    .describe("Precise self-contained answer, 1-2 sentences, grounded in a passage."),
  explanation: z
    .string()
    .min(6)
    .describe("Expanded reasoning: *why* the back is correct. 2-4 sentences."),
  sourcePage: z
    .number()
    .int()
    .min(1)
    .describe("Page number of the passage this card is grounded in."),
});

export const FlashcardsSchema = z.object({
  cards: z.array(FlashcardSchema).min(1).max(30),
});

export type FlashcardsGenerationInput = {
  bookTitle: string;
  bookAuthor: string;
  scope: StudyScope;
  difficulty: StudyDifficulty;
  tone: string;
  passages: RetrievedChunk[];
};

export function buildFlashcardsSystemPrompt(
  input: FlashcardsGenerationInput,
): string {
  const scopeText = scopePhrase(input.scope);

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

export function buildFlashcardsUserPrompt(input: {
  count: number;
  difficulty: StudyDifficulty;
  focusBits: string[];
  scope: StudyScope;
}): string {
  const parts: string[] = [
    `Generate ${input.count} ${input.difficulty} flashcards covering the most important ideas${scopeSuffix(input.scope)}.`,
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

// -- Mind map -----------------------------------------------------------

export type MindMapNode = {
  label: string;
  children?: MindMapNode[];
};

const NodeSchema: z.ZodType<MindMapNode> = z.lazy(() =>
  z.object({
    label: z.string().min(2),
    children: z.array(NodeSchema).optional(),
  }),
);

export const MindMapSchema = z.object({
  title: z.string().min(2),
  branches: z
    .array(
      z.object({
        chapterTitle: z.string().min(1),
        sectionIndex: z.number().int().min(0),
        nodes: z.array(NodeSchema).min(1),
      }),
    )
    .min(1),
});

export type MindMapSection = {
  sectionIndex: number;
  chapterTitle: string;
  excerpt: string;
};

export function buildMindMapSystemPrompt(input: {
  bookTitle: string;
  bookAuthor: string;
  maxPage: number;
}): string {
  return `You are drafting a concept map for the portion of "${input.bookTitle}"${
    input.bookAuthor ? ` by ${input.bookAuthor}` : ""
  } that the reader has reached (pages 1–${input.maxPage}).

For each chapter listed below, produce:
- Its chapterTitle (verbatim from the list)
- Its sectionIndex (verbatim)
- 3-6 top-level nodes: the key concepts, arguments, or terms introduced in that chapter
- Optional 2-4 children per node for specific sub-concepts (skip children when the node is already atomic)

Rules:
- Node labels are 1-4 words, concrete. Prefer named concepts and proper nouns over vague themes.
- Ground every node in the excerpts provided. Don't invent content.
- Don't repeat the chapter title as a top-level node.
- No full sentences, no punctuation, no leading articles ("The", "A").
- Never use ellipsis.`;
}

export function buildMindMapUserPrompt(input: {
  bookTitle: string;
  sections: MindMapSection[];
}): string {
  const list = input.sections
    .map((s) => `${s.sectionIndex} :: ${s.chapterTitle || "(untitled)"}`)
    .join("\n");
  const excerpts = input.sections
    .map(
      (s) =>
        `### Section ${s.sectionIndex} — ${s.chapterTitle || "(untitled)"}\n${s.excerpt}`,
    )
    .join("\n\n");

  return `Chapters available (sectionIndex :: chapterTitle):
${list}

<EXCERPTS>
${excerpts}
</EXCERPTS>

Return the concept map as specified. The "title" field should be the book title exactly: "${input.bookTitle}".`;
}
