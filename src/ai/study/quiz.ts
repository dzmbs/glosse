import { generateStructuredChat } from "../providers/generate";
import { hybridRetrieve } from "../retrieval/hybrid";
import { makeId } from "../utils/str";
import {
  QuizSchema,
  buildQuizSystemPrompt,
  buildQuizUserPrompt,
  buildScopeRetrievalQuery,
  filterPassagesByScope,
  type QuestionType,
  type StudyDifficulty,
  type StudyScope,
} from "../prompts/study";

export type { QuestionType };

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

export async function generateQuizSession(
  opts: GenerateQuizOptions,
): Promise<QuizQuestion[]> {
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

  const system = buildQuizSystemPrompt({
    bookTitle: opts.bookTitle,
    bookAuthor: opts.bookAuthor,
    scope: opts.scope,
    difficulty: opts.difficulty,
    questionType: opts.questionType,
    passages: finalPassages,
  });

  const userPrompt = buildQuizUserPrompt({
    count: opts.count,
    difficulty: opts.difficulty,
    scope: opts.scope,
    focusBits,
  });

  const { object } = await generateStructuredChat("quiz", {
    schema: QuizSchema,
    system,
    prompt: userPrompt,
  });

  const out: QuizQuestion[] = [];
  for (const q of object.questions) {
    const id = `q_${makeId()}`;
    if (q.kind === "mcq") {
      const options = (q.options ?? []).filter((o) => o && o.trim().length > 0);
      if (options.length < 2) continue;
      const correctIndex = Math.min(
        Math.max(0, q.correctIndex ?? 0),
        options.length - 1,
      );
      out.push({
        kind: "mcq",
        id,
        question: q.question,
        options,
        correctIndex,
        explanation: q.explanation,
        sourcePage: q.sourcePage,
      });
      continue;
    }
    if (typeof q.answer !== "boolean") continue;
    out.push({
      kind: "tf",
      id,
      question: q.question,
      answer: q.answer,
      explanation: q.explanation,
      sourcePage: q.sourcePage,
    });
  }
  return out;
}

function buildRetrievalQuery(
  opts: GenerateQuizOptions,
  focusBits: string[],
): string {
  return buildScopeRetrievalQuery(
    opts.scope,
    opts.bookTitle,
    "Key concepts, claims, and distinctions",
    focusBits,
  );
}

