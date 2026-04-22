// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- the /vite subpath has no shipped .d.ts but exports the
// same `connect` + `Database` as the package root.
import { connect, type Database } from "@tursodatabase/database-wasm/vite";

import { runMigrations } from "./init";

let dbPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const db = await connect("glosse-ai.db");
    // FK enforcement is off by default in SQLite; we need it on so the
    // ON DELETE CASCADE from chunk_embeddings_<dim> → chunks(id) actually
    // fires on re-index / delete. Must be set outside any transaction,
    // so we do it before migrations run.
    await db.exec("PRAGMA foreign_keys = ON");
    await runMigrations(db);
    return db;
  })();
  return dbPromise;
}

export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.close();
  dbPromise = null;
}
