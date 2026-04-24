import type { BookIndexConfig } from "@/ai/indexing/bookIndexParsing";
import type { ChatModelConfig, EmbeddingModelConfig } from "@/ai/types";

/**
 * Narrow state shape the gate helpers need. Kept as a plain interface
 * (not tied to zustand) so tests can drop in a fake without initialising
 * the whole settings store.
 */
export type GateSettings = {
  chatModel: ChatModelConfig;
  embeddingModel: EmbeddingModelConfig;
  apiKeys: Record<string, string>;
};

export type GateIndexStatus =
  | { status: "checking" }
  | { status: "needed" }
  | { status: "indexing" }
  | { status: "ready"; config: BookIndexConfig | null }
  | { status: "error" };

/**
 * Which embedding config the Ask tab should validate against *right now*.
 *
 * - If the book is indexed, retrieval will use the book's saved config,
 *   so that's what needs a working provider/key.
 * - Otherwise (needs indexing / checking / error), indexing — once the
 *   user kicks it off — will use the current default, so that's the
 *   relevant config.
 *
 * This decouples the gate from `settings.embeddingModel` once a book is
 * indexed, which is the whole point of Phase 1: a user who swaps their
 * default must still be able to ask questions against books indexed
 * with the old model.
 */
export function pickActiveEmbeddingConfig(
  indexStatus: GateIndexStatus,
  settings: GateSettings,
): EmbeddingModelConfig {
  if (indexStatus.status === "ready" && indexStatus.config) {
    return indexStatus.config.embedding;
  }
  return settings.embeddingModel;
}

/** True when the chat provider has a usable handle (Ollama needs no key). */
export function hasChatKey(settings: GateSettings): boolean {
  if (settings.chatModel.provider === "ollama") return true;
  return (settings.apiKeys[settings.chatModel.provider] ?? "").length > 0;
}

/** True when an embedding config has a usable handle (Ollama needs no key). */
export function hasEmbeddingKeyForConfig(
  config: EmbeddingModelConfig,
  settings: GateSettings,
): boolean {
  if (config.provider === "ollama") return true;
  return (settings.apiKeys[config.provider] ?? "").length > 0;
}

/**
 * Is the Ask tab usable? Combines chat-side key with the *active*
 * embedding key (book's config when indexed, default otherwise).
 */
export function hasRequiredKeyForBook(
  indexStatus: GateIndexStatus,
  settings: GateSettings,
): boolean {
  const active = pickActiveEmbeddingConfig(indexStatus, settings);
  return hasChatKey(settings) && hasEmbeddingKeyForConfig(active, settings);
}

/** Same shape as `hasRequiredKeyForBook`, but only checks the embedding side. */
export function hasEmbeddingKeyForBook(
  indexStatus: GateIndexStatus,
  settings: GateSettings,
): boolean {
  const active = pickActiveEmbeddingConfig(indexStatus, settings);
  return hasEmbeddingKeyForConfig(active, settings);
}
