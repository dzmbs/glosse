import type { ChunkInput } from "../types";

// foliate-js uses 1500 chars per "page" in its SectionProgress class. We
// mirror that so our pageNumber lines up with the reader's displayed page.
const CHARS_PER_PAGE = 1500;

// Chunk-size targets in characters (rough proxy for tokens: ~4 chars/token).
// 700 tokens ≈ 2800 chars. Overlap of 80 tokens ≈ 320 chars.
const TARGET_CHARS = 2800;
const OVERLAP_CHARS = 320;
const MIN_CHARS = 400;

export type BookSource = {
  bookId: string;
  sections: SectionSource[];
};

export type SectionSource = {
  sectionIndex: number;
  chapterTitle: string;
  /** Flat text of the section — caller strips HTML etc. */
  text: string;
};

/**
 * Split a book into chunks suitable for embedding + retrieval.
 *
 * - Splits each section independently so chapter boundaries are respected.
 * - Aims for ~TARGET_CHARS per chunk with OVERLAP_CHARS overlap.
 * - Prefers to break on paragraph (`\n\n`), sentence (`. `), or whitespace
 *   — never mid-word.
 * - Merges trailing fragments shorter than MIN_CHARS into the previous chunk.
 * - Page numbers are derived from cumulative character offset across the
 *   whole book so they match the reader's progress counter.
 */
export function chunkBook(book: BookSource): ChunkInput[] {
  const out: ChunkInput[] = [];
  let charOffset = 0;

  for (const section of book.sections) {
    const text = section.text.trim();
    if (text.length < MIN_CHARS) {
      if (text.length > 0) {
        out.push({
          sectionIndex: section.sectionIndex,
          chapterTitle: section.chapterTitle,
          text,
          pageNumber: Math.floor(charOffset / CHARS_PER_PAGE) + 1,
        });
        charOffset += text.length;
      }
      continue;
    }

    const pieces = splitSection(text);
    for (const piece of pieces) {
      out.push({
        sectionIndex: section.sectionIndex,
        chapterTitle: section.chapterTitle,
        text: piece.text,
        pageNumber:
          Math.floor((charOffset + piece.start) / CHARS_PER_PAGE) + 1,
      });
    }
    charOffset += text.length;
  }

  return out;
}

type Piece = { text: string; start: number };

function splitSection(text: string): Piece[] {
  const pieces: Piece[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const hardEnd = Math.min(cursor + TARGET_CHARS, text.length);
    if (hardEnd === text.length) {
      pieces.push({ text: text.slice(cursor), start: cursor });
      break;
    }

    const breakAt = findBreak(text, cursor, hardEnd);
    pieces.push({ text: text.slice(cursor, breakAt), start: cursor });

    const next = breakAt - OVERLAP_CHARS;
    cursor = next > cursor ? next : breakAt;
  }

  // Merge a too-small trailing piece back into the previous one.
  if (pieces.length >= 2) {
    const last = pieces[pieces.length - 1]!;
    if (last.text.length < MIN_CHARS) {
      const prev = pieces[pieces.length - 2]!;
      prev.text = text.slice(prev.start, last.start + last.text.length);
      pieces.pop();
    }
  }

  return pieces.map((p) => ({ text: p.text.trim(), start: p.start }))
    .filter((p) => p.text.length > 0);
}

/**
 * Find a natural break between `min` and `max`, preferring paragraph, then
 * sentence, then whitespace. Searches from `max` backward so we take the
 * latest clean split before the hard limit.
 */
function findBreak(text: string, min: number, max: number): number {
  const window = text.slice(min, max);

  const para = window.lastIndexOf("\n\n");
  if (para > window.length * 0.5) return min + para + 2;

  const sentence = findLastSentenceBreak(window);
  if (sentence > window.length * 0.5) return min + sentence;

  const space = window.lastIndexOf(" ");
  if (space > window.length * 0.3) return min + space + 1;

  return max;
}

function findLastSentenceBreak(window: string): number {
  const markers = [". ", "! ", "? ", ".\n", "!\n", "?\n"];
  let best = -1;
  for (const m of markers) {
    const idx = window.lastIndexOf(m);
    if (idx > best) best = idx + m.length;
  }
  return best;
}

/**
 * Convenience: strip HTML to plaintext. Used when a caller only has the
 * raw section HTML (foliate-js gives us Documents, but we may want to
 * chunk any HTML string).
 */
export function stripHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const tag of ["script", "style", "nav", "header", "footer"]) {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  }
  return doc.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}
