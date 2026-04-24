import test from "node:test";
import assert from "node:assert/strict";

import { extractSections } from "../src/ai/indexing/extract.ts";
import { chunkBook } from "../src/ai/chunking/chunker.ts";

// PDFs reach the indexer through the same foliate-js shape as EPUB/MOBI,
// but with characteristic differences: each section is a page (not a
// chapter), section ids are numeric, the TOC maps to hash-prefixed
// hrefs, many sections contain only a handful of words (figure captions,
// blank pages, title pages), and long running text frequently lacks
// clean paragraph breaks. These tests pin that the pure-TS pipeline
// (extract + chunk) copes with that shape — PDF.js itself is browser-
// only and tested manually.

type FakeSection = {
  id?: string | number;
  linear?: string;
  createDocument?: () => Promise<{ body: { cloneNode: (deep: boolean) => { textContent: string; querySelectorAll: (tag: string) => Array<{ remove: () => void }> } } }>;
};

function pageDoc(text: string) {
  const textContent = text;
  return {
    body: {
      cloneNode: () => ({
        textContent,
        querySelectorAll: () => [],
      }),
    },
  };
}

function pdfSection(page: number, body: string): FakeSection {
  return {
    id: page,
    linear: "yes",
    createDocument: async () => pageDoc(body),
  };
}

test("extractSections: flat PDF-shaped book with numeric section ids", async () => {
  const pages = [
    "Title Page\nPractical Guide",
    "Chapter 1 Brain Teasers",
    "A farmer has 17 sheep. All but 9 die. How many remain?",
    "Answer: 9.",
    "Chapter 2 Calculus and Linear Algebra",
    "The derivative of sin(x) is cos(x).",
  ];
  const book = {
    sections: pages.map((text, i) => pdfSection(i + 1, text)),
    toc: [
      { href: "2", label: "Chapter 1 Brain Teasers" },
      { href: "5", label: "Chapter 2 Calculus and Linear Algebra" },
    ],
  };

  const out = await extractSections(book as never);

  assert.equal(out.length, 6, "every non-empty page yields a section");
  assert.equal(out[0]!.chapterTitle, "", "pre-TOC pages have no chapter");
  // Pages 2..4 fall under Chapter 1, 5..6 under Chapter 2.
  assert.equal(out[1]!.chapterTitle, "Chapter 1 Brain Teasers");
  assert.equal(out[2]!.chapterTitle, "Chapter 1 Brain Teasers");
  assert.equal(out[3]!.chapterTitle, "Chapter 1 Brain Teasers");
  assert.equal(out[4]!.chapterTitle, "Chapter 2 Calculus and Linear Algebra");
  assert.equal(out[5]!.chapterTitle, "Chapter 2 Calculus and Linear Algebra");
});

test("extractSections: linear=no front-matter is skipped", async () => {
  const book = {
    sections: [
      { ...pdfSection(1, "Copyright page"), linear: "no" },
      pdfSection(2, "Chapter 1"),
      pdfSection(3, "Body text"),
    ],
    toc: [{ href: "2", label: "Chapter 1" }],
  };

  const out = await extractSections(book as never);

  assert.equal(out.length, 2, "front matter dropped");
  assert.equal(out[0]!.text, "Chapter 1");
  assert.equal(out[1]!.text, "Body text");
});

test("extractSections: blank pages are skipped without breaking chapter carry-over", async () => {
  const book = {
    sections: [
      pdfSection(1, "Introduction"),
      pdfSection(2, ""), // blank page mid-chapter
      pdfSection(3, "Continued text"),
    ],
    toc: [{ href: "1", label: "Introduction" }],
  };

  const out = await extractSections(book as never);

  assert.equal(out.length, 2, "blanks drop out");
  assert.equal(
    out[1]!.chapterTitle,
    "Introduction",
    "chapter title survives the blank page",
  );
});

test("extractSections: TOC href with a page-number prefix still resolves", async () => {
  // Some PDFs use "5" as a section id but the TOC encodes "#page=5".
  // Our matcher should be lenient enough to match by startsWith.
  const book = {
    sections: [pdfSection(5, "Ch title page body")],
    toc: [{ href: "5#anchor", label: "Real Chapter" }],
  };

  const out = await extractSections(book as never);

  assert.equal(out[0]!.chapterTitle, "Real Chapter");
});

test("chunkBook: long PDF-style paragraph splits into overlapping pieces", () => {
  // A realistic PDF page of dense prose — one paragraph, no breaks, and
  // long enough to force multiple chunks. This is the shape that tripped
  // up earlier chunkers that assumed \n\n would exist.
  const paragraph =
    "A brain teaser is not a test of raw IQ. It is a probe of how you think when the problem is unfamiliar and the answer is not obvious. ".repeat(
      60,
    );
  const out = chunkBook({
    bookId: "pdf-fake",
    sections: [
      {
        sectionIndex: 0,
        chapterTitle: "Brain Teasers",
        text: paragraph,
      },
    ],
  });

  assert.ok(out.length >= 2, `expected multiple chunks, got ${out.length}`);
  // Every chunk should still carry the chapter title.
  for (const c of out) {
    assert.equal(c.chapterTitle, "Brain Teasers");
    assert.ok(c.text.length >= 400, "no tiny orphan chunks");
  }
  // Page numbers should be monotonically non-decreasing.
  for (let i = 1; i < out.length; i++) {
    assert.ok(
      out[i]!.pageNumber >= out[i - 1]!.pageNumber,
      `page number regressed at chunk ${i}`,
    );
  }
});

test("chunkBook: a section shorter than MIN_CHARS survives as a single tiny chunk", () => {
  const out = chunkBook({
    bookId: "pdf-fake",
    sections: [
      {
        sectionIndex: 0,
        chapterTitle: "Preface",
        text: "Hello world.",
      },
    ],
  });

  assert.equal(out.length, 1);
  assert.equal(out[0]!.text, "Hello world.");
});

test("chunkBook: empty / whitespace-only sections are dropped entirely", () => {
  const out = chunkBook({
    bookId: "pdf-fake",
    sections: [
      { sectionIndex: 0, chapterTitle: "", text: "   \n\n  \t " },
      {
        sectionIndex: 1,
        chapterTitle: "Real",
        text: "Some real content here that is still under the min threshold.",
      },
    ],
  });

  assert.equal(out.length, 1, "empty section drops; real one survives");
  assert.equal(out[0]!.chapterTitle, "Real");
});

test("chunkBook: page numbers advance across sections (PDF progress parity)", () => {
  // With CHARS_PER_PAGE = 1500, a ~3000-char first section should leave
  // the second section starting on page 3+.
  const filler = "x".repeat(3000);
  const out = chunkBook({
    bookId: "pdf-fake",
    sections: [
      { sectionIndex: 0, chapterTitle: "A", text: filler },
      { sectionIndex: 1, chapterTitle: "B", text: "Short body under MIN." },
    ],
  });

  const bChunks = out.filter((c) => c.chapterTitle === "B");
  assert.equal(bChunks.length, 1);
  assert.ok(
    bChunks[0]!.pageNumber >= 3,
    `expected page >= 3 for section B, got ${bChunks[0]!.pageNumber}`,
  );
});
