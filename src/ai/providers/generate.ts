import { generateObject, NoObjectGeneratedError } from "ai";
import type { z } from "zod";

import { truncate } from "../utils/str";
import {
  getChatProvider,
  STRUCTURED_OUTPUT_PROVIDER_OPTIONS,
} from "./registry";
import { useAISettings } from "./settings";

type GenerateObjectOptions = Parameters<typeof generateObject>[0];

/**
 * Wraps `generateObject` with diagnostic logging for schema failures.
 *
 * Local JSON-mode models (Gemma, Qwen, Llama) routinely emit text that is
 * close but not valid against strict Zod schemas. ai-sdk surfaces this as
 * `NoObjectGeneratedError` with a terse "could not parse the response"
 * message and no indication of what the model actually returned.
 *
 * This wrapper catches that error, logs the raw model text to the
 * console, and re-throws with the snippet embedded in the message so the
 * UI error panel shows it too.
 */
export async function generateObjectWithDiagnostics<T>(
  label: string,
  options: Omit<GenerateObjectOptions, "schema"> & { schema: z.ZodType<T> },
): Promise<{ object: T }> {
  try {
    const result = await generateObject(options as GenerateObjectOptions);
    return { object: result.object as T };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      const rawText = err.text ?? "";
      const usage = err.usage;
      const finishReason = err.finishReason;
      console.groupCollapsed(
        `[${label}] NoObjectGeneratedError · finish=${finishReason ?? "?"} · tokens=${usage?.totalTokens ?? "?"}`,
      );
      console.error("Raw model output:");
      console.error(rawText);
      if (err.cause) console.error("Cause:", err.cause);
      console.groupEnd();

      const snippet = rawText ? truncate(rawText, 1200) : "(empty)";
      const nextErr = new Error(
        `${label}: model returned JSON that didn't fit the schema.\n\nRaw output:\n${snippet}`,
      );
      (nextErr as Error & { cause?: unknown }).cause = err;
      throw nextErr;
    }
    throw err;
  }
}

/**
 * Thin convenience wrapper for structured chat generation. Picks the
 * model from user settings and injects the provider options that local
 * models need, so call sites stay focused on schema + prompts.
 */
export async function generateStructuredChat<T>(
  label: string,
  options: {
    schema: z.ZodType<T>;
    system: string;
    prompt: string;
  },
): Promise<{ object: T }> {
  const { chatModel } = useAISettings.getState();
  return generateObjectWithDiagnostics<T>(label, {
    model: getChatProvider(chatModel),
    schema: options.schema,
    system: options.system,
    prompt: options.prompt,
    providerOptions: STRUCTURED_OUTPUT_PROVIDER_OPTIONS,
  });
}
