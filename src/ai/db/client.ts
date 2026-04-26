// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- the /vite subpath has no shipped .d.ts but exports the
// same `connect` + `Database` as the package root.
import { connect, type Database } from "@tursodatabase/database-wasm/vite";

import { runMigrations } from "./init";

const GLOBAL_KEY = "__glosseTursoDbPromise";
type GlobalSlot = { [GLOBAL_KEY]?: Promise<Database> | null };

function readSlot(): Promise<Database> | null {
  return (globalThis as GlobalSlot)[GLOBAL_KEY] ?? null;
}

function writeSlot(value: Promise<Database> | null): void {
  (globalThis as GlobalSlot)[GLOBAL_KEY] = value;
}

function isOpfsContention(err: unknown): boolean {
  return err instanceof Error && err.name === "NoModificationAllowedError";
}

async function openOnce(): Promise<Database> {
  const db = await connect("glosse-ai.db");
  // Required for ON DELETE CASCADE; SQLite default is off.
  await db.exec("PRAGMA foreign_keys = ON");
  await runMigrations(db);
  return db;
}

async function openWithRetry(): Promise<Database> {
  const MAX_TRIES = 4;
  let lastErr: unknown;
  for (let i = 0; i < MAX_TRIES; i++) {
    try {
      return await openOnce();
    } catch (err) {
      lastErr = err;
      if (!isOpfsContention(err)) throw err;
      if (i < MAX_TRIES - 1) {
        await new Promise((r) => setTimeout(r, 200 * (i + 1)));
      }
    }
  }
  throw new Error(
    "Couldn't open the local database — another browser tab has glosse open. Close other tabs (or DevTools → Application → Storage → Clear site data) and reload.",
    { cause: lastErr },
  );
}

export function getDb(): Promise<Database> {
  const existing = readSlot();
  if (existing) return existing;
  const promise = openWithRetry().catch((err) => {
    if (readSlot() === promise) writeSlot(null);
    throw err;
  });
  writeSlot(promise);
  return promise;
}

export async function closeDb(): Promise<void> {
  const existing = readSlot();
  if (!existing) return;
  writeSlot(null);
  try {
    const db = await existing;
    await db.close();
  } catch {
    // open never resolved.
  }
}

// Vite HMR respawns the turso worker; close first or the new worker
// collides with the old worker's OPFS lock.
type ViteHotImportMeta = ImportMeta & {
  hot?: { dispose: (cb: () => void) => void };
};
const hot = (import.meta as ViteHotImportMeta).hot;
if (hot) {
  hot.dispose(() => {
    void closeDb();
  });
}
