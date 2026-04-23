import { generateText } from "ai";

import { getDb } from "./db/client";
import { getChatProvider } from "./providers/registry";
import { useAISettings } from "./providers/settings";

export type ChapterSummary = {
  bookId: string;
  sectionIndex: number;
  chapterTitle: string;
  summary: string;
  updatedAt: number;
};

type SummaryRow = {
  book_id: string;
  section_index: number;
  chapter_title: string;
  summary: string;
  updated_at: number;
};

function rowToSummary(row: SummaryRow): ChapterSummary {
  return {
    bookId: row.book_id,
    sectionIndex: row.section_index,
    chapterTitle: row.chapter_title ?? "",
    summary: row.summary,
    updatedAt: row.updated_at,
  };
}

export async function getChapterSummary(
  bookId: string,
  sectionIndex: number,
): Promise<ChapterSummary | null> {
  const db = await getDb();
  const row = (await db
    .prepare(
      `SELECT * FROM chapter_summaries WHERE book_id = ? AND section_index = ?`,
    )
    .get(bookId, sectionIndex)) as SummaryRow | undefined;
  return row ? rowToSummary(row) : null;
}

export async function listChapterSummaries(
  bookId: string,
  maxPage?: number,
): Promise<ChapterSummary[]> {
  const db = await getDb();
  if (maxPage === undefined) {
    const rows = (await db
      .prepare(
        `SELECT * FROM chapter_summaries WHERE book_id = ? ORDER BY section_index ASC`,
      )
      .all(bookId)) as SummaryRow[];
    return rows.map(rowToSummary);
  }
  // Include a chapter only if every chunk of that section is at or before
  // the current reading page — otherwise we'd risk summarizing passages
  // the reader hasn't reached yet.
  const rows = (await db
    .prepare(
      `SELECT s.* FROM chapter_summaries s
       WHERE s.book_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM chunks c
           WHERE c.book_id = s.book_id
             AND c.section_index = s.section_index
             AND c.page_number > ?
         )
       ORDER BY s.section_index ASC`,
    )
    .all(bookId, maxPage)) as SummaryRow[];
  return rows.map(rowToSummary);
}

export async function generateChapterSummary(input: {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  sectionIndex: number;
  /** Optional — if omitted, we look it up from the chunks table. */
  chapterTitle?: string;
  /** Max page the reader has reached; defaults to no limit. */
  maxPage?: number;
  /** If a summary already exists, return it unless `force` is true. */
  force?: boolean;
}): Promise<ChapterSummary | null> {
  if (!input.force) {
    const existing = await getChapterSummary(input.bookId, input.sectionIndex);
    if (existing) return existing;
  }

  const db = await getDb();
  const chunkRows = input.maxPage !== undefined
    ? ((await db
        .prepare(
          `SELECT text, chapter_title, page_number FROM chunks
           WHERE book_id = ? AND section_index = ? AND page_number <= ?
           ORDER BY id ASC`,
        )
        .all(input.bookId, input.sectionIndex, input.maxPage)) as Array<{
        text: string;
        chapter_title: string | null;
        page_number: number;
      }>)
    : ((await db
        .prepare(
          `SELECT text, chapter_title, page_number FROM chunks
           WHERE book_id = ? AND section_index = ?
           ORDER BY id ASC`,
        )
        .all(input.bookId, input.sectionIndex)) as Array<{
        text: string;
        chapter_title: string | null;
        page_number: number;
      }>);

  if (chunkRows.length === 0) return null;

  const chapterTitle =
    input.chapterTitle ??
    chunkRows.find((r) => r.chapter_title)?.chapter_title ??
    `Section ${input.sectionIndex + 1}`;

  // Keep the prompt tight — for long chapters we sample the beginning,
  // a middle slice, and the end. Enough for a structural summary without
  // blowing the cheapest model's context.
  const text = sampleForSummary(chunkRows.map((r) => r.text));

  const settings = useAISettings.getState();
  const { text: summary } = await generateText({
    model: getChatProvider(settings.chatModel),
    system: `You summarize book chapters for a reader who will revisit them later.
Write a compressed but structural 120-180 word summary of the chapter below.
Rules:
- Ground every claim in the excerpts. Don't invent plot or analysis.
- Preserve key characters, arguments, or technical concepts by their real names.
- Do NOT spoil content beyond the excerpts.
- Plain prose. No bullet points. No meta-commentary.`,
    prompt: `Book: "${input.bookTitle}"${input.bookAuthor ? ` by ${input.bookAuthor}` : ""}
Chapter: "${chapterTitle}"

<EXCERPTS>
${text}
</EXCERPTS>`,
  });

  const trimmed = summary.trim();

  await db
    .prepare(
      `INSERT INTO chapter_summaries (book_id, section_index, chapter_title, summary)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(book_id, section_index) DO UPDATE SET
         chapter_title = excluded.chapter_title,
         summary = excluded.summary,
         updated_at = unixepoch()`,
    )
    .run(input.bookId, input.sectionIndex, chapterTitle, trimmed);

  const now = Math.floor(Date.now() / 1000);
  return {
    bookId: input.bookId,
    sectionIndex: input.sectionIndex,
    chapterTitle,
    summary: trimmed,
    updatedAt: now,
  };
}

/**
 * Batch-generate summaries for every section where the reader has read
 * every chunk. Useful for priming "what did I read?" overview queries.
 * Skips sections that already have a summary.
 */
export async function ensureSummariesUpToPage(input: {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  maxPage: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<ChapterSummary[]> {
  const db = await getDb();
  // Sections whose last chunk is <= maxPage AND which don't yet have a summary.
  const rows = (await db
    .prepare(
      `SELECT c.section_index AS section_index, MAX(c.chapter_title) AS chapter_title
       FROM chunks c
       WHERE c.book_id = ?
       GROUP BY c.section_index
       HAVING MAX(c.page_number) <= ?
         AND c.section_index NOT IN (
           SELECT section_index FROM chapter_summaries WHERE book_id = ?
         )
       ORDER BY c.section_index ASC`,
    )
    .all(input.bookId, input.maxPage, input.bookId)) as Array<{
    section_index: number;
    chapter_title: string | null;
  }>;

  const out: ChapterSummary[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    input.onProgress?.(i, rows.length);
    const summary = await generateChapterSummary({
      bookId: input.bookId,
      bookTitle: input.bookTitle,
      bookAuthor: input.bookAuthor,
      sectionIndex: r.section_index,
      chapterTitle: r.chapter_title ?? undefined,
    });
    if (summary) out.push(summary);
  }
  input.onProgress?.(rows.length, rows.length);
  return out;
}

function sampleForSummary(texts: string[]): string {
  if (texts.length <= 6) return texts.join("\n\n");
  const head = texts.slice(0, 2);
  const mid = texts.slice(
    Math.floor(texts.length / 2) - 1,
    Math.floor(texts.length / 2) + 2,
  );
  const tail = texts.slice(-2);
  return [...head, ...mid, ...tail].join("\n\n");
}
