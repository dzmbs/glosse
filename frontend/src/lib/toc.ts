/**
 * TOC helpers.
 *
 * A "chapter" in EPUB-speak is a file in the spine, but the book's actual
 * chapter numbering lives in the TOC. Spine position N almost never maps
 * to "Chapter N" because the front matter (cover, title, copyright, TOC,
 * dedication, …) eats up the first several spine slots.
 *
 * Instead of synthesising our own chapter labels, we resolve the title
 * from the TOC entry whose file_href matches the current chapter — so the
 * chrome says what the book itself says ("Chapter I — Jonathan Harker's
 * Journal"), and the spine index becomes a "section" position indicator.
 */

import type { BookDetail, Chapter, TOCNode } from "@/lib/api";

/**
 * Find the best TOC title for a given chapter. We pick the first entry
 * in the tree whose `file_href` matches the chapter's `href`, preferring
 * entries without an anchor (those point at the top of the file, not a
 * sub-section within it). Returns null if nothing matches.
 */
export function tocTitleForChapter(
  book: BookDetail,
  chapter: Chapter,
): string | null {
  let anchoredFallback: string | null = null;

  function walk(nodes: TOCNode[]): string | null {
    for (const n of nodes) {
      if (n.file_href === chapter.href) {
        if (!n.anchor) return n.title;
        if (anchoredFallback === null) anchoredFallback = n.title;
      }
      const deeper = walk(n.children);
      if (deeper) return deeper;
    }
    return null;
  }

  return walk(book.toc) ?? anchoredFallback;
}

/**
 * Is the spine index's own default title ("Section N") still what we'd
 * show? Useful for deciding whether to hide our synthesized ChapterHead.
 */
export function isGenericChapterTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  return /^(Section \d+|Cover|Title|Copyright|Contents|Preface|Dedication)$/i.test(
    title.trim(),
  );
}
