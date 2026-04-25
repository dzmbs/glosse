import { getDb } from "@/ai/db/client";
import {
  listBooks,
  getBook,
  getProgress,
  putBook,
  setProgress,
  type BookRecord,
} from "@/lib/db";

const EXPORT_VERSION = 2;

export type GlosseExport = {
  version: number;
  exportedAt: number;
  books: Array<{
    id: string;
    title: string;
    author: string;
    addedAt: number;
    fileB64: string;
    fileMime: string | null;
    coverB64: string | null;
    coverMime: string | null;
  }>;
  progress: Array<{
    bookId: string;
    cfi: string | null;
    percentage: number;
    updatedAt: number;
  }>;
  aiTables: {
    readerProfile: Record<string, unknown>[];
    highlights: Record<string, unknown>[];
    reviewCards: Record<string, unknown>[];
    conversations: Record<string, unknown>[];
    messages: Record<string, unknown>[];
    chapterSummaries: Record<string, unknown>[];
    conversationSummaries: Record<string, unknown>[];
    bookIndex: Record<string, unknown>[];
    readingEvents: Record<string, unknown>[];
  };
};

/**
 * Build a self-contained export of everything glosse stores locally.
 * Excludes `chunks` + embeddings — they're large and regeneratable from
 * the books themselves. Imports will re-run indexing on demand.
 */
export async function buildExport(): Promise<GlosseExport> {
  const [books, aiTables] = await Promise.all([
    serializeBooks(),
    serializeAiTables(),
  ]);
  const progress: GlosseExport["progress"] = [];
  for (const b of await listBooks()) {
    const p = await getProgress(b.id);
    if (p) progress.push(p);
  }
  return {
    version: EXPORT_VERSION,
    exportedAt: Math.floor(Date.now() / 1000),
    books,
    progress,
    aiTables,
  };
}

/** Trigger a file download of the current export. */
export async function downloadExport(filename?: string): Promise<void> {
  const data = await buildExport();
  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ??
    `glosse-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the download a beat before revoking the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function serializeBooks(): Promise<GlosseExport["books"]> {
  const list = await listBooks();
  const out: GlosseExport["books"] = [];
  for (const entry of list) {
    const full = await getBook(entry.id);
    if (!full) {
      console.warn(
        `[export] skipping "${entry.title}" (${entry.id}): metadata exists but file blob is missing`,
      );
      continue;
    }
    out.push({
      id: full.id,
      title: full.title,
      author: full.author,
      addedAt: full.addedAt,
      fileB64: await blobToBase64(full.file),
      fileMime: full.file.type || null,
      coverB64: full.coverBlob ? await blobToBase64(full.coverBlob) : null,
      coverMime: full.coverBlob?.type ?? null,
    });
  }
  return out;
}

async function serializeAiTables(): Promise<GlosseExport["aiTables"]> {
  try {
    const db = await getDb();
    const selectAll = async (table: string) =>
      (await db.prepare(`SELECT * FROM ${table}`).all()) as Record<
        string,
        unknown
      >[];
    const [
      readerProfile,
      highlights,
      reviewCards,
      conversations,
      messages,
      chapterSummaries,
      conversationSummaries,
      bookIndex,
      readingEvents,
    ] = await Promise.all([
      selectAll("reader_profile"),
      selectAll("highlights"),
      selectAll("review_cards"),
      selectAll("conversations"),
      selectAll("messages"),
      selectAll("chapter_summaries"),
      selectAll("conversation_summaries"),
      selectAll("book_index"),
      selectAll("reading_events"),
    ]);
    return {
      readerProfile,
      highlights,
      reviewCards,
      conversations,
      messages,
      chapterSummaries,
      conversationSummaries,
      bookIndex,
      readingEvents,
    };
  } catch {
    // AI DB hasn't been initialized yet (user never enabled AI). Return
    // an empty block rather than failing the whole export.
    return {
      readerProfile: [],
      highlights: [],
      reviewCards: [],
      conversations: [],
      messages: [],
      chapterSummaries: [],
      conversationSummaries: [],
      bookIndex: [],
      readingEvents: [],
    };
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // btoa can't take arbitrary binary; chunk-encode to avoid call-stack
  // limits on very large EPUBs.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)),
    );
  }
  return btoa(binary);
}

function base64ToBlob(b64: string, mime: string | null): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], mime ? { type: mime } : undefined);
}

// -- Import -------------------------------------------------------------

export type ImportSummary = {
  books: number;
  progress: number;
  highlights: number;
  cards: number;
  chapterSummaries: number;
  conversations: number;
  messages: number;
  bookIndex: number;
  readerProfile: number;
  readingEvents: number;
  conversationSummaries: number;
  skippedTables: string[];
};

/**
 * Restore a previous glosse backup. Re-adds books, reading progress, and
 * every AI table that can be replayed without regenerating chunks/embeddings.
 * Chunks aren't in the backup on purpose — they're large and derivable.
 * After import, re-index from the Library for AI search to work on the
 * imported books.
 *
 * Policy: INSERT-OR-REPLACE on primary keys. A fresh origin gets everything;
 * an origin with overlapping data gets overwritten by the backup values.
 */
export async function importFromJson(raw: string): Promise<ImportSummary> {
  const data = parseExport(raw);
  const summary: ImportSummary = {
    books: 0,
    progress: 0,
    highlights: 0,
    cards: 0,
    chapterSummaries: 0,
    conversations: 0,
    messages: 0,
    bookIndex: 0,
    readerProfile: 0,
    readingEvents: 0,
    conversationSummaries: 0,
    skippedTables: [],
  };

  // 1. Books + covers back into IndexedDB
  for (const b of data.books) {
    const file = base64ToBlob(b.fileB64, b.fileMime);
    const record: BookRecord = {
      id: b.id,
      title: b.title,
      author: b.author,
      addedAt: b.addedAt,
      file,
      coverBlob:
        b.coverB64 != null
          ? base64ToBlob(b.coverB64, b.coverMime ?? null)
          : null,
    };
    await putBook(record);
    summary.books++;
  }

  // 2. Progress
  for (const p of data.progress) {
    await setProgress(p);
    summary.progress++;
  }

  // 3. AI tables — single transaction per table to keep ordering sane
  try {
    const db = await getDb();
    summary.highlights = await restoreTable(
      db,
      "highlights",
      [
        "id",
        "book_id",
        "cfi",
        "text",
        "note",
        "color",
        "page_number",
        "created_at",
        "updated_at",
      ],
      data.aiTables.highlights,
    );
    summary.cards = await restoreTable(
      db,
      "review_cards",
      [
        "id",
        "book_id",
        "source_cfi",
        "source_chunk_id",
        "front",
        "back",
        "explanation",
        "fsrs_state",
        "due_at",
        "last_reviewed_at",
        "created_at",
      ],
      data.aiTables.reviewCards,
    );
    summary.chapterSummaries = await restoreTable(
      db,
      "chapter_summaries",
      ["book_id", "section_index", "chapter_title", "summary", "updated_at"],
      data.aiTables.chapterSummaries,
    );
    summary.conversations = await restoreTable(
      db,
      "conversations",
      ["id", "book_id", "title", "created_at", "updated_at"],
      data.aiTables.conversations,
    );
    summary.messages = await restoreTable(
      db,
      "messages",
      ["id", "conversation_id", "role", "content", "created_at"],
      data.aiTables.messages,
    );
    summary.bookIndex = await restoreTable(
      db,
      "book_index",
      [
        "book_id",
        "title",
        "author",
        "total_chunks",
        "total_sections",
        "embedding_model",
        "indexed_at",
        "embedding_provider",
        "embedding_model_id",
        "embedding_dim",
      ],
      data.aiTables.bookIndex,
    );
    summary.readerProfile = await restoreTable(
      db,
      "reader_profile",
      [
        "id",
        "preferred_quiz_style",
        "answer_style",
        "weak_concepts",
        "interests",
        "tone",
        "updated_at",
      ],
      data.aiTables.readerProfile,
    );
    summary.readingEvents = await restoreTable(
      db,
      "reading_events",
      [
        "id",
        "book_id",
        "kind",
        "page_number",
        "section_index",
        "duration_ms",
        "occurred_at",
      ],
      data.aiTables.readingEvents,
    );
    summary.conversationSummaries = await restoreTable(
      db,
      "conversation_summaries",
      ["conversation_id", "summary_json", "turns_summarized", "updated_at"],
      data.aiTables.conversationSummaries,
    );
  } catch (err) {
    // If the AI DB isn't initialised (user never enabled AI), skip AI tables
    // silently — books + progress still land in IndexedDB.
    summary.skippedTables.push(
      err instanceof Error ? err.message : String(err),
    );
  }

  return summary;
}

/** Parse + shape-validate a raw JSON payload. Throws on malformed input. */
function parseExport(raw: string): GlosseExport {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Not valid JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!data || typeof data !== "object") {
    throw new Error("Backup file is empty or not an object.");
  }
  const obj = data as Partial<GlosseExport>;
  if (typeof obj.version !== "number") {
    throw new Error("Backup is missing a `version` field.");
  }
  if (obj.version !== EXPORT_VERSION) {
    throw new Error(
      `Backup version ${obj.version} is incompatible with this build (expects version ${EXPORT_VERSION}). Re-export from a build that matches.`,
    );
  }
  if (!Array.isArray(obj.books) || !Array.isArray(obj.progress)) {
    throw new Error("Backup is missing `books` or `progress`.");
  }
  // aiTables is optional (older exports may have skipped it), backfill.
  const aiTables = obj.aiTables ?? {
    readerProfile: [],
    highlights: [],
    reviewCards: [],
    conversations: [],
    messages: [],
    chapterSummaries: [],
    conversationSummaries: [],
    bookIndex: [],
    readingEvents: [],
  };
  return { ...(obj as GlosseExport), aiTables };
}

/**
 * Insert rows from an export into a table using the declared column order.
 * Columns absent from a given row land as NULL. Uses INSERT OR REPLACE so
 * overlapping primary keys get overwritten by the backup (matches the
 * user expectation that "restore" wins).
 */
async function restoreTable(
  db: { prepare: (sql: string) => { run: (...args: unknown[]) => Promise<unknown> } },
  table: string,
  cols: string[],
  rows: Record<string, unknown>[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const placeholders = cols.map(() => "?").join(", ");
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
  );
  let n = 0;
  let firstError: unknown;
  let failed = 0;
  for (const row of rows) {
    const args = cols.map((c) => row[c] ?? null);
    try {
      await stmt.run(...args);
      n++;
    } catch (err) {
      failed++;
      if (firstError === undefined) firstError = err;
    }
  }
  if (failed > 0) {
    const detail =
      firstError instanceof Error ? firstError.message : String(firstError);
    console.warn(
      `[restore] ${table}: ${failed}/${rows.length} rows failed — first error: ${detail}`,
    );
  }
  return n;
}

/** Read a File the user picked via <input type="file"> and import it. */
export async function importFromFile(file: File): Promise<ImportSummary> {
  const text = await file.text();
  return importFromJson(text);
}
