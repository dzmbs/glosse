import { getDb } from "../db/client";
import type { ConversationRow, MessageRow } from "../db/schema";

export type ChatRole = "user" | "assistant" | "system";

function makeId(prefix: string): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${uuid}`;
}

export async function listConversations(
  bookId: string,
): Promise<ConversationRow[]> {
  const db = await getDb();
  const rows = (await db
    .prepare(
      `SELECT * FROM conversations WHERE book_id = ? ORDER BY updated_at DESC`,
    )
    .all(bookId)) as ConversationRow[];
  return rows;
}

export async function getLatestConversation(
  bookId: string,
): Promise<ConversationRow | null> {
  const existing = await listConversations(bookId);
  return existing[0] ?? null;
}

export async function getOrCreateLatestConversation(
  bookId: string,
): Promise<ConversationRow> {
  const existing = await getLatestConversation(bookId);
  if (existing) return existing;
  return createConversation(bookId);
}

export async function createConversation(
  bookId: string,
  title = "New conversation",
): Promise<ConversationRow> {
  const db = await getDb();
  const id = makeId("conv");
  await db
    .prepare(
      `INSERT INTO conversations (id, book_id, title) VALUES (?, ?, ?)`,
    )
    .run(id, bookId, title);
  const row = (await db
    .prepare(`SELECT * FROM conversations WHERE id = ?`)
    .get(id)) as ConversationRow;
  return row;
}

export async function renameConversation(
  conversationId: string,
  title: string,
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `UPDATE conversations SET title = ?, updated_at = unixepoch() WHERE id = ?`,
    )
    .run(title, conversationId);
}

export async function deleteConversation(
  conversationId: string,
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(`DELETE FROM messages WHERE conversation_id = ?`)
    .run(conversationId);
  await db
    .prepare(`DELETE FROM conversations WHERE id = ?`)
    .run(conversationId);
}

export async function loadMessages(
  conversationId: string,
): Promise<MessageRow[]> {
  const db = await getDb();
  const rows = (await db
    .prepare(
      `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    )
    .all(conversationId)) as MessageRow[];
  return rows;
}

export async function appendMessage(
  conversationId: string,
  role: ChatRole,
  content: string,
): Promise<MessageRow> {
  const db = await getDb();
  const id = makeId("msg");
  await db
    .prepare(
      `INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)`,
    )
    .run(id, conversationId, role, content);
  await db
    .prepare(
      `UPDATE conversations SET updated_at = unixepoch() WHERE id = ?`,
    )
    .run(conversationId);
  const row = (await db
    .prepare(`SELECT * FROM messages WHERE id = ?`)
    .get(id)) as MessageRow;
  return row;
}

export async function appendTurnMessages(
  conversationId: string,
  userContent: string,
  assistantContent: string,
): Promise<{ user: MessageRow; assistant: MessageRow }> {
  const db = await getDb();
  const userId = makeId("msg");
  const assistantId = makeId("msg");

  await db.exec("BEGIN");
  try {
    await db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'user', ?)`,
      )
      .run(userId, conversationId, userContent);
    await db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'assistant', ?)`,
      )
      .run(assistantId, conversationId, assistantContent);
    await db
      .prepare(
        `UPDATE conversations SET updated_at = unixepoch() WHERE id = ?`,
      )
      .run(conversationId);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }

  const [user, assistant] = (await Promise.all([
    db.prepare(`SELECT * FROM messages WHERE id = ?`).get(userId),
    db.prepare(`SELECT * FROM messages WHERE id = ?`).get(assistantId),
  ])) as [MessageRow, MessageRow];

  return { user, assistant };
}

export async function updateMessageContent(
  messageId: string,
  content: string,
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(`UPDATE messages SET content = ? WHERE id = ?`)
    .run(content, messageId);
}

export async function deleteMessage(
  conversationId: string,
  messageId: string,
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `DELETE FROM messages WHERE id = ? AND conversation_id = ?`,
    )
    .run(messageId, conversationId);
}
