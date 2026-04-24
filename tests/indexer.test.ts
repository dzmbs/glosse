import test from "node:test";
import assert from "node:assert/strict";

import {
  assertPersistableEmbeddings,
  isIndexReady,
  persistBookIndex,
} from "../src/ai/indexing/state.ts";

type FakeRow = {
  id: number;
  book_id: string;
  section_index: number;
  chapter_title: string;
  text: string;
  page_number: number;
  context_prefix: string | null;
};

type FakeEmbeddingRow = {
  chunk_id: number;
  embedding: Uint8Array;
};

type FakeBookIndex = {
  title: string;
  author: string;
  total_chunks: number;
  total_sections: number;
  embedding_model: string;
  embedding_provider: string;
  embedding_model_id: string;
  embedding_dim: number;
};

class FakeDb {
  chunks: FakeRow[] = [];
  embeddings = new Map<string, FakeEmbeddingRow[]>(); // key: "chunk_embeddings_<dim>"
  bookIndex = new Map<string, FakeBookIndex>();
  commands: string[] = [];
  failChunkInsertAt: number | null = null;
  #insertCount = 0;
  #nextChunkId = 1;
  #snapshot: {
    chunks: FakeRow[];
    embeddings: Map<string, FakeEmbeddingRow[]>;
    bookIndex: Map<string, FakeBookIndex>;
  } | null = null;

  async exec(sql: string): Promise<void> {
    this.commands.push(sql);
    if (sql === "BEGIN") {
      this.#snapshot = {
        chunks: this.chunks.map((chunk) => ({ ...chunk })),
        embeddings: new Map(
          [...this.embeddings.entries()].map(([k, v]) => [
            k,
            v.map((row) => ({ ...row })),
          ]),
        ),
        bookIndex: new Map(this.bookIndex),
      };
    }
    if (sql === "ROLLBACK" && this.#snapshot) {
      this.chunks = this.#snapshot.chunks.map((chunk) => ({ ...chunk }));
      this.embeddings = new Map(
        [...this.#snapshot.embeddings.entries()].map(([k, v]) => [
          k,
          v.map((row) => ({ ...row })),
        ]),
      );
      this.bookIndex = new Map(this.#snapshot.bookIndex);
      this.#snapshot = null;
    }
    if (sql === "COMMIT") {
      this.#snapshot = null;
    }
  }

  prepare(sql: string) {
    const normalized = sql.trim();
    const self = this;

    const insertBookIndex = (args: unknown[]) => {
      self.bookIndex.set(args[0] as string, {
        title: args[1] as string,
        author: args[2] as string,
        total_chunks: args[3] as number,
        total_sections: args[4] as number,
        embedding_model: args[5] as string,
        embedding_provider: args[6] as string,
        embedding_model_id: args[7] as string,
        embedding_dim: args[8] as number,
      });
    };

    const insertChunkRow = (args: unknown[]) => {
      if (
        self.failChunkInsertAt !== null &&
        self.#insertCount === self.failChunkInsertAt
      ) {
        throw new Error("chunk insert failed");
      }
      self.#insertCount += 1;
      const id = self.#nextChunkId++;
      self.chunks.push({
        id,
        book_id: args[0] as string,
        section_index: args[1] as number,
        chapter_title: args[2] as string,
        text: args[3] as string,
        page_number: args[4] as number,
        context_prefix: (args[5] as string | null) ?? null,
      });
      return id;
    };

    const insertEmbeddingRow = (table: string, args: unknown[]) => {
      const list = self.embeddings.get(table) ?? [];
      list.push({
        chunk_id: args[0] as number,
        embedding: args[1] as Uint8Array,
      });
      self.embeddings.set(table, list);
    };

    const deleteChunks = (bookId: string) => {
      const keptIds = new Set(
        self.chunks.filter((c) => c.book_id !== bookId).map((c) => c.id),
      );
      self.chunks = self.chunks.filter((c) => keptIds.has(c.id));
      // Cascade — real DB does this via ON DELETE CASCADE.
      for (const [table, rows] of self.embeddings) {
        self.embeddings.set(
          table,
          rows.filter((r) => keptIds.has(r.chunk_id)),
        );
      }
    };

    const embeddingTableMatch = normalized.match(
      /^INSERT INTO (chunk_embeddings_\d+)/,
    );

    return {
      run: async (...args: unknown[]) => {
        if (normalized.startsWith("DELETE FROM chunks")) {
          deleteChunks(args[0] as string);
          return;
        }
        if (embeddingTableMatch) {
          insertEmbeddingRow(embeddingTableMatch[1]!, args);
          return;
        }
        if (normalized.startsWith("INSERT INTO book_index")) {
          insertBookIndex(args);
          return;
        }
        throw new Error(`Unhandled SQL in fake DB run(): ${sql}`);
      },
      all: async (...args: unknown[]) => {
        if (
          normalized.startsWith("INSERT INTO chunks") &&
          normalized.includes("RETURNING")
        ) {
          const id = insertChunkRow(args);
          return [{ id }];
        }
        throw new Error(`Unhandled SQL in fake DB all(): ${sql}`);
      },
    };
  }
}

test("isIndexReady rejects stale metadata", () => {
  assert.equal(isIndexReady(undefined), false);
  assert.equal(isIndexReady({ total_chunks: 3, chunk_count: 2 }), false);
  assert.equal(isIndexReady({ total_chunks: 0, chunk_count: 0 }), false);
  assert.equal(isIndexReady({ total_chunks: 3, chunk_count: 3 }), true);
});

test("assertPersistableEmbeddings catches dimensional mismatches", () => {
  assert.doesNotThrow(() =>
    assertPersistableEmbeddings(
      {
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
      },
      [new Float32Array(1536)],
    ),
  );

  assert.throws(
    () =>
      assertPersistableEmbeddings(
        {
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
        },
        [new Float32Array(1024)],
      ),
    /returned 1024 dimensions/,
  );
});

test("persistBookIndex rolls back deletions when a replacement insert fails", async () => {
  const db = new FakeDb();
  db.chunks = [
    {
      id: 999,
      book_id: "book-1",
      section_index: 0,
      chapter_title: "Old",
      text: "Old chunk",
      page_number: 1,
      context_prefix: null,
    },
  ];
  db.embeddings.set("chunk_embeddings_1536", [
    { chunk_id: 999, embedding: new Uint8Array(4 * 1536) },
  ]);
  db.bookIndex.set("book-1", {
    title: "Old title",
    author: "Old author",
    total_chunks: 1,
    total_sections: 1,
    embedding_model: "openai/text-embedding-3-small",
    embedding_provider: "openai",
    embedding_model_id: "text-embedding-3-small",
    embedding_dim: 1536,
  });
  db.failChunkInsertAt = 0;

  await assert.rejects(
    persistBookIndex(db as never, {
      book: { bookId: "book-1", title: "New title", author: "Author" },
      pieces: [
        {
          sectionIndex: 0,
          chapterTitle: "Chapter 1",
          text: "New chunk",
          pageNumber: 1,
        },
      ],
      embeddings: [new Float32Array(1536)],
      contextPrefixes: [null],
      totalSections: 1,
      embedding: {
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
      },
    }),
    /chunk insert failed/,
  );

  assert.equal(db.chunks.length, 1);
  assert.equal(db.chunks[0]?.text, "Old chunk");
  assert.equal(db.bookIndex.get("book-1")?.title, "Old title");
  assert.deepEqual(db.commands, ["BEGIN", "ROLLBACK"]);
});

test("persistBookIndex replaces chunks and updates metadata on success", async () => {
  const db = new FakeDb();

  await persistBookIndex(db as never, {
    book: { bookId: "book-2", title: "Fresh title", author: "Author" },
    pieces: [
      {
        sectionIndex: 0,
        chapterTitle: "Chapter 1",
        text: "Chunk A",
        pageNumber: 5,
      },
      {
        sectionIndex: 1,
        chapterTitle: "Chapter 2",
        text: "Chunk B",
        pageNumber: 6,
      },
    ],
    embeddings: [new Float32Array(1536), new Float32Array(1536)],
    contextPrefixes: [null, "Prefix"],
    totalSections: 2,
    embedding: {
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
    },
  });

  assert.equal(db.chunks.length, 2);
  assert.equal(db.bookIndex.get("book-2")?.total_chunks, 2);
  assert.deepEqual(db.commands, ["BEGIN", "COMMIT"]);
});

test("persistBookIndex writes provider, model id, and dim as first-class metadata", async () => {
  const db = new FakeDb();

  await persistBookIndex(db as never, {
    book: { bookId: "book-3", title: "Book", author: "Author" },
    pieces: [
      {
        sectionIndex: 0,
        chapterTitle: "Chapter 1",
        text: "Chunk",
        pageNumber: 1,
      },
    ],
    embeddings: [new Float32Array(768)],
    contextPrefixes: [null],
    totalSections: 1,
    embedding: {
      provider: "ollama",
      model: "nomic-embed-text",
      dimensions: 768,
    },
  });

  const row = db.bookIndex.get("book-3");
  assert.ok(row, "book_index row should be written");
  assert.equal(row.embedding_provider, "ollama");
  assert.equal(row.embedding_model_id, "nomic-embed-text");
  assert.equal(row.embedding_dim, 768);
  // Legacy label still written for display compat.
  assert.equal(row.embedding_model, "ollama/nomic-embed-text");
});

test("Phase 2: persistBookIndex routes each dim to its own storage table", async () => {
  const dims: Array<[number, string, string]> = [
    [768, "ollama", "nomic-embed-text"],
    [1024, "ollama", "mxbai-embed-large"],
    [1536, "openai", "text-embedding-3-small"],
    [3072, "openai", "text-embedding-3-large"],
  ];
  for (const [dim, provider, model] of dims) {
    const db = new FakeDb();
    await persistBookIndex(db as never, {
      book: { bookId: `book-${dim}`, title: "B", author: "A" },
      pieces: [
        {
          sectionIndex: 0,
          chapterTitle: "C",
          text: "t",
          pageNumber: 1,
        },
      ],
      embeddings: [new Float32Array(dim)],
      contextPrefixes: [null],
      totalSections: 1,
      embedding: {
        provider: provider as "ollama" | "openai",
        model,
        dimensions: dim,
      },
    });

    const targetTable = `chunk_embeddings_${dim}`;
    const rows = db.embeddings.get(targetTable) ?? [];
    assert.equal(rows.length, 1, `${targetTable} should receive the embedding`);

    // No other per-dim table should have been touched.
    for (const [table, list] of db.embeddings) {
      if (table === targetTable) continue;
      assert.equal(
        list.length,
        0,
        `${table} should be empty when writing ${dim}d; got ${list.length} rows`,
      );
    }
  }
});

test("Phase 2: persistBookIndex rejects an embedding dim without typed storage", async () => {
  const db = new FakeDb();
  await assert.rejects(
    persistBookIndex(db as never, {
      book: { bookId: "book-weird", title: "B", author: "A" },
      pieces: [
        { sectionIndex: 0, chapterTitle: "C", text: "t", pageNumber: 1 },
      ],
      embeddings: [new Float32Array(2048)],
      contextPrefixes: [null],
      totalSections: 1,
      embedding: {
        provider: "openai",
        model: "mystery-model",
        // 2048 is not in SUPPORTED_EMBEDDING_DIMS — must fail up front,
        // not silently write to a nonexistent table.
        dimensions: 2048,
      },
    }),
    /no typed storage table|Supported dims/,
  );
});

test("Phase 2: persistBookIndex catches a provider that returns the wrong dim at the last moment", async () => {
  // Config promises 1536 but the Float32Array is 1024. This is the
  // defense against a provider misbehaving mid-index.
  const db = new FakeDb();
  await assert.rejects(
    persistBookIndex(db as never, {
      book: { bookId: "book-mismatch", title: "B", author: "A" },
      pieces: [
        { sectionIndex: 0, chapterTitle: "C", text: "t", pageNumber: 1 },
      ],
      embeddings: [new Float32Array(1024)],
      contextPrefixes: [null],
      totalSections: 1,
      embedding: {
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
      },
    }),
    /1024 dims, expected 1536/,
  );
});
