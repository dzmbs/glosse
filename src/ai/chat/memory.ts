import { generateText } from "ai";

import { getDb } from "../db/client";
import type { ConversationSummaryRow, MessageRow } from "../db/schema";
import { getChatProvider } from "../providers/registry";
import type { ChatModelConfig } from "../types";
import { loadMessages } from "./conversations";

const SUMMARY_TRIGGER_MESSAGES = 8;

type StoredConversationSummary = {
  summary: string;
};

export async function getConversationSummary(
  conversationId: string,
): Promise<string | null> {
  const db = await getDb();
  const row = (await db
    .prepare(
      `SELECT * FROM conversation_summaries WHERE conversation_id = ?`,
    )
    .get(conversationId)) as ConversationSummaryRow | undefined;

  return row ? readSummary(row) : null;
}

export async function refreshConversationSummary(
  conversationId: string,
  chatModel: ChatModelConfig,
): Promise<string | null> {
  const db = await getDb();
  const existing = (await db
    .prepare(
      `SELECT * FROM conversation_summaries WHERE conversation_id = ?`,
    )
    .get(conversationId)) as ConversationSummaryRow | undefined;
  const messages = await loadMessages(conversationId);
  const unsummarized = messages.slice(existing?.turns_summarized ?? 0);

  if (unsummarized.length < SUMMARY_TRIGGER_MESSAGES) {
    return existing ? readSummary(existing) : null;
  }

  const nextSummary = await summarizeConversation(
    existing ? readSummary(existing) : null,
    unsummarized,
    chatModel,
  );

  await db
    .prepare(
      `INSERT INTO conversation_summaries (
         conversation_id,
         summary_json,
         turns_summarized,
         updated_at
       ) VALUES (?, ?, ?, unixepoch())
       ON CONFLICT(conversation_id) DO UPDATE SET
         summary_json = excluded.summary_json,
         turns_summarized = excluded.turns_summarized,
         updated_at = excluded.updated_at`,
    )
    .run(
      conversationId,
      JSON.stringify({ summary: nextSummary }),
      messages.length,
    );

  return nextSummary;
}

function readSummary(row: ConversationSummaryRow): string | null {
  try {
    const parsed = JSON.parse(row.summary_json) as StoredConversationSummary;
    return typeof parsed.summary === "string" ? parsed.summary : null;
  } catch {
    return null;
  }
}

async function summarizeConversation(
  previousSummary: string | null,
  messages: MessageRow[],
  chatModel: ChatModelConfig,
): Promise<string> {
  const transcript = messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");

  const priorBlock = previousSummary
    ? `Existing summary:\n${previousSummary}\n\n`
    : "";

  const { text } = await generateText({
    model: getChatProvider(chatModel),
    system: `Write a compact conversation memory for a reading companion.
Keep only durable context that helps future answers:
- the reader's active questions or confusions
- useful facts already explained from the book
- preferences or corrections the reader gave
- unresolved follow-ups worth remembering

Do not mention UI details, greetings, or filler.
Keep it under 140 words.`,
    prompt: `${priorBlock}New messages:
${transcript}

Update the memory now.`,
  });

  return text.trim();
}
