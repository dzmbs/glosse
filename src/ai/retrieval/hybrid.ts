import type {
  ReadingFocus,
  RetrievedChunk,
} from "../types";
import { getDb } from "../db/client";
import { embedQuery } from "../embedding/embedder";
import { effectivePoolMaxPage } from "./cap";
import {
  embeddingTableFor,
  embeddingToJson,
  isSupportedEmbeddingDim,
  type SupportedEmbeddingDim,
} from "../db/schema";
import {
  BookIndexUnavailableError,
  getBookIndexConfig,
} from "../indexing/bookIndex";
import { classifyReaderIntent, type ReaderIntent } from "../prompts/companion";

export type RetrievalTimings = {
  embedMs: number;
  searchMs: number;
  totalMs: number;
};

export type RetrievalOptions = {
  bookId: string;
  query: string;
  focus?: ReadingFocus;
  currentPage?: number;
  topK?: number;
  /** Only chunks with pageNumber <= maxPage are considered (spoiler filter). */
  maxPage?: number;
  /** Fires once per retrieval pass with a breakdown of where time went. */
  onTimings?: (t: RetrievalTimings) => void;
};

const DEFAULT_TOPK = 8;
const CANDIDATE_POOL = 30;
const RRF_K = 60;
const LOCAL_WINDOW_PAGES = 2;
const OVERVIEW_WINDOW_PAGES = 12;

type CandidateRow = {
  chunkId: number;
  sectionIndex: number;
  chapterTitle: string;
  text: string;
  pageNumber: number;
  rank: number;
  raw: number;
};

/**
 * Hybrid retrieval blends vector and lexical search, then nudges results
 * toward the reader's current location when the question is page-local.
 */
export async function hybridRetrieve(
  opts: RetrievalOptions,
): Promise<RetrievedChunk[]> {
  const {
    bookId,
    query,
    focus,
    currentPage,
    topK = DEFAULT_TOPK,
    maxPage,
    onTimings,
  } = opts;
  const startedAt = performance.now();
  const intent = classifyReaderIntent(query, focus);

  // Authoritative config for this book — must be used for every embedding
  // call in this retrieval pass so the question vector and the stored
  // chunk vectors live in the same space.
  const bookConfig = await getBookIndexConfig(bookId);
  if (!bookConfig) {
    throw new BookIndexUnavailableError({
      bookId,
      reason: "not-indexed",
      message: `Book ${bookId} hasn't been indexed yet. Index it before asking questions.`,
    });
  }
  const embedding = bookConfig.embedding;
  if (!isSupportedEmbeddingDim(embedding.dimensions)) {
    throw new BookIndexUnavailableError({
      bookId,
      reason: "missing-metadata",
      message: `Book ${bookId} was indexed at ${embedding.dimensions}d, which has no typed storage. Re-index with a supported model (768, 1024, 1536, or 3072).`,
      requiredProvider: embedding.provider,
      requiredModel: embedding.model,
    });
  }
  const embeddingTable = embeddingTableFor(
    embedding.dimensions as SupportedEmbeddingDim,
  );

  let qvec: Float32Array;
  const embedStartedAt = performance.now();
  let embedDurationMs = 0;
  try {
    qvec = await embedQuery(embedding, query);
    embedDurationMs = performance.now() - embedStartedAt;
  } catch (err) {
    throw new BookIndexUnavailableError({
      bookId,
      reason: "provider-unavailable",
      message:
        embedding.provider === "ollama"
          ? `This book was indexed with Ollama (${embedding.model}). Start Ollama or re-index with your current default.`
          : `This book was indexed with OpenAI (${embedding.model}). Add the OpenAI key or re-index with your current default.`,
      requiredProvider: embedding.provider,
      requiredModel: embedding.model,
      cause: err,
    });
  }
  // Hard spoiler cap every secondary pool must honor — without this the
  // local/focus/overview queries would leak past `maxPage` up to the
  // reader's current page.
  const poolMaxPage = effectivePoolMaxPage(maxPage, currentPage);

  const pools: Array<Promise<{ rows: CandidateRow[]; weight: number }>> = [
    vectorSearch(bookId, embeddingTable, qvec, CANDIDATE_POOL, { maxPage }).then(
      (rows) => ({ rows, weight: 1.0 }),
    ),
    ftsSearch(bookId, query, CANDIDATE_POOL, { maxPage }).then((rows) => ({
      rows,
      weight: 0.8,
    })),
  ];

  if (currentPage !== undefined) {
    const minLocalPage = Math.max(1, currentPage - LOCAL_WINDOW_PAGES);
    const localWeight = intent === "local" ? 1.25 : 0.45;
    pools.push(
      vectorSearch(bookId, embeddingTable, qvec, CANDIDATE_POOL, {
        minPage: minLocalPage,
        maxPage: poolMaxPage,
      }).then((rows) => ({
        rows,
        weight: localWeight,
      })),
    );
    pools.push(
      ftsSearch(bookId, query, CANDIDATE_POOL, {
        minPage: minLocalPage,
        maxPage: poolMaxPage,
      }).then((rows) => ({
        rows,
        weight: intent === "local" ? 1.1 : 0.35,
      })),
    );

    if (intent === "overview") {
      const overviewCap = poolMaxPage ?? currentPage;
      const overviewMaxPage = Math.min(overviewCap, OVERVIEW_WINDOW_PAGES);
      pools.push(
        vectorSearch(bookId, embeddingTable, qvec, CANDIDATE_POOL, {
          minPage: 1,
          maxPage: overviewMaxPage,
        }).then((rows) => ({
          rows,
          weight: 1.0,
        })),
      );
      pools.push(
        ftsSearch(bookId, query, CANDIDATE_POOL, {
          minPage: 1,
          maxPage: overviewMaxPage,
        }).then((rows) => ({
          rows,
          weight: 0.9,
        })),
      );
    }

    if (focus?.selectedText) {
      const focusText = focus.selectedText.slice(0, 320);
      let focusVec: Float32Array;
      try {
        focusVec = await embedQuery(embedding, focusText);
      } catch (err) {
        throw new BookIndexUnavailableError({
          bookId,
          reason: "provider-unavailable",
          message:
            embedding.provider === "ollama"
              ? `This book was indexed with Ollama (${embedding.model}). Start Ollama or re-index with your current default.`
              : `This book was indexed with OpenAI (${embedding.model}). Add the OpenAI key or re-index with your current default.`,
          requiredProvider: embedding.provider,
          requiredModel: embedding.model,
          cause: err,
        });
      }
      pools.push(
        vectorSearch(bookId, embeddingTable, focusVec, CANDIDATE_POOL, {
          minPage: minLocalPage,
          maxPage: poolMaxPage,
        }).then((rows) => ({
          rows,
          weight: 1.3,
        })),
      );
      pools.push(
        ftsSearch(bookId, focusText, CANDIDATE_POOL, {
          minPage: minLocalPage,
          maxPage: poolMaxPage,
        }).then((rows) => ({
          rows,
          weight: 1.1,
        })),
      );
    }
  }

  const searchStartedAt = performance.now();
  const resolvedPools = await Promise.all(pools);
  const fused = rrfFuse(resolvedPools, { currentPage, intent }).slice(0, topK);
  const finishedAt = performance.now();
  onTimings?.({
    embedMs: Math.round(embedDurationMs),
    searchMs: Math.round(finishedAt - searchStartedAt),
    totalMs: Math.round(finishedAt - startedAt),
  });
  return fused;
}

async function vectorSearch(
  bookId: string,
  embeddingTable: string,
  qvec: Float32Array,
  k: number,
  pageRange?: { minPage?: number; maxPage?: number },
): Promise<CandidateRow[]> {
  const db = await getDb();
  const qjson = embeddingToJson(qvec);
  const pageFilter = buildPageFilter(pageRange, "c.");
  const sql = `
    SELECT c.id AS id, c.section_index AS section_index,
           c.chapter_title AS chapter_title, c.text AS text,
           c.page_number AS page_number,
           vector_distance_cos(e.embedding, vector32(?)) AS dist
    FROM chunks c
    JOIN ${embeddingTable} e ON e.chunk_id = c.id
    WHERE c.book_id = ?${pageFilter}
    ORDER BY dist ASC
    LIMIT ${k}
  `;

  const args = withPageArgs([qjson, bookId], pageRange);

  const rows = (await db.prepare(sql).all(...args)) as Array<{
    id: number;
    section_index: number;
    chapter_title: string | null;
    text: string;
    page_number: number;
    dist: number;
  }>;

  return rows.map((r, i) => ({
    chunkId: r.id,
    sectionIndex: r.section_index,
    chapterTitle: r.chapter_title ?? "",
    text: r.text,
    pageNumber: r.page_number,
    rank: i + 1,
    raw: r.dist,
  }));
}

async function ftsSearch(
  bookId: string,
  query: string,
  k: number,
  pageRange?: { minPage?: number; maxPage?: number },
): Promise<CandidateRow[]> {
  const cleaned = sanitizeFtsQuery(query);
  if (!cleaned) return [];

  const db = await getDb();
  const pageFilter = buildPageFilter(pageRange);
  const sql = `
    SELECT id, section_index, chapter_title, text, page_number,
           fts_score(text, chapter_title, ?) AS rank_score
    FROM chunks
    WHERE book_id = ?${pageFilter}
      AND fts_match(text, chapter_title, ?)
    ORDER BY rank_score DESC
    LIMIT ${k}
  `;

  const args = withPageArgs([cleaned, bookId], pageRange);
  args.push(cleaned);

  try {
    const rows = (await db.prepare(sql).all(...args)) as Array<{
      id: number;
      section_index: number;
      chapter_title: string | null;
      text: string;
      page_number: number;
      rank_score: number;
    }>;
    return rows.map((r, i) => ({
      chunkId: r.id,
      sectionIndex: r.section_index,
      chapterTitle: r.chapter_title ?? "",
      text: r.text,
      pageNumber: r.page_number,
      rank: i + 1,
      raw: r.rank_score,
    }));
  } catch {
    // Missing native FTS support or malformed search syntax should not
    // prevent vector retrieval from working.
    return [];
  }
}

/** Turso's native FTS accepts plain query strings, but we still strip noisy
 * punctuation and drop very short fragments to keep lexical queries stable. */
function sanitizeFtsQuery(q: string): string {
  const trimmed = q.trim();
  if (!trimmed) return "";
  const tokens = trimmed
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return "";
  return tokens.join(" ");
}

function buildPageFilter(
  pageRange?: { minPage?: number; maxPage?: number },
  columnPrefix = "",
): string {
  let sql = "";
  if (pageRange?.minPage !== undefined)
    sql += ` AND ${columnPrefix}page_number >= ?`;
  if (pageRange?.maxPage !== undefined)
    sql += ` AND ${columnPrefix}page_number <= ?`;
  return sql;
}

function withPageArgs(
  base: (string | number)[],
  pageRange?: { minPage?: number; maxPage?: number },
): (string | number)[] {
  const args = [...base];
  if (pageRange?.minPage !== undefined) args.push(pageRange.minPage);
  if (pageRange?.maxPage !== undefined) args.push(pageRange.maxPage);
  return args;
}

function rrfFuse(
  pools: Array<{ rows: CandidateRow[]; weight: number }>,
  context: { currentPage?: number; intent: ReaderIntent },
): RetrievedChunk[] {
  const scores = new Map<
    number,
    RetrievedChunk & { _score: number; _bestRank: number; _hits: number }
  >();

  const add = (rows: CandidateRow[], weight: number) => {
    for (const row of rows) {
      const contribution = weight / (RRF_K + row.rank);
      const existing = scores.get(row.chunkId);
      if (existing) {
        existing._score += contribution;
        existing._bestRank = Math.min(existing._bestRank, row.rank);
        existing._hits += 1;
      } else {
        scores.set(row.chunkId, {
          chunkId: row.chunkId,
          sectionIndex: row.sectionIndex,
          chapterTitle: row.chapterTitle,
          text: row.text,
          pageNumber: row.pageNumber,
          score: 0,
          _score: contribution,
          _bestRank: row.rank,
          _hits: 1,
        });
      }
    }
  };

  for (const pool of pools) {
    add(pool.rows, pool.weight);
  }

  return [...scores.values()]
    .map(({ _score, _bestRank, _hits, ...rest }) => ({
      ...rest,
      score: _score + pageIntentBoost(rest.pageNumber, _bestRank, _hits, context),
    }))
    .sort((a, b) => b.score - a.score);
}

function pageIntentBoost(
  pageNumber: number,
  bestRank: number,
  hitCount: number,
  context: { currentPage?: number; intent: ReaderIntent },
): number {
  const { currentPage, intent } = context;
  if (currentPage === undefined) return 0;

  const distance = Math.abs(currentPage - pageNumber);
  const supportScale =
    bestRank <= 3 ? 1 : hitCount >= 2 ? 0.8 : bestRank <= 8 ? 0.45 : 0;

  if (supportScale === 0) return 0;

  if (intent === "local") {
    if (distance === 0) return 0.045 * supportScale;
    if (distance === 1) return 0.03 * supportScale;
    if (distance === 2) return 0.018 * supportScale;
    return Math.max(0, 0.01 - distance * 0.0012) * supportScale;
  }

  if (intent === "overview") {
    if (pageNumber <= 3) return 0.025 * supportScale;
    if (pageNumber <= OVERVIEW_WINDOW_PAGES) return 0.012 * supportScale;
    return 0;
  }

  if (distance === 0) return 0.012 * supportScale;
  if (distance === 1) return 0.007 * supportScale;
  if (distance === 2) return 0.004 * supportScale;
  return 0;
}
