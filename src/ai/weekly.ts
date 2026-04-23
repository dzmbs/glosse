import { generateText } from "ai";

import { getDb } from "./db/client";
import { getChatProvider } from "./providers/registry";
import { useAISettings } from "./providers/settings";
import { getProfile } from "./profile";

export type WeeklyReview = {
  windowStart: number;
  windowEnd: number;
  reflection: string;
  suggestions: Array<{ cardId: string; reason: string }>;
};

const WEEK_SECONDS = 7 * 24 * 60 * 60;

type EventRow = {
  book_id: string;
  kind: string;
  page_number: number | null;
  section_index: number | null;
  occurred_at: number;
};

type LapsedRow = {
  id: string;
  book_id: string;
  front: string;
  back: string;
  lapses: number;
  last_reviewed_at: number | null;
};

type BookMetaRow = { book_id: string; title: string; author: string };

/**
 * Pull the last 7 days of reading activity + recently-lapsed cards and
 * produce a short reflection + 3 suggested re-reviews. Intended to be
 * called on app open on a quiet schedule (Sunday morning) — not an
 * actual cron because we're local-first.
 */
export async function generateWeeklyReview(): Promise<WeeklyReview> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - WEEK_SECONDS;

  const [events, lapsed, bookMeta, profile] = await Promise.all([
    db
      .prepare(
        `SELECT book_id, kind, page_number, section_index, occurred_at
         FROM reading_events
         WHERE occurred_at >= ?
         ORDER BY occurred_at ASC`,
      )
      .all(windowStart) as Promise<EventRow[]>,
    // "Recently lapsed" = reviewed within window AND has lapses > 0.
    // We expose the whole card so the model can read the prompt when
    // writing its reflection.
    db
      .prepare(
        `SELECT id, book_id, front, back, lapses, last_reviewed_at
         FROM review_cards
         WHERE last_reviewed_at IS NOT NULL
           AND last_reviewed_at >= ?
           AND lapses > 0
         ORDER BY last_reviewed_at DESC
         LIMIT 12`,
      )
      .all(windowStart) as Promise<LapsedRow[]>,
    db
      .prepare(`SELECT book_id, title, author FROM book_index`)
      .all() as Promise<BookMetaRow[]>,
    getProfile(),
  ]);

  const bookLookup = new Map(bookMeta.map((b) => [b.book_id, b]));
  const byBook = new Map<string, EventRow[]>();
  for (const e of events) {
    const list = byBook.get(e.book_id) ?? [];
    list.push(e);
    byBook.set(e.book_id, list);
  }

  // If the week was empty, short-circuit rather than burning a model call.
  if (events.length === 0 && lapsed.length === 0) {
    return {
      windowStart,
      windowEnd: now,
      reflection: "Nothing logged this week. Pick a book back up when you can — even 20 minutes will stack up.",
      suggestions: [],
    };
  }

  const activity = [...byBook.entries()]
    .map(([bookId, rows]) => {
      const meta = bookLookup.get(bookId);
      const lastPage = rows
        .map((r) => r.page_number ?? 0)
        .reduce((a, b) => Math.max(a, b), 0);
      return `- ${meta?.title ?? "(unknown book)"}${meta?.author ? ` by ${meta.author}` : ""}: ${rows.length} events, reached p. ${lastPage}`;
    })
    .join("\n");

  const lapsedLines = lapsed
    .slice(0, 8)
    .map(
      (c) =>
        `- (${bookLookup.get(c.book_id)?.title ?? "?"}) "${truncate(c.front, 110)}"`,
    )
    .join("\n");

  const settings = useAISettings.getState();
  const { text } = await generateText({
    model: getChatProvider(settings.chatModel),
    system: `You write a gentle 120-180 word weekly reflection for a reader.
Rules:
- Ground everything in the data provided. Don't invent books or facts.
- Acknowledge what they read, note any patterns, and close on a useful next step.
- Tone matches the reader profile. Be concise and human.
- No bullet points, no headers. Plain prose.`,
    prompt: `Reader profile — tone: ${profile.tone}, answer style: ${profile.answerStyle}.

WEEKLY ACTIVITY (last 7 days):
${activity || "(no reading events recorded)"}

RECENTLY LAPSED CARDS (got "again" or "hard" this week):
${lapsedLines || "(none)"}

Write the reflection now.`,
  });

  // Heuristic suggestions: top 3 most-lapsed cards.
  const suggestions = lapsed
    .slice(0, 3)
    .map((c) => ({
      cardId: c.id,
      reason: `${c.lapses} lapse${c.lapses === 1 ? "" : "s"} this week`,
    }));

  return {
    windowStart,
    windowEnd: now,
    reflection: text.trim(),
    suggestions,
  };
}

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}
