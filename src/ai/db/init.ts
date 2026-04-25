// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- turso wasm has no shipped types for Database itself
import type { Database } from "@tursodatabase/database-wasm/vite";

import {
  EMBEDDING_DIMS,
  SUPPORTED_EMBEDDING_DIMS,
  embeddingTableFor,
  type SupportedEmbeddingDim,
} from "./schema.ts";

/**
 * Create core tables + indexes on first boot. Every statement in
 * `baseStatements` is idempotent via `IF NOT EXISTS` and the per-dim
 * embedding tables are declared here once so fresh databases skip the
 * old-shape rebuild migration entirely.
 */
export async function runMigrations(db: Database): Promise<void> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version TEXT PRIMARY KEY,
       applied_at INTEGER NOT NULL DEFAULT (unixepoch())
     )`,
  );

  await dropPreBooksSchema(db);

  const baseStatements: string[] = [
    `CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      added_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    // Embeddings live in per-dim tables below so each column can stay
    // F32_BLOB(N) NOT NULL.
    `CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      section_index INTEGER NOT NULL,
      chapter_title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      context_prefix TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE INDEX IF NOT EXISTS chunks_book_page_idx ON chunks (book_id, page_number)`,

    ...embeddingTableStatements(),

    `CREATE TABLE IF NOT EXISTS book_index (
      book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      total_chunks INTEGER NOT NULL,
      total_sections INTEGER NOT NULL,
      embedding_model TEXT NOT NULL,
      indexed_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    `CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'New conversation',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE INDEX IF NOT EXISTS conversations_book_idx ON conversations (book_id)`,

    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages (conversation_id)`,

    `CREATE TABLE IF NOT EXISTS conversation_summaries (
      conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
      summary_json TEXT NOT NULL,
      turns_summarized INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,

    `CREATE TABLE IF NOT EXISTS chapter_summaries (
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      section_index INTEGER NOT NULL,
      chapter_title TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (book_id, section_index)
    )`,

    `CREATE TABLE IF NOT EXISTS review_cards (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      source_cfi TEXT,
      source_chunk_id INTEGER REFERENCES chunks(id) ON DELETE SET NULL,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      fsrs_state TEXT NOT NULL,
      due_at INTEGER NOT NULL,
      last_reviewed_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE INDEX IF NOT EXISTS cards_book_due_idx ON review_cards (book_id, due_at)`,
    `CREATE INDEX IF NOT EXISTS cards_due_idx ON review_cards (due_at)`,

    `CREATE TABLE IF NOT EXISTS reader_profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      preferred_quiz_style TEXT DEFAULT 'socratic',
      answer_style TEXT DEFAULT 'balanced',
      weak_concepts TEXT DEFAULT '[]',
      interests TEXT DEFAULT '[]',
      tone TEXT DEFAULT 'warm',
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `INSERT OR IGNORE INTO reader_profile (id) VALUES (1)`,

    `CREATE TABLE IF NOT EXISTS reading_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      page_number INTEGER,
      section_index INTEGER,
      duration_ms INTEGER,
      occurred_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE INDEX IF NOT EXISTS events_book_time_idx ON reading_events (book_id, occurred_at)`,
    `CREATE INDEX IF NOT EXISTS events_time_idx ON reading_events (occurred_at)`,

    `CREATE TABLE IF NOT EXISTS highlights (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      cfi TEXT NOT NULL,
      text TEXT NOT NULL,
      note TEXT,
      color TEXT NOT NULL DEFAULT 'yellow',
      page_number INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE INDEX IF NOT EXISTS highlights_book_idx ON highlights (book_id, created_at DESC)`,

    `CREATE TABLE IF NOT EXISTS mind_maps (
      book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
      data_json TEXT NOT NULL,
      max_page INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
  ];

  for (const stmt of baseStatements) {
    await db.exec(stmt);
  }

  // Additive column migrations. SQLite's ADD COLUMN has no IF NOT EXISTS,
  // so we try/catch duplicate-column errors.
  const forwardMigrations: string[] = [
    `ALTER TABLE review_cards ADD COLUMN explanation TEXT`,
    // Per-book embedding metadata. The legacy `embedding_model` label
    // column is kept for display / backfill; the authoritative fields are
    // provider + model_id + dim.
    `ALTER TABLE book_index ADD COLUMN embedding_provider TEXT`,
    `ALTER TABLE book_index ADD COLUMN embedding_model_id TEXT`,
    `ALTER TABLE book_index ADD COLUMN embedding_dim INTEGER`,
  ];
  for (const stmt of forwardMigrations) {
    try {
      await db.exec(stmt);
    } catch {
      // column already present — fine.
    }
  }

  // Backfill per-book embedding metadata for indexes written before the
  // columns existed. Under the old schema every index was openai +
  // 1536d, so we split the "provider/model" label and derive dim from it.
  await db.exec(
    `UPDATE book_index
       SET embedding_provider = CASE
             WHEN instr(embedding_model, '/') > 0
               THEN substr(embedding_model, 1, instr(embedding_model, '/') - 1)
             ELSE 'openai'
           END
     WHERE embedding_provider IS NULL`,
  );
  await db.exec(
    `UPDATE book_index
       SET embedding_model_id = CASE
             WHEN instr(embedding_model, '/') > 0
               THEN substr(embedding_model, instr(embedding_model, '/') + 1)
             ELSE embedding_model
           END
     WHERE embedding_model_id IS NULL`,
  );
  await db.exec(
    `UPDATE book_index SET embedding_dim = ${EMBEDDING_DIMS} WHERE embedding_dim IS NULL`,
  );

  await migrateChunksToPerDimTables(db);

  try {
    await db.exec(
      `CREATE INDEX IF NOT EXISTS chunks_search_idx
       ON chunks USING fts (text, chapter_title)`,
    );
  } catch (error) {
    console.warn("Skipping Turso FTS index setup:", error);
  }
}

export const BOOKS_TABLE_MIGRATION_ID = "2026-04-25/books-table-and-fks";

const PRESERVED_TABLES = ["schema_migrations", "reader_profile"];

async function dropPreBooksSchema(db: Database): Promise<void> {
  const alreadyApplied = (await db
    .prepare(`SELECT 1 AS done FROM schema_migrations WHERE version = ?`)
    .get(BOOKS_TABLE_MIGRATION_ID)) as { done: number } | undefined;
  if (alreadyApplied) return;

  const rows = (await db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )
    .all()) as Array<{ name: string }>;
  const tablesToDrop = rows
    .map((r) => r.name)
    .filter((name) => !PRESERVED_TABLES.includes(name));

  for (const table of tablesToDrop) {
    await db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
  await db
    .prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`)
    .run(BOOKS_TABLE_MIGRATION_ID);
}

function embeddingTableStatements(): string[] {
  return SUPPORTED_EMBEDDING_DIMS.map(
    (dim) =>
      `CREATE TABLE IF NOT EXISTS ${embeddingTableFor(dim as SupportedEmbeddingDim)} (
         chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
         embedding F32_BLOB(${dim}) NOT NULL
       )`,
  );
}

export const CHUNKS_SPLIT_MIGRATION_ID =
  "2026-04-23/chunks-split-embedding-column";

/**
 * One-shot migration: if `chunks.embedding` still exists (pre-Phase-2
 * database), copy its rows into `chunk_embeddings_1536` and rebuild
 * `chunks` without the legacy column. Idempotent via a `PRAGMA
 * table_info` check and a marker in `schema_migrations`.
 */
export async function migrateChunksToPerDimTables(
  db: Database,
): Promise<void> {
  const alreadyApplied = (await db
    .prepare(`SELECT 1 AS done FROM schema_migrations WHERE version = ?`)
    .get(CHUNKS_SPLIT_MIGRATION_ID)) as { done: number } | undefined;
  if (alreadyApplied) return;

  const columns = (await db
    .prepare(`PRAGMA table_info(chunks)`)
    .all()) as Array<{ name: string }>;
  const hasEmbeddingColumn = columns.some((c) => c.name === "embedding");

  if (!hasEmbeddingColumn) {
    // Fresh DB (or a DB that somehow reached the new shape without the
    // marker). Just record the marker so we don't scan again.
    await db
      .prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`)
      .run(CHUNKS_SPLIT_MIGRATION_ID);
    return;
  }

  // Every legacy row was indexed at 1536d under the old schema, so that's
  // the only table we need to backfill into.
  await db.exec("BEGIN");
  try {
    // FK checks are deferred until COMMIT. Mid-migration the chunks
    // table is rebuilt (DROP + RENAME), which would briefly leave
    // chunk_embeddings_1536 rows dangling under eager FK enforcement.
    // At COMMIT the new `chunks` table has the same ids, so every
    // reference resolves and the constraint passes.
    await db.exec("PRAGMA defer_foreign_keys = ON");

    await db.exec(
      `INSERT OR IGNORE INTO chunk_embeddings_1536 (chunk_id, embedding)
       SELECT id, embedding FROM chunks WHERE embedding IS NOT NULL`,
    );

    // SQLite doesn't allow altering a column's NOT NULL constraint or
    // dropping a typed vector column in place, so rebuild the table.
    await db.exec(
      `CREATE TABLE chunks_new (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         book_id TEXT NOT NULL,
         section_index INTEGER NOT NULL,
         chapter_title TEXT NOT NULL DEFAULT '',
         text TEXT NOT NULL,
         page_number INTEGER NOT NULL,
         context_prefix TEXT,
         created_at INTEGER NOT NULL DEFAULT (unixepoch())
       )`,
    );
    await db.exec(
      `INSERT INTO chunks_new (id, book_id, section_index, chapter_title, text, page_number, context_prefix, created_at)
       SELECT id, book_id, section_index, chapter_title, text, page_number, context_prefix, created_at
       FROM chunks`,
    );
    await db.exec(`DROP TABLE chunks`);
    await db.exec(`ALTER TABLE chunks_new RENAME TO chunks`);
    await db.exec(
      `CREATE INDEX IF NOT EXISTS chunks_book_page_idx ON chunks (book_id, page_number)`,
    );

    await db
      .prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`)
      .run(CHUNKS_SPLIT_MIGRATION_ID);

    await db.exec("COMMIT");
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
}
