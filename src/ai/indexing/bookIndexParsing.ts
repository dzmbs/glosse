import type { EmbeddingModelConfig } from "../types";

/**
 * Snapshot of what a given book was indexed with. This is the shape
 * retrieval consults at query time — it must be the authority, not the
 * user's current global embedding setting, so that changing the default
 * model doesn't silently break search on already-indexed books.
 */
export type BookIndexConfig = {
  bookId: string;
  embedding: EmbeddingModelConfig;
  /** `provider/model` string stored in the legacy `embedding_model` column.
   * Kept for display + backwards-compat only; the authoritative config is
   * in `embedding`. */
  embeddingModelLabel: string;
  totalChunks: number;
  totalSections: number;
  indexedAt: number;
};

/**
 * Raised when retrieval can't proceed because the book's index metadata
 * is missing, malformed, or the required provider isn't resolvable. UI
 * should surface these with a clear CTA (re-index, add API key, start
 * Ollama, etc.) rather than falling through to an empty result.
 */
export class BookIndexUnavailableError extends Error {
  readonly bookId: string;
  readonly reason:
    | "not-indexed"
    | "missing-metadata"
    | "provider-unavailable";
  readonly requiredProvider?: string;
  readonly requiredModel?: string;
  readonly cause?: unknown;

  constructor(input: {
    bookId: string;
    reason:
      | "not-indexed"
      | "missing-metadata"
      | "provider-unavailable";
    message: string;
    requiredProvider?: string;
    requiredModel?: string;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "BookIndexUnavailableError";
    this.bookId = input.bookId;
    this.reason = input.reason;
    this.requiredProvider = input.requiredProvider;
    this.requiredModel = input.requiredModel;
    this.cause = input.cause;
  }
}

export type BookIndexRow = {
  book_id: string;
  embedding_model: string;
  embedding_provider: string | null;
  embedding_model_id: string | null;
  embedding_dim: number | null;
  total_chunks: number;
  total_sections: number;
  indexed_at: number;
};

/**
 * Pure parser: turn a raw `book_index` row into a typed config, or throw
 * a BookIndexUnavailableError describing what's missing. Kept in a
 * DB-free module so Node tests can cover it without pulling the Turso
 * WASM bundle through the import graph.
 *
 * The `embedding_model_id` + `embedding_provider` columns are the
 * authoritative source. The legacy `embedding_model` label is kept for
 * display; it's only reparsed as a fallback for rows that predate the
 * new columns and somehow slipped past backfill.
 */
export function parseBookIndexRow(row: BookIndexRow): BookIndexConfig {
  const bookId = row.book_id;

  const slash = row.embedding_model.indexOf("/");
  const labelProvider = slash >= 0 ? row.embedding_model.slice(0, slash) : null;
  const labelModel =
    slash >= 0 ? row.embedding_model.slice(slash + 1) : row.embedding_model;

  const providerRaw = row.embedding_provider ?? labelProvider;
  if (providerRaw !== "openai" && providerRaw !== "ollama") {
    throw new BookIndexUnavailableError({
      bookId,
      reason: "missing-metadata",
      message:
        "This index is missing metadata and needs to be rebuilt.",
    });
  }
  const provider: EmbeddingModelConfig["provider"] = providerRaw;

  const modelId = row.embedding_model_id ?? labelModel;
  if (!modelId) {
    throw new BookIndexUnavailableError({
      bookId,
      reason: "missing-metadata",
      message:
        "This index is missing metadata and needs to be rebuilt.",
      requiredProvider: provider,
    });
  }

  const dim = row.embedding_dim;
  if (dim == null || dim <= 0) {
    throw new BookIndexUnavailableError({
      bookId,
      reason: "missing-metadata",
      message:
        "This index is missing metadata and needs to be rebuilt.",
      requiredProvider: provider,
      requiredModel: modelId,
    });
  }

  return {
    bookId,
    embedding: { provider, model: modelId, dimensions: dim },
    embeddingModelLabel: row.embedding_model,
    totalChunks: row.total_chunks,
    totalSections: row.total_sections,
    indexedAt: row.indexed_at,
  };
}

/** True when two configs are the same provider + model + dim. */
export function sameEmbeddingConfig(
  a: EmbeddingModelConfig,
  b: EmbeddingModelConfig,
): boolean {
  return (
    a.provider === b.provider &&
    a.model === b.model &&
    a.dimensions === b.dimensions
  );
}

/** Human-readable label for a provider id (UI + error message use). */
export function providerLabel(
  provider: EmbeddingModelConfig["provider"],
): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "ollama":
      return "Ollama";
  }
}

/**
 * Product-quality failure line for a BookIndexUnavailableError. We
 * route on the structured `reason` and render a short sentence the
 * user can act on. No raw SDK error details here.
 */
export function bookIndexErrorSummary(err: {
  reason:
    | "not-indexed"
    | "missing-metadata"
    | "provider-unavailable";
  requiredProvider?: string;
  requiredModel?: string;
}): string {
  switch (err.reason) {
    case "not-indexed":
      return "This book hasn't been indexed yet.";
    case "missing-metadata":
      return "This index is missing metadata and needs to be rebuilt.";
    case "provider-unavailable": {
      const label =
        err.requiredProvider === "ollama"
          ? "Ollama"
          : err.requiredProvider === "openai"
            ? "OpenAI"
            : (err.requiredProvider ?? "the original provider");
      const modelBit = err.requiredModel ? ` (${err.requiredModel})` : "";
      if (err.requiredProvider === "ollama") {
        return `This book was indexed with ${label}${modelBit}. Start Ollama or re-index with your current default.`;
      }
      return `This book was indexed with ${label}${modelBit}. Add the ${label} key or re-index with your current default.`;
    }
  }
}
