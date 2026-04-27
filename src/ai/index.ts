export * from "./types";
export { getDb, closeDb } from "./db/client";
export { chunkBook } from "./chunking/chunker";
export { indexBook, isBookIndexed } from "./indexing/indexer";
export {
  getBookIndexConfig,
  sameEmbeddingConfig,
  BookIndexUnavailableError,
  type BookIndexConfig,
} from "./indexing/bookIndex";
export { embedQuery } from "./embedding/embedder";
export { hybridRetrieve } from "./retrieval/hybrid";
export { buildCompanionPrompt } from "./prompts/companion";
export { useAISettings, type AISettings } from "./providers/settings";
export { getChatProvider, getEmbeddingProvider } from "./providers/registry";
export {
  getProfile,
  updateProfile,
  profileToSnippet,
  type ReaderProfile,
  type ProfilePatch,
} from "./profile";
export {
  generateFlashcards,
  type GenerateFlashcardsOptions,
  type StudyDifficulty,
  type StudyScope,
} from "./quiz/generator";
export {
  insertCards,
  listDueCards,
  listAllCards,
  countCards,
  recordReview,
  deleteCard,
} from "./quiz/scheduler";
export { applyReview, newCardState } from "./quiz/fsrs";
export type { QuizCard, Grade, FsrsCardState } from "./quiz/types";
export {
  proposeFocusTopics,
  clearTopicCache,
  type TopicScope,
} from "./study/topics";
export {
  generateQuizSession,
  type GenerateQuizOptions,
  type QuizQuestion,
  type McqQuestion,
  type TfQuestion,
  type QuestionType,
} from "./study/quiz";
export {
  generateMindMap,
  getMindMap,
  deleteMindMap,
  type MindMap,
  type MindMapNode,
} from "./study/mindmap";
export {
  listHighlights,
  createHighlight,
  updateHighlightNote,
  deleteHighlight,
  countHighlights,
  type Highlight,
} from "./highlights";
export {
  getChapterSummary,
  listChapterSummaries,
  generateChapterSummary,
  ensureSummariesUpToPage,
  type ChapterSummary,
} from "./summaries";
export { generateWeeklyReview, type WeeklyReview } from "./weekly";
