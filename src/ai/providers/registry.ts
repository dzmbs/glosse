import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOllama } from "ai-sdk-ollama";
import type { EmbeddingModel, LanguageModel } from "ai";

import type { ChatModelConfig, EmbeddingModelConfig } from "../types";
import { useAISettings } from "./settings";

// Allow direct browser calls — that's the whole point of BYOK. Each
// provider SDK has slightly different names for this escape hatch; we
// centralize them here.
const ANTHROPIC_BROWSER_HEADERS = {
  "anthropic-dangerous-direct-browser-access": "true",
};

/**
 * Resolve a chat model handle from the user's BYOK settings. Throws a
 * descriptive error if the required key is missing — callers should show
 * it to the user verbatim.
 */
export function getChatProvider(cfg: ChatModelConfig): LanguageModel {
  const { apiKeys, ollamaBaseUrl } = useAISettings.getState();

  switch (cfg.provider) {
    case "anthropic": {
      const key = apiKeys.anthropic;
      if (!key) throw new Error("Anthropic API key not set");
      return createAnthropic({
        apiKey: key,
        headers: ANTHROPIC_BROWSER_HEADERS,
      })(cfg.model);
    }
    case "openai": {
      const key = apiKeys.openai;
      if (!key) throw new Error("OpenAI API key not set");
      return createOpenAI({ apiKey: key })(cfg.model);
    }
    case "google": {
      const key = apiKeys.google;
      if (!key) throw new Error("Google AI API key not set");
      return createGoogleGenerativeAI({ apiKey: key })(cfg.model);
    }
    case "ollama": {
      return createOllama({ baseURL: `${ollamaBaseUrl}/api` })(cfg.model);
    }
  }
}

export function getEmbeddingProvider(
  cfg: EmbeddingModelConfig,
): EmbeddingModel {
  const { apiKeys, ollamaBaseUrl } = useAISettings.getState();

  switch (cfg.provider) {
    case "openai": {
      const key = apiKeys.openai;
      if (!key) throw new Error("OpenAI API key not set (for embeddings)");
      return createOpenAI({ apiKey: key }).textEmbeddingModel(cfg.model);
    }
    case "ollama": {
      return createOllama({ baseURL: `${ollamaBaseUrl}/api` }).textEmbeddingModel(
        cfg.model,
      );
    }
  }
}
