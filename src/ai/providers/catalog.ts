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
      { id: "claude-haiku-4-5", label: "Haiku 4.5 (fast, cheap)" },
      { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (balanced)" },
      { id: "claude-opus-4-7", label: "Opus 4.7 (best quality)" },
    ],
    defaultChatModel: "claude-haiku-4-5",
    // Anthropic doesn't ship an embedding model — use OpenAI or Ollama for that.
    needsApiKey: true,
  },
  openai: {
    label: "OpenAI (GPT)",
    chatModels: [
      { id: "gpt-5-mini", label: "GPT-5 Mini (fast, cheap)" },
      { id: "gpt-5", label: "GPT-5 (balanced)" },
      { id: "gpt-5-pro", label: "GPT-5 Pro (best quality)" },
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
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (fast, cheap)" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (best quality)" },
    ],
    defaultChatModel: "gemini-2.5-flash",
    needsApiKey: true,
  },
  ollama: {
    label: "Ollama (local)",
    chatModels: [
      { id: "llama3.2", label: "Llama 3.2" },
      { id: "qwen2.5", label: "Qwen 2.5" },
      { id: "mistral", label: "Mistral" },
    ],
    defaultChatModel: "llama3.2",
    embedModels: [
      { id: "nomic-embed-text", label: "nomic-embed-text", dims: 768 },
      { id: "mxbai-embed-large", label: "mxbai-embed-large", dims: 1024 },
    ],
    defaultEmbedModel: { id: "nomic-embed-text", dims: 768 },
    needsApiKey: false,
  },
};
