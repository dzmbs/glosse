import {
  SUPPORTED_EMBEDDING_DIMS,
  isSupportedEmbeddingDim,
} from "../db/schema.ts";
import { PROVIDER_CATALOG } from "../providers/catalog.ts";
import type { EmbeddingModelConfig } from "../types.ts";

/**
 * Re-exported for legacy callers that used a single-dim constant. The
 * real list of supported dims is `SUPPORTED_EMBEDDING_DIMS`, and the
 * schema carries a typed table per dim. New code should prefer the list.
 */
export { EMBEDDING_DIMS, SUPPORTED_EMBEDDING_DIMS } from "../db/schema.ts";

export function listSupportedEmbeddingProviders(): EmbeddingModelConfig["provider"][] {
  return (Object.entries(PROVIDER_CATALOG) as Array<
    [keyof typeof PROVIDER_CATALOG, (typeof PROVIDER_CATALOG)[keyof typeof PROVIDER_CATALOG]]
  >)
    .filter(
      ([provider, catalog]) =>
        (provider === "openai" || provider === "ollama") &&
        (catalog.embedModels ?? []).some((model) =>
          isSupportedEmbeddingDim(model.dims),
        ),
    )
    .map(([provider]) => provider as EmbeddingModelConfig["provider"]);
}

export function listSupportedEmbeddingModels(
  provider: EmbeddingModelConfig["provider"],
) {
  return (PROVIDER_CATALOG[provider].embedModels ?? []).filter((model) =>
    isSupportedEmbeddingDim(model.dims),
  );
}

export function getDefaultEmbeddingModel(): EmbeddingModelConfig {
  const provider = listSupportedEmbeddingProviders()[0] ?? "openai";
  // Prefer the provider's declared default model when it lands in our
  // supported-dims list, otherwise first supported model wins.
  const providerCatalog = PROVIDER_CATALOG[provider];
  const defaultId = providerCatalog.defaultEmbedModel?.id;
  const supported = listSupportedEmbeddingModels(provider);
  const pick =
    supported.find((m) => m.id === defaultId) ?? supported[0];
  if (!pick) {
    throw new Error("No compatible embedding model is configured");
  }
  return {
    provider,
    model: pick.id,
    dimensions: pick.dims,
  };
}

export function isSupportedEmbeddingModel(
  config: EmbeddingModelConfig,
): boolean {
  return listSupportedEmbeddingModels(config.provider).some(
    (model) =>
      model.id === config.model && model.dims === config.dimensions,
  );
}

export function normalizeEmbeddingModelConfig(
  config: EmbeddingModelConfig | null | undefined,
): EmbeddingModelConfig {
  if (config && isSupportedEmbeddingModel(config)) {
    return config;
  }
  return getDefaultEmbeddingModel();
}

export function assertSupportedEmbeddingModel(
  config: EmbeddingModelConfig,
): EmbeddingModelConfig {
  if (!isSupportedEmbeddingModel(config)) {
    throw new Error(
      `Embedding model ${config.provider}/${config.model} (${config.dimensions}d) isn't on the supported list. Supported dims: ${SUPPORTED_EMBEDDING_DIMS.join(", ")}.`,
    );
  }
  return config;
}
