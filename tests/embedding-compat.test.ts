import test from "node:test";
import assert from "node:assert/strict";

import {
  assertSupportedEmbeddingModel,
  getDefaultEmbeddingModel,
  isSupportedEmbeddingModel,
  listSupportedEmbeddingModels,
  listSupportedEmbeddingProviders,
  normalizeEmbeddingModelConfig,
} from "../src/ai/embedding/compat.ts";

test("Phase 2: both openai and ollama are exposed as supported embedding providers", () => {
  const providers = listSupportedEmbeddingProviders().sort();
  assert.deepEqual(providers, ["ollama", "openai"]);
});

test("Phase 2: per-provider model lists include every dim covered by typed storage", () => {
  const openai = listSupportedEmbeddingModels("openai").map((m) => m.dims);
  const ollama = listSupportedEmbeddingModels("ollama").map((m) => m.dims);

  // Every model the catalog ships for these providers happens to land
  // in SUPPORTED_EMBEDDING_DIMS today. If that ever changes we want
  // this assertion to flag it.
  for (const dim of [...openai, ...ollama]) {
    assert.ok(
      [768, 1024, 1536, 3072].includes(dim),
      `dim ${dim} is not in the supported set`,
    );
  }
});

test("getDefaultEmbeddingModel returns a config that is itself supported", () => {
  const def = getDefaultEmbeddingModel();
  assert.equal(isSupportedEmbeddingModel(def), true);
});

test("normalizeEmbeddingModelConfig keeps a valid Ollama config (Phase 2 change)", () => {
  const ollama = {
    provider: "ollama" as const,
    model: "nomic-embed-text",
    dimensions: 768,
  };
  assert.deepEqual(normalizeEmbeddingModelConfig(ollama), ollama);
});

test("normalizeEmbeddingModelConfig rewrites truly-invalid dims to the default", () => {
  const invalid = {
    provider: "openai" as const,
    model: "text-embedding-3-small",
    dimensions: 42, // not a supported dim
  };
  const out = normalizeEmbeddingModelConfig(invalid);
  assert.equal(isSupportedEmbeddingModel(out), true);
  assert.notEqual(out.dimensions, 42);
});

test("assertSupportedEmbeddingModel accepts both openai 1536 and openai 3072 in Phase 2", () => {
  assert.doesNotThrow(() =>
    assertSupportedEmbeddingModel({
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
    }),
  );
  assert.doesNotThrow(() =>
    assertSupportedEmbeddingModel({
      provider: "openai",
      model: "text-embedding-3-large",
      dimensions: 3072,
    }),
  );
});

test("assertSupportedEmbeddingModel rejects an unknown model id", () => {
  assert.throws(
    () =>
      assertSupportedEmbeddingModel({
        provider: "openai",
        model: "does-not-exist",
        dimensions: 1536,
      }),
    /isn't on the supported list/,
  );
});

test("assertSupportedEmbeddingModel rejects a mismatched dim for a known model", () => {
  // text-embedding-3-small is declared as 1536d in the catalog; asking
  // for 768d of it is nonsense.
  assert.throws(
    () =>
      assertSupportedEmbeddingModel({
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 768,
      }),
    /isn't on the supported list/,
  );
});
