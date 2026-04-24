import { embed, embedMany } from "ai";

import { assertSupportedEmbeddingModel } from "./compat";
import type { EmbeddingModelConfig } from "../types";
import { getEmbeddingProvider } from "../providers/registry";

/**
 * Default batch size. Large enough to amortize round-trip latency; small
 * enough that a single retry doesn't redo a fortune's worth of work. The
 * Vercel AI SDK will further split if the provider's maxEmbeddingsPerCall
 * is lower.
 */
const BATCH_SIZE = 96;

export type EmbedProgress = (done: number, total: number) => void;

export async function embedQuery(
  cfg: EmbeddingModelConfig,
  query: string,
): Promise<Float32Array> {
  const model = getEmbeddingProvider(assertSupportedEmbeddingModel(cfg));
  const { embedding } = await withRetry(() =>
    embed({
      model,
      value: query,
      providerOptions: getEmbeddingProviderOptions(cfg),
    }),
  );
  return Float32Array.from(embedding);
}

export async function embedBatch(
  cfg: EmbeddingModelConfig,
  texts: string[],
  onProgress?: EmbedProgress,
): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const model = getEmbeddingProvider(assertSupportedEmbeddingModel(cfg));
  const providerOptions = getEmbeddingProviderOptions(cfg);

  const out: Float32Array[] = new Array(texts.length);
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    const { embeddings } = await withRetry(() =>
      embedMany({ model, values: slice, providerOptions }),
    );
    for (let j = 0; j < embeddings.length; j++) {
      out[i + j] = Float32Array.from(embeddings[j]!);
    }
    onProgress?.(Math.min(i + slice.length, texts.length), texts.length);
  }
  return out;
}

function getEmbeddingProviderOptions(cfg: EmbeddingModelConfig) {
  // Qwen3-Embedding supports Matryoshka truncation via the `dimensions`
  // param on Ollama's /api/embed. Models that don't recognise the param
  // (nomic, mxbai, embeddinggemma) ignore it — safe to always send.
  const options: Record<string, { dimensions: number }> = {
    [cfg.provider]: { dimensions: cfg.dimensions },
  };
  return options;
}

/**
 * Retry with exponential backoff. Embedding endpoints commonly rate-limit
 * with a 429; wait a beat and try again. Bail after 3 attempts so a real
 * failure surfaces instead of blocking indexing forever.
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const wait = 500 * 2 ** attempt + Math.random() * 250;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
