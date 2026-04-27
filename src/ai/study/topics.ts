import { z } from "zod";

import { getDb } from "../db/client";
import type { ChunkRow } from "../db/schema";
import type { StudyScope } from "../prompts/study";
import { generateStructuredChat } from "../providers/generate";

export type TopicScope = StudyScope;

const TopicsSchema = z.object({
  topics: z
    .array(
      z
        .string()
        .min(2)
        .describe("A 1-3 word topic label, Title Case, no trailing punctuation"),
    )
    .min(1),
});

/** In-memory cache keyed on bookId+scope so tab switches don't re-query.
 * Bounded so a long session across many books doesn't keep every topic
 * set forever — LRU-ish behavior via insertion-order eviction. */
type CacheKey = string;
const CACHE_MAX_ENTRIES = 64;
const cache = new Map<CacheKey, string[]>();
const inflight = new Map<CacheKey, Promise<string[]>>();

function rememberTopics(key: CacheKey, value: string[]) {
  cache.set(key, value);
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function keyFor(bookId: string, scope: TopicScope): CacheKey {
  if (scope.kind === "chapter") {
    const narrow = scope.narrowedTo ? `::n::${scope.narrowedTo}` : "";
    return `${bookId}::ch::${scope.chapterTitle}${narrow}`;
  }
  return `${bookId}::all::${scope.maxPage}`;
}

/**
 * Propose a short list of focus topic chips for the study setup UI.
 * Samples indexed chunks (head/mid/tail) and asks the chat model for
 * distinctive labels. Returns `[]` if no material or the call fails so
 * the caller can fall back gracefully.
 */
export async function proposeFocusTopics(
  bookId: string,
  scope: TopicScope,
): Promise<string[]> {
  const key = keyFor(bookId, scope);
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const chunks = await sampleChunks(bookId, scope, 14);
    if (chunks.length === 0) return [];

    const passageBlock = chunks
      .map(
        (c) =>
          `[${c.chapter_title || `Section ${c.section_index + 1}`}, p. ${c.page_number}]\n${c.text}`,
      )
      .join("\n\n---\n\n");

    try {
      const { object } = await generateStructuredChat("topics", {
        schema: TopicsSchema,
        system:
          "You are suggesting focus topics for a study session. Read the passages and propose 6-8 distinctive, concrete topic chips the reader could quiz themselves on. Each chip is 1-3 words, Title Case, no punctuation, no duplicates. Prefer named concepts, techniques, and proper nouns over vague themes.",
        prompt: `<PASSAGES>\n${passageBlock}\n</PASSAGES>\n\nReturn the focus topics.`,
      });
      const seen = new Set<string>();
      const deduped: string[] = [];
      for (const raw of object.topics) {
        const trimmed = raw.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        deduped.push(trimmed);
        if (deduped.length === 8) break;
      }
      rememberTopics(key, deduped);
      return deduped;
    } catch {
      return [];
    }
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

export function clearTopicCache(bookId?: string): void {
  if (!bookId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${bookId}::`)) cache.delete(key);
  }
}

async function firstNonEmpty<T>(
  fetchers: Array<() => Promise<T[]>>,
): Promise<T[]> {
  for (const fetch of fetchers) {
    const rows = await fetch();
    if (rows.length > 0) return rows;
  }
  return [];
}

async function sampleChunks(
  bookId: string,
  scope: TopicScope,
  limit: number,
): Promise<ChunkRow[]> {
  const db = await getDb();

  if (scope.kind === "chapter") {
    // Reader-supplied TOC labels and indexed chapter_title are derived
    // independently — they can disagree on whitespace, prefixes, or
    // casing. Try exact, then trimmed/lowercased, then LIKE.
    const titles = scope.titles;
    if (titles.length === 0) return [];
    const placeholders = titles.map(() => "?").join(",");
    const lowered = titles.map((t) => t.toLowerCase().trim());
    return firstNonEmpty<ChunkRow>([
      () =>
        db
          .prepare(
            `SELECT * FROM chunks
             WHERE book_id = ? AND chapter_title IN (${placeholders})
             ORDER BY page_number ASC LIMIT ?`,
          )
          .all(bookId, ...titles, limit) as Promise<ChunkRow[]>,
      () =>
        db
          .prepare(
            `SELECT * FROM chunks
             WHERE book_id = ? AND LOWER(TRIM(chapter_title)) IN (${placeholders})
             ORDER BY page_number ASC LIMIT ?`,
          )
          .all(bookId, ...lowered, limit) as Promise<ChunkRow[]>,
      // Single-title LIKE — ORing many LIKEs gets expensive and the
      // earlier IN-on-trimmed pass usually already caught the match.
      () =>
        db
          .prepare(
            `SELECT * FROM chunks
             WHERE book_id = ? AND LOWER(chapter_title) LIKE LOWER(?)
             ORDER BY page_number ASC LIMIT ?`,
          )
          .all(bookId, `%${titles[0]}%`, limit) as Promise<ChunkRow[]>,
    ]);
  }

  // Pick `limit` rows spaced evenly across the page range — gives the
  // sampler breadth without biasing toward the opening of the book.
  const maxPageClause = scope.maxPage !== undefined ? " AND page_number <= ?" : "";
  const args: (string | number)[] = [bookId];
  if (scope.maxPage !== undefined) args.push(scope.maxPage);
  const rows = (await db
    .prepare(
      `SELECT * FROM chunks
       WHERE book_id = ?${maxPageClause}
       ORDER BY page_number ASC`,
    )
    .all(...args)) as ChunkRow[];

  if (rows.length === 0) return [];
  if (rows.length <= limit) return rows;

  const picked: ChunkRow[] = [];
  for (let i = 0; i < limit; i++) {
    const idx = Math.floor((i * rows.length) / limit);
    picked.push(rows[idx]!);
  }
  return picked;
}
