import test from "node:test";
import assert from "node:assert/strict";

import {
  CHUNKS_SPLIT_MIGRATION_ID,
  migrateChunksToPerDimTables,
} from "../src/ai/db/init.ts";

// A pared-down fake that mimics the methods the migration actually uses.
// Keeping it tight — the migration only needs exec/prepare.get/prepare.all/
// prepare.run, so that's all we stub. Everything else that isn't used
// by `migrateChunksToPerDimTables` throws to flag test drift.

type ChunkRow = {
  id: number;
  book_id: string;
  section_index: number;
  chapter_title: string;
  text: string;
  page_number: number;
  context_prefix: string | null;
  embedding: Uint8Array | null;
  created_at: number;
};

type PerDimRow = { chunk_id: number; embedding: Uint8Array };

class FakeDb {
  chunksHasEmbeddingColumn: boolean;
  chunks: ChunkRow[] = [];
  embeddings1536: PerDimRow[] = [];
  migrations: Set<string> = new Set();
  execLog: string[] = [];
  txState: "none" | "open" | "committed" | "rolledback" = "none";

  constructor(opts: { hasEmbeddingColumn: boolean }) {
    this.chunksHasEmbeddingColumn = opts.hasEmbeddingColumn;
  }

  async exec(sql: string): Promise<void> {
    this.execLog.push(sql);
    const s = sql.trim();

    if (s === "BEGIN") {
      this.txState = "open";
      return;
    }
    if (s === "COMMIT") {
      this.txState = "committed";
      return;
    }
    if (s === "ROLLBACK") {
      this.txState = "rolledback";
      return;
    }

    if (s.startsWith("PRAGMA defer_foreign_keys")) {
      return;
    }

    if (s.startsWith("INSERT OR IGNORE INTO chunk_embeddings_1536")) {
      // Only migrates rows whose legacy embedding column is non-null.
      for (const c of this.chunks) {
        if (c.embedding) {
          this.embeddings1536.push({ chunk_id: c.id, embedding: c.embedding });
        }
      }
      return;
    }

    if (s.startsWith("CREATE TABLE chunks_new")) {
      // Rebuild-in-progress; chunks_new shadow table doesn't need to be
      // represented physically — we stage the copy via INSERT below.
      return;
    }

    if (s.startsWith("INSERT INTO chunks_new")) {
      // Emulate: chunks_new = chunks without the embedding column.
      // We don't actually need chunks_new; we'll just drop the legacy
      // column from `chunks` when DROP/RENAME fires.
      return;
    }

    if (s.startsWith("DROP TABLE chunks")) {
      return;
    }

    if (s.startsWith("ALTER TABLE chunks_new RENAME TO chunks")) {
      // Column drop semantics: strip `embedding` from every row.
      this.chunks = this.chunks.map((c) => ({ ...c, embedding: null }));
      this.chunksHasEmbeddingColumn = false;
      return;
    }

    if (s.startsWith("CREATE INDEX IF NOT EXISTS chunks_book_page_idx")) {
      return;
    }

    throw new Error(`Unhandled SQL in migration fake: ${sql}`);
  }

  prepare(sql: string) {
    const s = sql.trim();
    return {
      get: async (...args: unknown[]) => {
        if (s.startsWith("SELECT 1 AS done FROM schema_migrations")) {
          return this.migrations.has(args[0] as string)
            ? { done: 1 }
            : undefined;
        }
        throw new Error(`Unhandled prepare.get: ${sql}`);
      },
      all: async () => {
        if (s.startsWith("PRAGMA table_info(chunks)")) {
          const cols: Array<{ name: string }> = [
            { name: "id" },
            { name: "book_id" },
            { name: "section_index" },
            { name: "chapter_title" },
            { name: "text" },
            { name: "page_number" },
            { name: "context_prefix" },
            { name: "created_at" },
          ];
          if (this.chunksHasEmbeddingColumn) cols.push({ name: "embedding" });
          return cols;
        }
        throw new Error(`Unhandled prepare.all: ${sql}`);
      },
      run: async (...args: unknown[]) => {
        if (s.startsWith("INSERT OR IGNORE INTO schema_migrations")) {
          this.migrations.add(args[0] as string);
          return;
        }
        throw new Error(`Unhandled prepare.run: ${sql}`);
      },
    };
  }
}

test("fresh DB (no legacy embedding column): migration records marker and does nothing else", async () => {
  const db = new FakeDb({ hasEmbeddingColumn: false });
  await migrateChunksToPerDimTables(db as never);

  assert.ok(
    db.migrations.has(CHUNKS_SPLIT_MIGRATION_ID),
    "migration marker should be recorded so we don't re-scan next boot",
  );
  assert.equal(db.txState, "none", "no transaction should open for a fresh DB");
  assert.equal(
    db.embeddings1536.length,
    0,
    "no rows to backfill on a fresh DB",
  );
});

test("legacy DB: embedding rows copy to chunk_embeddings_1536 and chunks column is dropped", async () => {
  const db = new FakeDb({ hasEmbeddingColumn: true });
  db.chunks = [
    {
      id: 1,
      book_id: "b",
      section_index: 0,
      chapter_title: "",
      text: "hi",
      page_number: 1,
      context_prefix: null,
      embedding: new Uint8Array(4 * 1536).fill(7),
      created_at: 0,
    },
    {
      id: 2,
      book_id: "b",
      section_index: 0,
      chapter_title: "",
      text: "there",
      page_number: 2,
      context_prefix: null,
      embedding: new Uint8Array(4 * 1536).fill(9),
      created_at: 0,
    },
  ];

  await migrateChunksToPerDimTables(db as never);

  assert.equal(db.txState, "committed", "migration must commit the rebuild");
  assert.equal(
    db.embeddings1536.length,
    2,
    "both legacy embeddings should land in chunk_embeddings_1536",
  );
  assert.deepEqual(
    db.embeddings1536.map((r) => r.chunk_id),
    [1, 2],
  );
  assert.equal(
    db.chunksHasEmbeddingColumn,
    false,
    "legacy column should be dropped post-rebuild",
  );
  assert.ok(db.migrations.has(CHUNKS_SPLIT_MIGRATION_ID));
});

test("second run is a no-op (marker short-circuits)", async () => {
  const db = new FakeDb({ hasEmbeddingColumn: true });
  db.migrations.add(CHUNKS_SPLIT_MIGRATION_ID);

  await migrateChunksToPerDimTables(db as never);

  assert.equal(db.txState, "none", "should short-circuit before BEGIN");
  assert.equal(db.embeddings1536.length, 0);
  assert.equal(
    db.chunksHasEmbeddingColumn,
    true,
    "state should be untouched when marker is present",
  );
});
