// Derives chapter/section structure from a foliate TOC tree.
//
// Two cases:
//   1. Hierarchical TOC (most EPUBs, our reconstructed PDF TOCs):
//      top-level entries are chapters, nested entries are sections.
//   2. Flat TOC (some publishers dump everything at depth 0): we detect
//      chapter boundaries by title pattern ("Chapter N", roman numerals,
//      ALL CAPS) and treat siblings between two boundaries as sections of
//      the preceding chapter.
//
// All structures here are derived deterministically from the TocItem tree
// — no new state is introduced. Re-derive on every render; it's cheap.

import type { TocItem } from "@/components/BookViewport";

export type SectionInfo = {
  /** TOC entry id, stable for the lifetime of this TOC. */
  id: string;
  title: string;
  /** href so callers can navigate to it. */
  href: string;
};

export type ChapterInfo = SectionInfo & {
  /** Position among chapters (0-based). */
  chapterIndex: number;
  /** Sections under this chapter, in TOC order. Empty for chapters with
   *  no further nesting (or for flat TOCs with no detectable sections). */
  sections: SectionInfo[];
  /** Every leaf-level title under this chapter, including the chapter
   *  itself. Used to filter indexed chunks when scoping to a chapter. */
  allTitles: string[];
};

export type TocStructure = {
  chapters: ChapterInfo[];
  /** True when chapter boundaries were inferred via title pattern rather
   *  than the TOC tree. Useful for telling callers to expect lossier
   *  results (e.g. some sections may be misattributed). */
  isFlat: boolean;
};

const CHAPTER_TITLE_RE =
  /^\s*(?:chapter\s+\d+|ch(?:apter)?\.?\s*\d+|part\s+\d+|book\s+[ivxlcdm\d]+|\d+\s*[.:]|[ivxlcdm]+\s*[.:])\b/i;

export function analyzeToc(toc: TocItem[]): TocStructure {
  if (!toc || toc.length === 0) return { chapters: [], isFlat: false };

  const hasNesting = toc.some(
    (t) => Array.isArray(t.subitems) && t.subitems.length > 0,
  );
  if (hasNesting) return analyzeNested(toc);
  return analyzeFlat(toc);
}

function analyzeNested(toc: TocItem[]): TocStructure {
  const chapters: ChapterInfo[] = [];
  toc.forEach((node, i) => {
    const sections = node.subitems ? collectLeaves(node.subitems) : [];
    const allTitles = [node.label, ...sections.map((s) => s.title)];
    chapters.push({
      id: node.id,
      title: node.label,
      href: node.href,
      chapterIndex: i,
      sections,
      allTitles,
    });
  });
  return { chapters, isFlat: false };
}

// Flatten any subtree to a list of (id, title, href) — sections inherit
// the most-specific labels regardless of depth so the picker shows real
// section names rather than synthetic groupings.
function collectLeaves(items: TocItem[]): SectionInfo[] {
  const out: SectionInfo[] = [];
  const walk = (list: TocItem[]) => {
    for (const node of list) {
      out.push({ id: node.id, title: node.label, href: node.href });
      if (node.subitems && node.subitems.length > 0) walk(node.subitems);
    }
  };
  walk(items);
  return out;
}

function analyzeFlat(toc: TocItem[]): TocStructure {
  const isChapter = toc.map((t) => CHAPTER_TITLE_RE.test(t.label));
  const anyMatched = isChapter.some(Boolean);

  // No chapter-pattern hits: treat every entry as its own chapter. Better
  // than nothing — the picker still lets users target a single entry.
  if (!anyMatched) {
    return {
      chapters: toc.map((node, i) => ({
        id: node.id,
        title: node.label,
        href: node.href,
        chapterIndex: i,
        sections: [],
        allTitles: [node.label],
      })),
      isFlat: true,
    };
  }

  const chapters: ChapterInfo[] = [];
  let current: ChapterInfo | null = null;
  toc.forEach((node, i) => {
    if (isChapter[i] || current === null) {
      current = {
        id: node.id,
        title: node.label,
        href: node.href,
        chapterIndex: chapters.length,
        sections: [],
        allTitles: [node.label],
      };
      chapters.push(current);
    } else {
      current.sections.push({ id: node.id, title: node.label, href: node.href });
      current.allTitles.push(node.label);
    }
  });
  return { chapters, isFlat: true };
}

/**
 * Locate the active chapter and section for the current reading position.
 * `activeId` comes from `resolveActiveToc`; we look it up in the
 * structure to figure out which top-level chapter it belongs to and
 * whether a more-specific section is being read.
 */
export function locateInToc(
  structure: TocStructure,
  activeId: string | null,
  ancestorIds: string[],
): { chapter: ChapterInfo | null; section: SectionInfo | null } {
  if (!structure.chapters.length || !activeId) {
    return { chapter: null, section: null };
  }

  // Walk activeId + each ancestor; the first match against any chapter
  // (or its sections) wins, preferring the deepest match for the section
  // and the chapter that contains it.
  const idChain = [activeId, ...ancestorIds];

  for (const chapter of structure.chapters) {
    if (idChain.includes(chapter.id)) {
      // We're on a chapter heading — no specific section yet.
      const sectionMatch = chapter.sections.find((s) => idChain.includes(s.id));
      return { chapter, section: sectionMatch ?? null };
    }
    const sectionMatch = chapter.sections.find((s) => idChain.includes(s.id));
    if (sectionMatch) return { chapter, section: sectionMatch };
  }

  return { chapter: null, section: null };
}
