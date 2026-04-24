import { generateText } from "ai";

import { getDb } from "../db/client";
import type { BookIndexRow } from "../db/schema";
import { buildCompanionPrompt } from "../prompts/companion";
import { getChatProvider } from "../providers/registry";
import type { AISettings } from "../providers/settings";
import { hybridRetrieve } from "../retrieval/hybrid";
import type { RetrievedChunk } from "../types";
import type {
  AnswerEvalResult,
  EvalCase,
  IndexedEvalBook,
  ResolvedEvalCase,
  RetrievalEvalResult,
} from "./types";

function normalizeKey(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function pageRank(passages: RetrievedChunk[], pages: number[] | undefined): number | null {
  if (!pages || pages.length === 0) return null;
  const wanted = new Set(pages);
  const idx = passages.findIndex((p) => wanted.has(p.pageNumber));
  return idx >= 0 ? idx + 1 : null;
}

function nearestPageDistance(
  passages: RetrievedChunk[],
  pages: number[] | undefined,
): number | null {
  if (!pages || pages.length === 0 || passages.length === 0) return null;
  let best = Number.POSITIVE_INFINITY;
  for (const passage of passages) {
    for (const page of pages) {
      best = Math.min(best, Math.abs(passage.pageNumber - page));
    }
  }
  return Number.isFinite(best) ? best : null;
}

function extractCitedPages(text: string): number[] {
  const found = [...text.matchAll(/\bp\.\s*(\d+)/gi)].map((m) => Number(m[1]));
  return found.filter((n) => Number.isFinite(n));
}

export async function listIndexedEvalBooks(): Promise<IndexedEvalBook[]> {
  const db = await getDb();
  const rows = (await db
    .prepare(
      `SELECT book_id, title, author, total_chunks, total_sections, embedding_model, indexed_at
       FROM book_index
       ORDER BY title ASC, author ASC`,
    )
    .all()) as BookIndexRow[];
  return rows;
}

export function resolveEvalCases(
  cases: EvalCase[],
  books: IndexedEvalBook[],
): ResolvedEvalCase[] {
  return cases.map((source) => {
    const titleKey = normalizeKey(source.bookTitle);
    const authorKey = normalizeKey(source.bookAuthor);
    const titleMatches = books.filter(
      (book) => normalizeKey(book.title) === titleKey,
    );

    if (titleMatches.length === 0) {
      return {
        source,
        resolution: "missing",
        reason: `No indexed book found for "${source.bookTitle}".`,
      };
    }

    if (authorKey) {
      const exact = titleMatches.filter(
        (book) => normalizeKey(book.author) === authorKey,
      );
      if (exact.length === 1) {
        return { source, resolution: "matched", matchedBook: exact[0]! };
      }
      if (exact.length > 1) {
        return {
          source,
          resolution: "ambiguous",
          reason: `Multiple indexed books matched "${source.bookTitle}" by "${source.bookAuthor}".`,
          candidates: exact,
        };
      }
      return {
        source,
        resolution: "missing",
        reason: `Found "${source.bookTitle}" but author "${source.bookAuthor}" did not match.`,
      };
    }

    if (titleMatches.length === 1) {
      return { source, resolution: "matched", matchedBook: titleMatches[0]! };
    }

    return {
      source,
      resolution: "ambiguous",
      reason: `Multiple indexed books matched "${source.bookTitle}". Add author to disambiguate.`,
      candidates: titleMatches,
    };
  });
}

export async function runRetrievalEval(
  resolved: Extract<ResolvedEvalCase, { resolution: "matched" }>,
  settings: Pick<AISettings, "maxContextChunks">,
): Promise<RetrievalEvalResult> {
  const passages = await hybridRetrieve({
    bookId: resolved.matchedBook.book_id,
    query: resolved.source.question,
    currentPage: resolved.source.currentPage,
    topK: settings.maxContextChunks,
    maxPage: resolved.source.currentPage,
  });

  const retrievedPages = passages.map((p) => p.pageNumber);
  const top1Page = retrievedPages[0] ?? null;
  const spoilerSafe = retrievedPages.every(
    (page) => page <= resolved.source.currentPage,
  );
  const preferredHitRank = pageRank(passages, resolved.source.preferredPages);
  const acceptableHitRank = pageRank(passages, resolved.source.acceptablePages);
  const forbiddenHitRank = pageRank(passages, resolved.source.forbiddenPages);
  const top1Preferred =
    resolved.source.preferredPages && top1Page !== null
      ? resolved.source.preferredPages.includes(top1Page)
      : null;
  const top1Acceptable =
    resolved.source.acceptablePages && top1Page !== null
      ? resolved.source.acceptablePages.includes(top1Page)
      : null;

  return {
    passages,
    retrievedPages,
    top1Page,
    spoilerSafe,
    preferredHitRank,
    acceptableHitRank,
    forbiddenHitRank,
    top1Preferred,
    top1Acceptable,
    nearestPreferredDistance: nearestPageDistance(
      passages,
      resolved.source.preferredPages,
    ),
  };
}

export async function runAnswerEval(
  resolved: Extract<ResolvedEvalCase, { resolution: "matched" }>,
  retrieval: RetrievalEvalResult,
  settings: Pick<
    AISettings,
    "chatModel" | "spoilerProtection"
  >,
): Promise<AnswerEvalResult> {
  const systemPrompt = buildCompanionPrompt({
    bookTitle: resolved.matchedBook.title,
    bookAuthor: resolved.matchedBook.author,
    question: resolved.source.question,
    currentPage: resolved.source.currentPage,
    passages: retrieval.passages,
    spoilerProtection: settings.spoilerProtection,
  });

  const { text } = await generateText({
    model: getChatProvider(settings.chatModel),
    system: systemPrompt,
    prompt: resolved.source.question,
  });

  const citedPages = extractCitedPages(text);
  const retrievedPageSet = new Set(retrieval.retrievedPages);
  const citedOnlyRetrievedPages =
    citedPages.length === 0
      ? false
      : citedPages.every((page) => retrievedPageSet.has(page));
  const citedSpoilerSafe = citedPages.every(
    (page) => page <= resolved.source.currentPage,
  );

  const normalized = text.toLowerCase();
  const requiredSubstringsOk =
    resolved.source.requiredAnswerSubstrings?.every((part) =>
      normalized.includes(part.toLowerCase()),
    ) ?? true;
  const forbiddenSubstringsOk =
    resolved.source.forbiddenAnswerSubstrings?.every(
      (part) => !normalized.includes(part.toLowerCase()),
    ) ?? true;

  return {
    text,
    citedPages,
    citedOnlyRetrievedPages,
    citedSpoilerSafe,
    requiredSubstringsOk,
    forbiddenSubstringsOk,
  };
}
