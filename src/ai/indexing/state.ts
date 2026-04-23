import {
  embeddingTableFor,
  embeddingToBlob,
  isSupportedEmbeddingDim,
  type SupportedEmbeddingDim,
} from "../db/schema.ts";
import type { BookIdentity, EmbeddingModelConfig } from "../types.ts";

export function isIndexReady(
  row:
    | {
        total_chunks: number;
        chunk_count: number;
      }
    | undefined,
): boolean {
  return !!row && row.total_chunks > 0 && row.chunk_count === row.total_chunks;
}

export function assertPersistableEmbeddings(
  embedding: EmbeddingModelConfig,
  embeddings: Float32Array[],
): void {
  for (const vector of embeddings) {
    if (vector.length !== embedding.dimensions) {
      throw new Error(
        `Embedding model ${embedding.provider}/${embedding.model} returned ${vector.length} dimensions, but the index expects ${embedding.dimensions}.`,
      );
    }
  }
}

export type PersistBookIndexDb = {
  exec: (sql: string) => Promise<unknown>;
  prepare: (sql: string) => {
    run: (...args: unknown[]) => Promise<unknown>;
    all: (...args: unknown[]) => Promise<unknown[]>;
  };
};

export type PersistBookIndexInput = {
  book: BookIdentity;
  pieces: Array<{
    sectionIndex: number;
    chapterTitle: string;
    text: string;
    pageNumber: number;
  }>;
  embeddings: Float32Array[];
  contextPrefixes: Array<string | null>;
  totalSections: number;
  /** Config the book was indexed with. Retrieval later reads this back. */
  embedding: EmbeddingModelConfig;
  onProgress?: (current: number, total: number) => void;
};

export async function persistBookIndex(
  db: PersistBookIndexDb,
  input: PersistBookIndexInput,
): Promise<void> {
  const {
    book,
    pieces,
    embeddings,
    contextPrefixes,
    totalSections,
    embedding,
    onProgress,
  } = input;
  const embeddingModelLabel = `${embedding.provider}/${embedding.model}`;

  if (!isSupportedEmbeddingDim(embedding.dimensions)) {
    throw new Error(
      `Embedding dim ${embedding.dimensions} has no typed storage table. Supported dims: 768, 1024, 1536, 3072.`,
    );
  }
  const embeddingTable = embeddingTableFor(
    embedding.dimensions as SupportedEmbeddingDim,
  );

  await db.exec("BEGIN");
  try {
    // Cascade delete handles chunk_embeddings_* cleanup for us since the
    // per-dim tables reference chunks(id) ON DELETE CASCADE.
    await db.prepare(`DELETE FROM chunks WHERE book_id = ?`).run(book.bookId);

    // RETURNING + .all() is the portable path across libSQL/turso wasm.
    const insertChunk = db.prepare(
      `INSERT INTO chunks (book_id, section_index, chapter_title, text, page_number, context_prefix)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id`,
    );
    const insertEmbedding = db.prepare(
      `INSERT INTO ${embeddingTable} (chunk_id, embedding) VALUES (?, ?)`,
    );

    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]!;
      const vector = embeddings[i]!;
      if (vector.length !== embedding.dimensions) {
        throw new Error(
          `Embedding ${i} has ${vector.length} dims, expected ${embedding.dimensions}.`,
        );
      }
      const rows = (await insertChunk.all(
        book.bookId,
        piece.sectionIndex,
        piece.chapterTitle,
        piece.text,
        piece.pageNumber,
        contextPrefixes[i],
      )) as Array<{ id: number }>;
      const chunkId = rows[0]?.id;
      if (typeof chunkId !== "number") {
        throw new Error(
          `INSERT INTO chunks did not return an id for chunk ${i}.`,
        );
      }
      await insertEmbedding.run(chunkId, embeddingToBlob(vector));
      if ((i + 1) % 50 === 0 || i === pieces.length - 1) {
        onProgress?.(i + 1, pieces.length);
      }
    }

    await db
      .prepare(
        `INSERT INTO book_index (
           book_id, title, author, total_chunks, total_sections,
           embedding_model, embedding_provider, embedding_model_id,
           embedding_dim
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(book_id) DO UPDATE SET
           title = excluded.title,
           author = excluded.author,
           total_chunks = excluded.total_chunks,
           total_sections = excluded.total_sections,
           embedding_model = excluded.embedding_model,
           embedding_provider = excluded.embedding_provider,
           embedding_model_id = excluded.embedding_model_id,
           embedding_dim = excluded.embedding_dim,
           indexed_at = unixepoch()`,
      )
      .run(
        book.bookId,
        book.title,
        book.author,
        pieces.length,
        totalSections,
        embeddingModelLabel,
        embedding.provider,
        embedding.model,
        embedding.dimensions,
      );

    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}
