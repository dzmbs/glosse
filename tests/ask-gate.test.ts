import test from "node:test";
import assert from "node:assert/strict";

import type { BookIndexConfig } from "../src/ai/indexing/bookIndex.ts";
import {
  hasChatKey,
  hasEmbeddingKeyForBook,
  hasEmbeddingKeyForConfig,
  hasRequiredKeyForBook,
  pickActiveEmbeddingConfig,
  type GateIndexStatus,
  type GateSettings,
} from "../src/components/ai/askGate.ts";

const openaiCfg = {
  provider: "openai" as const,
  model: "text-embedding-3-small",
  dimensions: 1536,
};
const ollamaCfg = {
  provider: "ollama" as const,
  model: "nomic-embed-text",
  dimensions: 768,
};

function settings(overrides: Partial<GateSettings> = {}): GateSettings {
  return {
    chatModel: { provider: "anthropic", model: "claude-sonnet-4-6" },
    embeddingModel: openaiCfg,
    apiKeys: {
      anthropic: "sk-anthropic-test",
      openai: "sk-openai-test",
      google: "",
      ollama: "",
    },
    ...overrides,
  };
}

function readyWithConfig(embedding: typeof openaiCfg): GateIndexStatus {
  const config: BookIndexConfig = {
    bookId: "book-1",
    embedding,
    embeddingModelLabel: `${embedding.provider}/${embedding.model}`,
    totalChunks: 100,
    totalSections: 5,
    indexedAt: 1_700_000_000,
  };
  return { status: "ready", config };
}

test("pickActiveEmbeddingConfig returns book config when ready, default otherwise", () => {
  const s = settings();
  assert.deepEqual(
    pickActiveEmbeddingConfig(readyWithConfig(ollamaCfg), s),
    ollamaCfg,
    "ready → book's saved config",
  );
  assert.deepEqual(
    pickActiveEmbeddingConfig({ status: "needed" }, s),
    openaiCfg,
    "not yet indexed → current default",
  );
  assert.deepEqual(
    pickActiveEmbeddingConfig({ status: "checking" }, s),
    openaiCfg,
    "checking → current default",
  );
  assert.deepEqual(
    pickActiveEmbeddingConfig({ status: "error" }, s),
    openaiCfg,
    "error → current default",
  );
});

test("pickActiveEmbeddingConfig falls through to default when ready but config is null", () => {
  const s = settings();
  // Defensive: ready-without-config shouldn't normally happen, but if it
  // does we shouldn't crash — fall back to settings default.
  assert.deepEqual(
    pickActiveEmbeddingConfig({ status: "ready", config: null }, s),
    openaiCfg,
  );
});

test("hasEmbeddingKeyForConfig requires a key unless provider is Ollama", () => {
  const withOpenAI = settings();
  const noOpenAI = settings({ apiKeys: { ...settings().apiKeys, openai: "" } });

  assert.equal(hasEmbeddingKeyForConfig(openaiCfg, withOpenAI), true);
  assert.equal(hasEmbeddingKeyForConfig(openaiCfg, noOpenAI), false);

  // Ollama needs no key regardless of what's stored.
  assert.equal(hasEmbeddingKeyForConfig(ollamaCfg, noOpenAI), true);
});

// This is the regression the reviewer flagged: the Ask composer used to
// gate on the CURRENT default embedding provider's key. It must now gate
// on the BOOK's saved embedding provider's key once the book is indexed,
// so that switching the default doesn't lock users out of books indexed
// with the old provider.
test("REGRESSION: indexed book keeps working after user switches default embedding provider", () => {
  // Book was indexed with OpenAI. User has now switched their default
  // to Ollama. OpenAI key is still present in settings. Ollama provider
  // needs no key.
  const s = settings({
    embeddingModel: ollamaCfg, // default changed to Ollama
  });
  const status = readyWithConfig(openaiCfg); // book still uses OpenAI

  assert.equal(
    hasEmbeddingKeyForBook(status, s),
    true,
    "OpenAI key is present and that's what the book needs → gate passes",
  );
  assert.equal(
    hasRequiredKeyForBook(status, s),
    true,
    "anthropic chat key + openai embedding key → can ask",
  );
});

test("REGRESSION: book indexed with OpenAI fails explicit when user removes OpenAI key", () => {
  // Book was indexed with OpenAI. User removed their OpenAI key (and
  // switched default to Ollama). The book's retrieval genuinely can't
  // proceed — gate should correctly refuse.
  const s = settings({
    embeddingModel: ollamaCfg,
    apiKeys: {
      anthropic: "sk-anthropic-test",
      openai: "", // removed
      google: "",
      ollama: "",
    },
  });
  const status = readyWithConfig(openaiCfg);

  assert.equal(hasEmbeddingKeyForBook(status, s), false);
  assert.equal(hasRequiredKeyForBook(status, s), false);
});

test("REGRESSION: book indexed with Ollama doesn't care about OpenAI key absence", () => {
  // Mirror of the above. Book was indexed with Ollama. OpenAI is the
  // default now but the book doesn't need it. Gate must not block.
  const s = settings({
    embeddingModel: openaiCfg,
    apiKeys: {
      anthropic: "sk-anthropic-test",
      openai: "", // absent
      google: "",
      ollama: "",
    },
  });
  const status = readyWithConfig(ollamaCfg);

  assert.equal(hasEmbeddingKeyForBook(status, s), true);
  assert.equal(hasRequiredKeyForBook(status, s), true);
});

test("hasChatKey is independent of embedding path", () => {
  assert.equal(hasChatKey(settings()), true);
  assert.equal(
    hasChatKey(
      settings({
        apiKeys: {
          anthropic: "",
          openai: "sk-openai-test",
          google: "",
          ollama: "",
        },
      }),
    ),
    false,
  );
  // Ollama chat model → always true, no key needed.
  assert.equal(
    hasChatKey(
      settings({
        chatModel: { provider: "ollama", model: "llama3.1" },
        apiKeys: { anthropic: "", openai: "", google: "", ollama: "" },
      }),
    ),
    true,
  );
});

test("pre-indexing states gate on the current default (that's what indexing will use)", () => {
  // No key for current default → can't index yet → can't ask.
  const noKey = settings({
    apiKeys: { anthropic: "sk-ok", openai: "", google: "", ollama: "" },
  });
  assert.equal(
    hasRequiredKeyForBook({ status: "needed" }, noKey),
    false,
    "needed + no key for default → gate closed",
  );
  assert.equal(
    hasRequiredKeyForBook({ status: "checking" }, noKey),
    false,
  );
});
