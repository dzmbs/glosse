import { generateObject } from "ai";
import { z } from "zod";

import { getDb } from "../db/client";
import { getChatProvider } from "../providers/registry";
import { useAISettings } from "../providers/settings";
import { truncate } from "../utils/str";

export type MindMapNode = {
  label: string;
  children?: MindMapNode[];
};

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

const NodeSchema: z.ZodType<MindMapNode> = z.lazy(() =>
  z.object({
    label: z.string().min(2).max(48),
    children: z.array(NodeSchema).max(4).optional(),
  }),
);

const MindMapSchema = z.object({
  title: z.string().min(2).max(120),
  branches: z
    .array(
      z.object({
        chapterTitle: z.string().min(1).max(120),
        sectionIndex: z.number().int().min(0),
        nodes: z.array(NodeSchema).min(1).max(6),
      }),
    )
    .min(1)
    .max(20),
});

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

  const settings = useAISettings.getState();
  const system = `You are drafting a concept map for the portion of "${input.bookTitle}"${
    input.bookAuthor ? ` by ${input.bookAuthor}` : ""
  } that the reader has reached (pages 1–${input.maxPage}).

For each chapter listed below, produce:
- Its chapterTitle (verbatim from the list)
- Its sectionIndex (verbatim)
- 3-6 top-level nodes: the key concepts, arguments, or terms introduced in that chapter
- Optional 2-4 children per node for specific sub-concepts (skip children when the node is already atomic)

Rules:
- Node labels are 1-4 words, concrete. Prefer named concepts and proper nouns over vague themes.
- Ground every node in the excerpts provided. Don't invent content.
- Don't repeat the chapter title as a top-level node.
- No full sentences, no punctuation, no leading articles ("The", "A").
- Never use ellipsis.`;

  const excerpts = sections
    .map(
      (s) =>
        `### Section ${s.sectionIndex} — ${s.chapterTitle || "(untitled)"}\n${s.excerpt}`,
    )
    .join("\n\n");

  const { object } = await generateObject({
    model: getChatProvider(settings.chatModel),
    schema: MindMapSchema,
    system,
    prompt: `Chapters available (sectionIndex :: chapterTitle):
${sections.map((s) => `${s.sectionIndex} :: ${s.chapterTitle || "(untitled)"}`).join("\n")}

<EXCERPTS>
${excerpts}
</EXCERPTS>

Return the concept map as specified. The "title" field should be the book title exactly: "${input.bookTitle}".`,
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

