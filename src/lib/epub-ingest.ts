// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- vendored library, no types
import { makeBook } from "../../vendor/foliate-js/view.js";
import { extractAuthor, extractTitle } from "@/lib/foliate-meta";
import type { FoliateBook } from "@/lib/foliate";
import { SUPPORTED_EXT_REGEX } from "@/lib/formats";

export type BookMeta = {
  title: string;
  author: string;
  coverBlob: Blob | null;
};

export async function readBookMeta(file: File): Promise<BookMeta> {
  const book = (await makeBook(file)) as FoliateBook;

  let coverBlob: Blob | null = null;
  try {
    const blob = await book.getCover?.();
    coverBlob = blob instanceof Blob ? blob : null;
  } catch {
    coverBlob = null;
  }

  const fallbackTitle = file.name.replace(SUPPORTED_EXT_REGEX, "");
  return {
    title: extractTitle(book.metadata, fallbackTitle),
    author: extractAuthor(book.metadata),
    coverBlob,
  };
}

export const makeBookId = (): string => crypto.randomUUID();
