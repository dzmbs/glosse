export type ProviderId = "anthropic" | "openai" | "google" | "ollama";

export type ChatModelConfig = {
  provider: ProviderId;
  model: string;
};

export type EmbeddingModelConfig = {
  provider: "openai" | "ollama";
  model: string;
  /** Vector dimensionality — must match the schema's F32_BLOB column. */
  dimensions: number;
};

export type BookIdentity = {
  bookId: string;
  title: string;
  author: string;
};

export type ReadingFocus = {
  selectedText?: string;
  cfi?: string | null;
  pageNumber?: number | null;
  chapterTitle?: string | null;
};

export type ChunkInput = {
  sectionIndex: number;
  chapterTitle: string;
  text: string;
  pageNumber: number;
};

export type RetrievedChunk = {
  chunkId: number;
  sectionIndex: number;
  chapterTitle: string;
  text: string;
  pageNumber: number;
  score: number;
};

export type RetrievalMode = "focused" | "holistic" | "full";

export type IndexingProgress =
  | { phase: "chunking"; current: number; total: number }
  | { phase: "embedding"; current: number; total: number }
  | { phase: "persisting"; current: number; total: number }
  | { phase: "done" };
