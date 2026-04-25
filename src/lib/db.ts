import { openDB, type IDBPDatabase } from "idb";

import {
  putBookMetadata,
  getBookMetadata,
  listBookMetadata,
  deleteBookMetadata,
  type BookMetadata,
} from "@/ai/db/books";

export type BookListEntry = BookMetadata & {
  coverBlob: Blob | null;
};

export type BookRecord = BookListEntry & {
  file: Blob;
};

export type ProgressRecord = {
  bookId: string;
  cfi: string | null;
  percentage: number;
  updatedAt: number;
};

type BookBlobRecord = {
  id: string;
  file: Blob;
  coverBlob: Blob | null;
};

const DB_NAME = "glosse";
const DB_VERSION = 2;
const BLOB_STORE = "book_blobs";
const PROGRESS_STORE = "progress";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getIdb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 2 && db.objectStoreNames.contains("books")) {
          db.deleteObjectStore("books");
        }
        if (!db.objectStoreNames.contains(BLOB_STORE)) {
          db.createObjectStore(BLOB_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
          db.createObjectStore(PROGRESS_STORE, { keyPath: "bookId" });
        }
      },
    });
  }
  return dbPromise;
}

async function getBlob(id: string): Promise<BookBlobRecord | undefined> {
  const db = await getIdb();
  return (await db.get(BLOB_STORE, id)) as BookBlobRecord | undefined;
}

async function listBlobs(): Promise<Map<string, BookBlobRecord>> {
  const db = await getIdb();
  const rows = (await db.getAll(BLOB_STORE)) as BookBlobRecord[];
  return new Map(rows.map((row) => [row.id, row]));
}

async function putBlob(record: BookBlobRecord): Promise<void> {
  const db = await getIdb();
  await db.put(BLOB_STORE, record);
}

async function deleteBlob(id: string): Promise<void> {
  const db = await getIdb();
  await db.delete(BLOB_STORE, id);
}

export async function listBooks(): Promise<BookListEntry[]> {
  const [meta, blobs] = await Promise.all([listBookMetadata(), listBlobs()]);
  return meta.map((m) => ({
    ...m,
    coverBlob: blobs.get(m.id)?.coverBlob ?? null,
  }));
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  const [meta, blob] = await Promise.all([getBookMetadata(id), getBlob(id)]);
  if (!meta || !blob) return undefined;
  return {
    ...meta,
    file: blob.file,
    coverBlob: blob.coverBlob,
  };
}

export async function putBook(book: BookRecord): Promise<void> {
  await putBlob({ id: book.id, file: book.file, coverBlob: book.coverBlob });
  try {
    await putBookMetadata({
      id: book.id,
      title: book.title,
      author: book.author,
      addedAt: book.addedAt,
    });
  } catch (err) {
    // listBooks filters on metadata, so an orphan blob is invisible.
    await deleteBlob(book.id);
    throw err;
  }
}

export async function deleteBook(id: string): Promise<void> {
  // Metadata first; an IDB-side failure leaks an invisible blob, not a broken row.
  await deleteBookMetadata(id);
  await Promise.all([deleteBlob(id), deleteProgressRow(id)]);
}

export async function getProgress(
  id: string,
): Promise<ProgressRecord | undefined> {
  const db = await getIdb();
  return (await db.get(PROGRESS_STORE, id)) as ProgressRecord | undefined;
}

export async function setProgress(record: ProgressRecord): Promise<void> {
  const db = await getIdb();
  await db.put(PROGRESS_STORE, record);
}

async function deleteProgressRow(id: string): Promise<void> {
  const db = await getIdb();
  await db.delete(PROGRESS_STORE, id);
}
