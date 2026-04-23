import { generateText } from "ai";

import type { ChatModelConfig } from "../types";
import { getChatProvider } from "../providers/registry";
import { useAISettings } from "../providers/settings";

/**
 * Contextual Retrieval (Anthropic, Sept 2024). For each chunk, generate
 * a 1-2 sentence doc-level context ("From Chapter 7; Raskolnikov's fever
 * dream after the murder…") and prepend it before embedding. The book's
 * outline is cached across chunks so the cost per chunk is just the
 * delta tokens of the chunk text.
 *
 * We only pass the book outline + the chunk text. Passing the whole book
 * would be ideal for cache hits but is impractical for a browser-side
 * indexer when we don't control provider caching headers.
 */

export type ContextualizeInput = {
  bookTitle: string;
  bookAuthor: string;
  /** Coarse outline: chapter titles, optionally with 1-line hints. */
  bookOutline: string;
  /** The chunk we want to contextualize. */
  chunkText: string;
  /** Chapter + section label to help the model locate the chunk. */
  chapterTitle: string;
  pageNumber: number;
  /** Override the chat model (defaults to the user's cheapest pick). */
  chatModel?: ChatModelConfig;
};

export async function contextualizeChunk(
  input: ContextualizeInput,
): Promise<string> {
  const settings = useAISettings.getState();
  const model = getChatProvider(input.chatModel ?? settings.chatModel);

  const { text } = await generateText({
    model,
    system: `You write ultra-compact context strings for retrieval. Given a chunk from a book, return 1-2 sentences that locate it in the book's structure and flag its core topic. 40 words max. No preamble, no quotes, no meta — just the situating sentence(s). Never invent content not implied by the chunk or outline.`,
    prompt: `BOOK: "${input.bookTitle}"${input.bookAuthor ? ` by ${input.bookAuthor}` : ""}
OUTLINE:
${input.bookOutline}

CHAPTER: "${input.chapterTitle}" (page ${input.pageNumber})

CHUNK:
"""
${input.chunkText}
"""

Write the 1-2 sentence context now:`,
  });

  return text.trim().replace(/^["']|["']$/g, "");
}

/**
 * Build a short outline string from a list of section/chapter labels.
 * Passed verbatim into `contextualizeChunk` — keep small.
 */
export function buildBookOutline(
  sections: Array<{ index: number; chapterTitle: string }>,
): string {
  // Keep unique chapter titles in spine order.
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const s of sections) {
    const t = s.chapterTitle?.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    titles.push(t);
    if (titles.length >= 40) break;
  }
  return titles.map((t, i) => `${i + 1}. ${t}`).join("\n");
}
