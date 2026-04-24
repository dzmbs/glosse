import test from "node:test";
import assert from "node:assert/strict";

import {
  CHUNKS_SPLIT_MIGRATION_ID,
  migrateChunksToPerDimTables,
} from "../src/ai/db/init.ts";

// We can't run the real Turso WASM in Node, but we can verify the
// migration's *contract* with the connection: PRAGMA defer_foreign_keys
// must be issued INSIDE the transaction that rebuilds `chunks`, and
// the backfill into chunk_embeddings_1536 must happen BEFORE the old
// chunks table is dropped.

type Row = { id: number; embedding: Uint8Array | null };

class RecordingDb {
  execLog: string[] = [];
  chunks: Row[];
  embeddings1536: Array<{ chunk_id: number; embedding: Uint8Array }> = [];
  markers = new Set<string>();
  hasEmbeddingColumn: boolean;

  constructor(opts: { rows: Row[]; hasEmbeddingColumn: boolean }) {
    this.chunks = opts.rows;
    this.hasEmbeddingColumn = opts.hasEmbeddingColumn;
  }

  async exec(sql: string): Promise<void> {
    this.execLog.push(sql.trim());
    const s = sql.trim();
    if (s.startsWith("INSERT OR IGNORE INTO chunk_embeddings_1536")) {
      for (const r of this.chunks) {
        if (r.embedding) {
          this.embeddings1536.push({ chunk_id: r.id, embedding: r.embedding });
        }
      }
      return;
    }
    if (s.startsWith("ALTER TABLE chunks_new RENAME TO chunks")) {
      this.chunks = this.chunks.map((r) => ({ ...r, embedding: null }));
      this.hasEmbeddingColumn = false;
      return;
    }
  }

  prepare(sql: string) {
    const s = sql.trim();
    return {
      get: async (...args: unknown[]) => {
        if (s.startsWith("SELECT 1 AS done FROM schema_migrations")) {
          return this.markers.has(args[0] as string)
            ? { done: 1 }
            : undefined;
        }
        throw new Error(`Unhandled prepare.get: ${sql}`);
      },
      all: async () => {
        if (s.startsWith("PRAGMA table_info(chunks)")) {
          const base = [
            { name: "id" },
            { name: "book_id" },
            { name: "section_index" },
            { name: "chapter_title" },
            { name: "text" },
            { name: "page_number" },
            { name: "context_prefix" },
            { name: "created_at" },
          ];
          return this.hasEmbeddingColumn
            ? [...base, { name: "embedding" }]
            : base;
        }
        throw new Error(`Unhandled prepare.all: ${sql}`);
      },
      run: async (...args: unknown[]) => {
        if (s.startsWith("INSERT OR IGNORE INTO schema_migrations")) {
          this.markers.add(args[0] as string);
          return;
        }
        throw new Error(`Unhandled prepare.run: ${sql}`);
      },
    };
  }
}

test("legacy rebuild wraps FK checks via defer_foreign_keys inside the transaction", async () => {
  const db = new RecordingDb({
    hasEmbeddingColumn: true,
    rows: [
      { id: 1, embedding: new Uint8Array(4 * 1536) },
      { id: 2, embedding: new Uint8Array(4 * 1536) },
    ],
  });

  await migrateChunksToPerDimTables(db as never);

  const beginIdx = db.execLog.indexOf("BEGIN");
  const deferIdx = db.execLog.findIndex(
    (s) => s === "PRAGMA defer_foreign_keys = ON",
  );
  const commitIdx = db.execLog.indexOf("COMMIT");

  assert.ok(beginIdx >= 0, "transaction must open");
  assert.ok(
    deferIdx > beginIdx && deferIdx < commitIdx,
    "defer_foreign_keys PRAGMA must sit inside the same transaction",
  );
  assert.ok(commitIdx > 0, "transaction must commit");
});

test("backfill into chunk_embeddings_1536 runs before DROP TABLE chunks", async () => {
  const db = new RecordingDb({
    hasEmbeddingColumn: true,
    rows: [{ id: 1, embedding: new Uint8Array(4 * 1536).fill(1) }],
  });

  await migrateChunksToPerDimTables(db as never);

  const backfillIdx = db.execLog.findIndex((s) =>
    s.startsWith("INSERT OR IGNORE INTO chunk_embeddings_1536"),
  );
  const dropIdx = db.execLog.findIndex((s) =>
    s.startsWith("DROP TABLE chunks"),
  );

  assert.ok(backfillIdx >= 0, "backfill must happen");
  assert.ok(dropIdx >= 0, "old chunks table must be dropped");
  assert.ok(
    backfillIdx < dropIdx,
    "backfill must precede DROP so we don't lose the vector before copying it",
  );
  assert.equal(db.embeddings1536.length, 1);
});

test("rebuild doesn't fire a second time — marker short-circuits everything", async () => {
  const db = new RecordingDb({
    hasEmbeddingColumn: true,
    rows: [{ id: 1, embedding: new Uint8Array(4 * 1536) }],
  });
  db.markers.add(CHUNKS_SPLIT_MIGRATION_ID);

  await migrateChunksToPerDimTables(db as never);

  // No BEGIN means no transaction, so no accidental DROP on a
  // second boot.
  assert.equal(
    db.execLog.includes("BEGIN"),
    false,
    "second run must not open a transaction",
  );
  assert.equal(
    db.embeddings1536.length,
    0,
    "second run must not re-run the backfill",
  );
});
