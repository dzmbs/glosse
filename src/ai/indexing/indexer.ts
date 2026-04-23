import type {
  BookIdentity,
  EmbeddingModelConfig,
  IndexingProgress,
} from "../types";
import { assertSupportedEmbeddingModel } from "../embedding/compat";
import { getDb } from "../db/client";
import { chunkBook, type BookSource } from "../chunking/chunker";
import { embedBatch } from "../embedding/embedder";
import {
  buildBookOutline,
  contextualizeChunk,
} from "./contextualize";
import {
  assertPersistableEmbeddings,
  isIndexReady,
  persistBookIndex,
} from "./state";

export type IndexingOptions = {
  embedding: EmbeddingModelConfig;
  onProgress?: (p: IndexingProgress) => void;
  /** If true, prepend an AI-generated 1-2 sentence context to each chunk
   *  before embedding. Slower + costs chat tokens, but meaningfully
   *  improves retrieval accuracy. */
  contextualize?: boolean;
};

export async function isBookIndexed(bookId: string): Promise<boolean> {
  const db = await getDb();
  const row = (await db
    .prepare(
      `SELECT bi.total_chunks AS total_chunks,
              COALESCE(chunk_counts.chunk_count, 0) AS chunk_count
       FROM book_index bi
       LEFT JOIN (
         SELECT book_id, COUNT(*) AS chunk_count
         FROM chunks
         WHERE book_id = ?
         GROUP BY book_id
       ) AS chunk_counts
       ON chunk_counts.book_id = bi.book_id
       WHERE bi.book_id = ?
       LIMIT 1`,
    )
    .get(bookId, bookId)) as
    | { total_chunks: number; chunk_count: number }
    | undefined;
  return isIndexReady(row);
}

/**
 * End-to-end indexing: chunk → embed → persist. Replaces any existing
 * index for this book. Emits progress events so the UI can show a bar.
 */
export async function indexBook(
  book: BookIdentity & BookSource,
  opts: IndexingOptions,
): Promise<{ totalChunks: number }> {
  const embedding = assertSupportedEmbeddingModel(opts.embedding);
  const { onProgress } = opts;
  const db = await getDb();

  onProgress?.({ phase: "chunking", current: 0, total: book.sections.length });
  const pieces = chunkBook(book);

  if (pieces.length === 0) {
    await deleteBookIndex(book.bookId);
    onProgress?.({ phase: "done" });
    return { totalChunks: 0 };
  }

  // Optionally contextualize each chunk before embedding. We prepend a
  // 1-2 sentence doc-level situating line (Anthropic's Contextual
  // Retrieval technique). Stored separately in `context_prefix` so the
  // reader sees the raw passage on cite but the embedding reflects both.
  let contextPrefixes: Array<string | null> = pieces.map(() => null);
  if (opts.contextualize) {
    const outline = buildBookOutline(
      pieces.map((p) => ({
        index: p.sectionIndex,
        chapterTitle: p.chapterTitle,
      })),
    );
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]!;
      try {
        const ctx = await contextualizeChunk({
          bookTitle: book.title,
          bookAuthor: book.author,
          bookOutline: outline,
          chunkText: p.text,
          chapterTitle: p.chapterTitle,
          pageNumber: p.pageNumber,
        });
        contextPrefixes[i] = ctx || null;
      } catch {
        // Contextualize failures are non-fatal — we fall back to raw
        // chunk embedding. One bad API call shouldn't nuke the index.
        contextPrefixes[i] = null;
      }
      // Report progress interleaved with the eventual embedding phase so
      // the UI shows steady motion even during the slow context pass.
      if ((i + 1) % 10 === 0 || i === pieces.length - 1) {
        onProgress?.({
          phase: "embedding",
          current: Math.floor(((i + 1) / pieces.length) * pieces.length * 0.4),
          total: pieces.length,
        });
      }
    }
  }

  const embedTexts = pieces.map((p, i) => {
    const ctx = contextPrefixes[i];
    return ctx ? `${ctx}\n\n${p.text}` : p.text;
  });
  const embeddings = await embedBatch(
    embedding,
    embedTexts,
    (done, total) => onProgress?.({ phase: "embedding", current: done, total }),
  );
  assertPersistableEmbeddings(embedding, embeddings);

  onProgress?.({
    phase: "persisting",
    current: 0,
    total: pieces.length,
  });

  const totalSections = new Set(pieces.map((p) => p.sectionIndex)).size;
  await persistBookIndex(db, {
    book,
    pieces,
    embeddings,
    contextPrefixes,
    totalSections,
    embedding,
    onProgress: (current, total) =>
      onProgress?.({ phase: "persisting", current, total }),
  });

  onProgress?.({ phase: "done" });
  return { totalChunks: pieces.length };
}

export async function deleteBookIndex(bookId: string): Promise<void> {
  const db = await getDb();
  await db.prepare(`DELETE FROM chunks WHERE book_id = ?`).run(bookId);
  await db.prepare(`DELETE FROM book_index WHERE book_id = ?`).run(bookId);
  await db
    .prepare(`DELETE FROM chapter_summaries WHERE book_id = ?`)
    .run(bookId);
}
