// Row shapes for the tables defined in init.ts. We don't use an ORM —
// queries go through `db.prepare(sql).run/all/get()` on the turso wasm
// Database. These types are strictly for call sites to get autocomplete.

/**
 * Dimensions we ship per-dim typed storage for. Extending this list
 * requires adding a matching `chunk_embeddings_<dim>` table in
 * `init.ts`; any code that touches a dim must go through
 * `embeddingTableFor()` so a missing table fails loudly.
 */
export const SUPPORTED_EMBEDDING_DIMS = [768, 1024, 1536, 3072] as const;

export type SupportedEmbeddingDim =
  (typeof SUPPORTED_EMBEDDING_DIMS)[number];

export function isSupportedEmbeddingDim(
  dim: number,
): dim is SupportedEmbeddingDim {
  return (SUPPORTED_EMBEDDING_DIMS as readonly number[]).includes(dim);
}

/**
 * Default dim for anything that needs to pick one before a book's config
 * is known (e.g., the initial settings seed). Not authoritative — books
 * carry their own dim in `book_index`.
 */
export const EMBEDDING_DIMS = 1536;

/**
 * SQL identifier for the per-dim embedding table. Callers that route
 * INSERTs or SELECTs by dim must go through this helper so we can't
 * accidentally write a typo like `chunk_embedings_1536`.
 */
export function embeddingTableFor(dim: SupportedEmbeddingDim): string {
  return `chunk_embeddings_${dim}`;
}

export type ChunkRow = {
  id: number;
  book_id: string;
  section_index: number;
  chapter_title: string;
  text: string;
  page_number: number;
  context_prefix: string | null;
  created_at: number;
};

export type ChunkEmbeddingRow = {
  chunk_id: number;
  embedding: Uint8Array;
};

export type BookIndexRow = {
  book_id: string;
  title: string;
  author: string;
  total_chunks: number;
  total_sections: number;
  embedding_model: string;
  indexed_at: number;
};

export type ConversationRow = {
  id: string;
  book_id: string;
  title: string;
  created_at: number;
  updated_at: number;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: number;
};

export type ConversationSummaryRow = {
  conversation_id: string;
  summary_json: string;
  turns_summarized: number;
  updated_at: number;
};

export type ReviewCardRow = {
  id: string;
  book_id: string;
  source_cfi: string | null;
  source_chunk_id: number | null;
  front: string;
  back: string;
  explanation: string | null;
  fsrs_state: string;
  due_at: number;
  last_reviewed_at: number | null;
  created_at: number;
};

export type HighlightRow = {
  id: string;
  book_id: string;
  cfi: string;
  text: string;
  note: string | null;
  color: string;
  page_number: number | null;
  created_at: number;
  updated_at: number;
};

export type ReaderProfileRow = {
  id: number;
  preferred_quiz_style: string;
  answer_style: string;
  weak_concepts: string;
  interests: string;
  tone: string;
  updated_at: number;
};

// -- Float32 ↔ byte helpers (embeddings are stored as F32 byte blobs) -----

export function embeddingToBlob(embedding: Float32Array | number[]): Uint8Array {
  const f32 =
    embedding instanceof Float32Array ? embedding : Float32Array.from(embedding);
  return new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
}

export function blobToEmbedding(blob: Uint8Array): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

/** libSQL's `vector32('...')` SQL function accepts a JSON array literal. */
export function embeddingToJson(embedding: Float32Array | number[]): string {
  const arr =
    embedding instanceof Float32Array ? Array.from(embedding) : embedding;
  return JSON.stringify(arr);
}
