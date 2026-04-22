/**
 * String + error helpers shared across the AI layer. Kept tiny on
 * purpose — these only exist because they were copy-pasted into four or
 * more call sites. Anything that's only used once should stay local.
 */

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function errorToString(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Stable id for records that need client-side uniqueness (chat messages,
 * conversations, flashcards). Uses `crypto.randomUUID()` when available
 * and falls back to a time-prefixed random suffix — the fallback is
 * good enough for local-only records.
 */
export function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
