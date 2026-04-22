import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import {
  getDefaultEmbeddingModel,
  normalizeEmbeddingModelConfig,
} from "../embedding/compat";
import type { ChatModelConfig, EmbeddingModelConfig, ProviderId } from "../types";
import { PROVIDER_CATALOG } from "./catalog";

/**
 * BYOK settings. Keys are stored in localStorage (not encrypted yet —
 * see NOTE below). For a local-first app with no telemetry this matches
 * the threat model, but we should swap in a real keychain story before
 * shipping a publicly hosted build.
 *
 * NOTE: localStorage keys are accessible to any script on the origin.
 * That's fine for now because glosse is served from the user's own
 * machine. If we ever host a public build we'll need the Credential
 * Management API or a derived-key pattern.
 */
export type AISettings = {
  enabled: boolean;

  /** User-controlled model selection for chat. */
  chatModel: ChatModelConfig;
  /** User-controlled model selection for embeddings. */
  embeddingModel: EmbeddingModelConfig;

  /** Per-provider API key. Empty string = unset. */
  apiKeys: Record<ProviderId, string>;

  /** Ollama-specific base URL (for the local provider). */
  ollamaBaseUrl: string;

  /** Spoiler-safe retrieval is on by default. Off = allow full-book context. */
  spoilerProtection: boolean;

  /** Top-K retrieved chunks per query. */
  maxContextChunks: number;

  /** Run each chunk through a cheap model for a doc-level context prefix
   *  before embedding. Slower indexing but better retrieval quality. */
  useContextualRetrieval: boolean;
};

const DEFAULT: AISettings = {
  enabled: false,
  chatModel: {
    provider: "anthropic",
    model: PROVIDER_CATALOG.anthropic.defaultChatModel,
  },
  embeddingModel: getDefaultEmbeddingModel(),
  apiKeys: {
    anthropic: "",
    openai: "",
    google: "",
    ollama: "",
  },
  ollamaBaseUrl: "http://127.0.0.1:11434",
  spoilerProtection: true,
  maxContextChunks: 8,
  useContextualRetrieval: false,
};

type Actions = {
  setChatModel: (cfg: ChatModelConfig) => void;
  setEmbeddingModel: (cfg: EmbeddingModelConfig) => void;
  setApiKey: (provider: ProviderId, key: string) => void;
  setOllamaBaseUrl: (url: string) => void;
  setEnabled: (enabled: boolean) => void;
  setSpoilerProtection: (on: boolean) => void;
  setMaxContextChunks: (n: number) => void;
  setUseContextualRetrieval: (on: boolean) => void;
};

export const useAISettings = create<AISettings & Actions>()(
  persist(
    (set) => ({
      ...DEFAULT,
      setChatModel: (chatModel) => set({ chatModel }),
      setEmbeddingModel: (embeddingModel) => set({ embeddingModel }),
      setApiKey: (provider, key) =>
        set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),
      setOllamaBaseUrl: (ollamaBaseUrl) => set({ ollamaBaseUrl }),
      setEnabled: (enabled) => set({ enabled }),
      setSpoilerProtection: (spoilerProtection) => set({ spoilerProtection }),
      setMaxContextChunks: (maxContextChunks) => set({ maxContextChunks }),
      setUseContextualRetrieval: (useContextualRetrieval) =>
        set({ useContextualRetrieval }),
    }),
    {
      name: "glosse.ai.settings",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => {
        const state = persistedState as Partial<AISettings> | undefined;
        if (!state) return { ...DEFAULT };
        return {
          ...DEFAULT,
          ...state,
          embeddingModel: normalizeEmbeddingModelConfig(state.embeddingModel),
        };
      },
    },
  ),
);

export function getAPIKey(provider: ProviderId): string {
  return useAISettings.getState().apiKeys[provider];
}
