import test from "node:test";
import assert from "node:assert/strict";

import {
  BookIndexUnavailableError,
  parseBookIndexRow,
  sameEmbeddingConfig,
  type BookIndexRow,
} from "../src/ai/indexing/bookIndexParsing.ts";

function baseRow(overrides: Partial<BookIndexRow> = {}): BookIndexRow {
  return {
    book_id: "book-1",
    embedding_model: "openai/text-embedding-3-small",
    embedding_provider: "openai",
    embedding_model_id: "text-embedding-3-small",
    embedding_dim: 1536,
    total_chunks: 42,
    total_sections: 5,
    indexed_at: 1_700_000_000,
    ...overrides,
  };
}

test("parseBookIndexRow uses first-class columns when present", () => {
  const config = parseBookIndexRow(baseRow());
  assert.equal(config.bookId, "book-1");
  assert.equal(config.embedding.provider, "openai");
  assert.equal(config.embedding.model, "text-embedding-3-small");
  assert.equal(config.embedding.dimensions, 1536);
  assert.equal(config.embeddingModelLabel, "openai/text-embedding-3-small");
  assert.equal(config.totalChunks, 42);
});

test("parseBookIndexRow falls back to legacy label when new columns are null (pre-backfill row)", () => {
  const config = parseBookIndexRow(
    baseRow({ embedding_provider: null, embedding_model_id: null }),
  );
  assert.equal(config.embedding.provider, "openai");
  assert.equal(config.embedding.model, "text-embedding-3-small");
});

test("parseBookIndexRow refuses to guess when a bare label has no provider and new columns are null", () => {
  // A label like "text-embedding-3-small" with nothing else is ambiguous
  // — could be OpenAI, could be Ollama wrapping that same name. We'd
  // rather fail loud than guess. Backfill would have populated the
  // provider column at migration time, so reaching this state in prod
  // means corruption.
  assert.throws(
    () =>
      parseBookIndexRow(
        baseRow({
          embedding_model: "text-embedding-3-small",
          embedding_provider: null,
          embedding_model_id: null,
        }),
      ),
    (err: unknown) => {
      assert.ok(err instanceof BookIndexUnavailableError);
      assert.equal(err.reason, "missing-metadata");
      return true;
    },
  );
});

test("parseBookIndexRow prefers explicit provider column over the label prefix", () => {
  const config = parseBookIndexRow(
    baseRow({
      embedding_model: "openai/nomic-embed-text",
      embedding_provider: "ollama",
      embedding_model_id: "nomic-embed-text",
    }),
  );
  assert.equal(config.embedding.provider, "ollama");
  assert.equal(config.embedding.model, "nomic-embed-text");
});

test("parseBookIndexRow throws when provider is unrecognised", () => {
  assert.throws(
    () =>
      parseBookIndexRow(
        baseRow({
          embedding_provider: "nonsense-provider",
          embedding_model: "nonsense-provider/model",
        }),
      ),
    (err: unknown) => {
      assert.ok(err instanceof BookIndexUnavailableError);
      assert.equal(err.reason, "missing-metadata");
      assert.equal(err.bookId, "book-1");
      return true;
    },
  );
});

test("parseBookIndexRow throws when dim is missing — structured reason + requiredProvider/Model preserved", () => {
  assert.throws(
    () => parseBookIndexRow(baseRow({ embedding_dim: null })),
    (err: unknown) => {
      assert.ok(err instanceof BookIndexUnavailableError);
      assert.equal(err.reason, "missing-metadata");
      // Message is product-facing + short; callers differentiate on the
      // structured `reason` + `requiredProvider` fields, not regex.
      assert.equal(err.requiredProvider, "openai");
      assert.equal(err.requiredModel, "text-embedding-3-small");
      return true;
    },
  );
});

test("parseBookIndexRow throws when dim is zero or negative (defensive)", () => {
  assert.throws(
    () => parseBookIndexRow(baseRow({ embedding_dim: 0 })),
    BookIndexUnavailableError,
  );
  assert.throws(
    () => parseBookIndexRow(baseRow({ embedding_dim: -1 })),
    BookIndexUnavailableError,
  );
});

test("parseBookIndexRow throws when model id is missing and label has no slash + no provider", () => {
  assert.throws(
    () =>
      parseBookIndexRow(
        baseRow({
          embedding_model: "",
          embedding_model_id: null,
          embedding_provider: "openai",
        }),
      ),
    (err: unknown) => {
      assert.ok(err instanceof BookIndexUnavailableError);
      assert.equal(err.reason, "missing-metadata");
      assert.equal(err.requiredProvider, "openai");
      return true;
    },
  );
});

test("sameEmbeddingConfig compares provider, model, and dim", () => {
  const a = { provider: "openai" as const, model: "text-embedding-3-small", dimensions: 1536 };
  const b = { ...a };
  const diffModel = { ...a, model: "text-embedding-3-large" };
  const diffProvider = { ...a, provider: "ollama" as const };
  const diffDim = { ...a, dimensions: 3072 };

  assert.equal(sameEmbeddingConfig(a, b), true);
  assert.equal(sameEmbeddingConfig(a, diffModel), false);
  assert.equal(sameEmbeddingConfig(a, diffProvider), false);
  assert.equal(sameEmbeddingConfig(a, diffDim), false);
});
