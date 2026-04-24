import { getDb } from "../db/client";
import { generateStructuredChat } from "../providers/generate";
import { truncate } from "../utils/str";
import {
  MindMapSchema,
  buildMindMapSystemPrompt,
  buildMindMapUserPrompt,
  type MindMapNode,
} from "../prompts/study";

export type { MindMapNode };

export type MindMap = {
  bookId: string;
  title: string;
  branches: Array<{
    chapterTitle: string;
    sectionIndex: number;
    nodes: MindMapNode[];
  }>;
  maxPage: number;
  updatedAt: number;
};

type StoredMap = {
  book_id: string;
  data_json: string;
  max_page: number;
  updated_at: number;
};

export async function getMindMap(bookId: string): Promise<MindMap | null> {
  const db = await getDb();
  const row = (await db
    .prepare(`SELECT * FROM mind_maps WHERE book_id = ?`)
    .get(bookId)) as StoredMap | undefined;
  if (!row) return null;
  try {
    const data = JSON.parse(row.data_json) as {
      title: string;
      branches: MindMap["branches"];
    };
    return {
      bookId: row.book_id,
      title: data.title,
      branches: data.branches,
      maxPage: row.max_page,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

export async function deleteMindMap(bookId: string): Promise<void> {
  const db = await getDb();
  await db.prepare(`DELETE FROM mind_maps WHERE book_id = ?`).run(bookId);
}

/**
 * Build a concept hierarchy for the book — one branch per chapter the
 * reader has reached, with 3-6 top-level nodes per chapter plus optional
 * sub-nodes. Cheap enough to regenerate when the reader advances a lot.
 */
export async function generateMindMap(input: {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  maxPage: number;
}): Promise<MindMap> {
  const sections = await fetchReadableSections(input.bookId, input.maxPage);
  if (sections.length === 0) {
    throw new Error(
      "No chapters reached yet — keep reading and try again once you've turned a few pages.",
    );
  }

  const system = buildMindMapSystemPrompt({
    bookTitle: input.bookTitle,
    bookAuthor: input.bookAuthor,
    maxPage: input.maxPage,
  });
  const prompt = buildMindMapUserPrompt({
    bookTitle: input.bookTitle,
    sections,
  });

  const { object } = await generateStructuredChat("mindmap", {
    schema: MindMapSchema,
    system,
    prompt,
  });

  const map: MindMap = {
    bookId: input.bookId,
    title: object.title,
    branches: object.branches,
    maxPage: input.maxPage,
    updatedAt: Math.floor(Date.now() / 1000),
  };

  const db = await getDb();
  await db
    .prepare(
      `INSERT INTO mind_maps (book_id, data_json, max_page)
       VALUES (?, ?, ?)
       ON CONFLICT(book_id) DO UPDATE SET
         data_json = excluded.data_json,
         max_page = excluded.max_page,
         updated_at = unixepoch()`,
    )
    .run(
      input.bookId,
      JSON.stringify({ title: map.title, branches: map.branches }),
      input.maxPage,
    );

  return map;
}

/**
 * For each section the reader has fully reached (every chunk ≤ maxPage),
 * pull the first chunk and a middle one to keep the prompt compact.
 */
async function fetchReadableSections(
  bookId: string,
  maxPage: number,
): Promise<Array<{ sectionIndex: number; chapterTitle: string; excerpt: string }>> {
  const db = await getDb();
  const sectionRows = (await db
    .prepare(
      `SELECT c.section_index AS section_index, MAX(c.chapter_title) AS chapter_title
       FROM chunks c
       WHERE c.book_id = ?
       GROUP BY c.section_index
       HAVING MAX(c.page_number) <= ?
       ORDER BY c.section_index ASC`,
    )
    .all(bookId, maxPage)) as Array<{
    section_index: number;
    chapter_title: string | null;
  }>;

  if (sectionRows.length === 0) return [];

  // Cap how many sections we feed the model — very long books blow context.
  const capped = sectionRows.slice(0, 16);

  const out: Array<{
    sectionIndex: number;
    chapterTitle: string;
    excerpt: string;
  }> = [];
  for (const s of capped) {
    const chunks = (await db
      .prepare(
        `SELECT text, page_number FROM chunks
         WHERE book_id = ? AND section_index = ?
         ORDER BY id ASC LIMIT ?`,
      )
      .all(bookId, s.section_index, 6)) as Array<{
      text: string;
      page_number: number;
    }>;
    if (chunks.length === 0) continue;
    // Head + middle chunk keeps the prompt tight.
    const head = chunks[0]!.text;
    const mid = chunks[Math.floor(chunks.length / 2)]?.text;
    const excerpt = mid && mid !== head ? `${head}\n\n---\n\n${mid}` : head;
    out.push({
      sectionIndex: s.section_index,
      chapterTitle: (s.chapter_title ?? "").trim(),
      excerpt: truncate(excerpt, 1400),
    });
  }
  return out;
}

