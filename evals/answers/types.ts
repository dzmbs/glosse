export type IntentClass =
  | "local"
  | "overview"
  | "future"
  | "broad"
  | "hybrid";

export type EvalQuestion = {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  currentPage: number;
  totalPages?: number;
  question: string;
  intentClass: IntentClass;
  expectedBehavior: string;
};

export type EvalAnswer = {
  questionId: string;
  answer: string;
  citations: Array<{ chapterTitle: string; pageNumber: number }>;
  embedMs: number;
  searchMs: number;
  ttftMs: number;
  streamMs: number;
  totalMs: number;
  chars: number;
};

export type JudgeScores = {
  frame: number;
  grounded: number;
  spoiler: number;
  voice: number;
  hybrid: number;
};

export type JudgeVerdict = {
  questionId: string;
  scores: JudgeScores;
  mustFix: boolean;
  headlineIssue: string;
  rewriteSuggestion: string;
};

export type EvalRun = {
  runId: string;
  startedAt: number;
  promptVersion: string;
  answererModel: string;
  judgeModel: string;
  questions: number;
  meanScores: JudgeScores;
  mustFixCount: number;
};
