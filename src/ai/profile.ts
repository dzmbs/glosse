import { getDb } from "./db/client";
import type { ReaderProfileRow } from "./db/schema";
import type { ReaderProfileSnippet } from "./prompts/companion";

/**
 * Single-row table. We always read/write id = 1. If the migrations added
 * the row already (runMigrations does `INSERT OR IGNORE INTO reader_profile
 * (id) VALUES (1)`), `getProfile` will always return a row.
 */

export type ReaderProfile = {
  preferredQuizStyle: string;
  answerStyle: string;
  weakConcepts: string[];
  interests: string[];
  tone: string;
  updatedAt: number;
};

const DEFAULT: ReaderProfile = {
  preferredQuizStyle: "socratic",
  answerStyle: "balanced",
  weakConcepts: [],
  interests: [],
  tone: "warm",
  updatedAt: 0,
};

export async function getProfile(): Promise<ReaderProfile> {
  const db = await getDb();
  const row = (await db
    .prepare(`SELECT * FROM reader_profile WHERE id = 1`)
    .get()) as ReaderProfileRow | undefined;
  if (!row) return DEFAULT;
  return rowToProfile(row);
}

export type ProfilePatch = Partial<Omit<ReaderProfile, "updatedAt">>;

export async function updateProfile(patch: ProfilePatch): Promise<ReaderProfile> {
  const db = await getDb();
  const current = await getProfile();
  const next: ReaderProfile = {
    ...current,
    ...patch,
    updatedAt: Math.floor(Date.now() / 1000),
  };
  await db
    .prepare(
      `UPDATE reader_profile
       SET preferred_quiz_style = ?,
           answer_style = ?,
           weak_concepts = ?,
           interests = ?,
           tone = ?,
           updated_at = unixepoch()
       WHERE id = 1`,
    )
    .run(
      next.preferredQuizStyle,
      next.answerStyle,
      JSON.stringify(next.weakConcepts),
      JSON.stringify(next.interests),
      next.tone,
    );
  return next;
}

/** Convert to the shape the companion prompt consumes. Returns undefined
 *  if the profile is fully empty so the prompt block is skipped. */
export function profileToSnippet(
  profile: ReaderProfile,
): ReaderProfileSnippet | undefined {
  const hasAny =
    profile.tone ||
    profile.answerStyle ||
    profile.preferredQuizStyle ||
    profile.weakConcepts.length > 0 ||
    profile.interests.length > 0;
  if (!hasAny) return undefined;
  return {
    tone: profile.tone || undefined,
    answerStyle: profile.answerStyle || undefined,
    preferredQuizStyle: profile.preferredQuizStyle || undefined,
    weakConcepts:
      profile.weakConcepts.length > 0 ? profile.weakConcepts : undefined,
    interests: profile.interests.length > 0 ? profile.interests : undefined,
  };
}

function rowToProfile(row: ReaderProfileRow): ReaderProfile {
  return {
    preferredQuizStyle: row.preferred_quiz_style ?? DEFAULT.preferredQuizStyle,
    answerStyle: row.answer_style ?? DEFAULT.answerStyle,
    weakConcepts: parseStringList(row.weak_concepts),
    interests: parseStringList(row.interests),
    tone: row.tone ?? DEFAULT.tone,
    updatedAt: row.updated_at ?? 0,
  };
}

function parseStringList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed))
      return parsed.filter((x) => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}
