import type { ProviderId } from "../types.ts";

/**
 * Curated default models per provider. The user can override any of these
 * from the settings panel. "chat" is the conversational model; "embed" is
 * the embedding model (if the provider offers one we support).
 */
export const PROVIDER_CATALOG: Record<
  ProviderId,
  {
    label: string;
    chatModels: { id: string; label: string; hint?: string }[];
    defaultChatModel: string;
    embedModels?: { id: string; label: string; dims: number }[];
    defaultEmbedModel?: { id: string; dims: number };
    needsApiKey: boolean;
  }
> = {
  anthropic: {
    label: "Anthropic (Claude)",
    chatModels: [
      { id: "claude-haiku-4-5", label: "Haiku 4.5" },
      { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
      { id: "claude-opus-4-7", label: "Opus 4.7" },
    ],
    defaultChatModel: "claude-haiku-4-5",
    // Anthropic ships no embedding model — configure OpenAI or Ollama for that.
    needsApiKey: true,
  },
  openai: {
    label: "OpenAI (GPT)",
    chatModels: [
      { id: "gpt-5-mini", label: "GPT-5 Mini" },
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-5-pro", label: "GPT-5 Pro" },
    ],
    defaultChatModel: "gpt-5-mini",
    embedModels: [
      { id: "text-embedding-3-small", label: "text-embedding-3-small", dims: 1536 },
      { id: "text-embedding-3-large", label: "text-embedding-3-large", dims: 3072 },
    ],
    defaultEmbedModel: { id: "text-embedding-3-small", dims: 1536 },
    needsApiKey: true,
  },
  google: {
    label: "Google (Gemini)",
    chatModels: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    ],
    defaultChatModel: "gemini-2.5-flash",
    needsApiKey: true,
  },
  ollama: {
    label: "Ollama (local)",
    chatModels: [
      {
        id: "gemma4:e4b",
        label: "Gemma 4 E4B",
        hint: "≈4B parameters, 128K context. Fits 16 GB RAM.",
      },
      {
        id: "gemma4:26b",
        label: "Gemma 4 26B A4B",
        hint: "26B total, 4B active per token. Recommended default for 32 GB+.",
      },
      {
        id: "qwen3:30b",
        label: "Qwen3 30B A3B",
        hint: "30B total, 3B active per token. Apache 2.0.",
      },
      {
        id: "gemma4:31b",
        label: "Gemma 4 31B",
        hint: "Dense 31B. 48 GB RAM recommended.",
      },
      {
        id: "qwen3:14b",
        label: "Qwen3 14B",
        hint: "Dense 14B.",
      },
    ],
    defaultChatModel: "gemma4:26b",
    embedModels: [
      { id: "qwen3-embedding:0.6b", label: "Qwen3 Embedding 0.6B", dims: 1024 },
      {
        id: "qwen3-embedding:4b",
        label: "Qwen3 Embedding 4B (MRL 1024d)",
        dims: 1024,
      },
      {
        id: "qwen3-embedding:8b",
        label: "Qwen3 Embedding 8B (MRL 3072d)",
        dims: 3072,
      },
      { id: "embeddinggemma", label: "EmbeddingGemma 308M", dims: 768 },
      { id: "nomic-embed-text", label: "nomic-embed-text", dims: 768 },
      { id: "mxbai-embed-large", label: "mxbai-embed-large", dims: 1024 },
    ],
    defaultEmbedModel: { id: "qwen3-embedding:0.6b", dims: 1024 },
    needsApiKey: false,
  },
};
