import { openDB, type IDBPDatabase } from "idb";

export type BookRecord = {
  id: string;
  title: string;
  author: string;
  addedAt: number;
  file: Blob;
  // Persisted as a Blob so it survives across sessions; object URLs are
  // created on render and revoked on unmount by the consumer.
  coverBlob?: Blob | null;
};

export type ProgressRecord = {
  bookId: string;
  cfi: string | null;
  percentage: number;
  updatedAt: number;
};

const DB_NAME = "glosse";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("books")) {
          db.createObjectStore("books", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("progress")) {
          db.createObjectStore("progress", { keyPath: "bookId" });
        }
      },
    });
  }
  return dbPromise;
}

export async function listBooks(): Promise<BookRecord[]> {
  const db = await getDb();
  const all = (await db.getAll("books")) as BookRecord[];
  return all.sort((a, b) => b.addedAt - a.addedAt);
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  const db = await getDb();
  return (await db.get("books", id)) as BookRecord | undefined;
}

export async function putBook(book: BookRecord) {
  const db = await getDb();
  await db.put("books", book);
}

export async function deleteBook(id: string) {
  const db = await getDb();
  await db.delete("books", id);
  await db.delete("progress", id);
}

export async function getProgress(id: string): Promise<ProgressRecord | undefined> {
  const db = await getDb();
  return (await db.get("progress", id)) as ProgressRecord | undefined;
}

export async function setProgress(record: ProgressRecord) {
  const db = await getDb();
  await db.put("progress", record);
}
