// Derives chapter/section structure from a foliate TOC tree. Hierarchical
// TOCs map directly (top-level → chapter, nested → section); flat TOCs
// fall back to detecting chapter boundaries by title pattern.

import type { TocItem } from "@/components/BookViewport";

export type SectionInfo = {
  id: string;
  title: string;
  href: string;
};

export type ChapterInfo = SectionInfo & {
  chapterIndex: number;
  sections: SectionInfo[];
  /** Chapter heading + every section title, lowercased keys for the
   *  indexed-chunk filter. Chunks land under leaf TOC labels, so a
   *  chapter scope must accept any of them. */
  allTitles: string[];
};

export type TocStructure = {
  /** Every top-level chapter, front- and back-matter included. Used for
   *  active-position resolution so we still know which "chapter" the
   *  user is in when reading a Preface. */
  chapters: ChapterInfo[];
  /** Body chapters only — what the user-facing picker shows. */
  bodyChapters: ChapterInfo[];
  isFlat: boolean;
};

const CHAPTER_TITLE_RE =
  /^\s*(?:chapter\s+\d+|ch(?:apter)?\.?\s*\d+|part\s+\d+|book\s+[ivxlcdm\d]+|\d+\s*[.:]|[ivxlcdm]+\s*[.:])\b/i;

const MATTER_TITLE_RE =
  /^\s*(?:half[\s-]?title|title\s*page|copyright|colophon|imprint|dedication|epigraph|foreword|preface|acknowled?gments?|introduction|prologue|epilogue|afterword|about\s+(?:the\s+)?author|about\s+the\s+book|notes(?:\s+on)?|appendix(?:\s+[a-z\d]+)?|glossary|bibliography|references|further\s+reading|index|colofon|errata|table\s+of\s+contents|contents)\s*$/i;

export function isFrontOrBackMatter(title: string): boolean {
  return MATTER_TITLE_RE.test(title);
}

export function analyzeToc(toc: TocItem[]): TocStructure {
  if (!toc || toc.length === 0)
    return { chapters: [], bodyChapters: [], isFlat: false };

  const hasNesting = toc.some(
    (t) => Array.isArray(t.subitems) && t.subitems.length > 0,
  );
  const { chapters, isFlat } = hasNesting ? analyzeNested(toc) : analyzeFlat(toc);
  return {
    chapters,
    isFlat,
    bodyChapters: chapters.filter((c) => !isFrontOrBackMatter(c.title)),
  };
}

type RawTocAnalysis = { chapters: ChapterInfo[]; isFlat: boolean };

function analyzeNested(toc: TocItem[]): RawTocAnalysis {
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

function analyzeFlat(toc: TocItem[]): RawTocAnalysis {
  const isChapter = toc.map((t) => CHAPTER_TITLE_RE.test(t.label));
  const anyMatched = isChapter.some(Boolean);

  // No chapter-pattern hits — treat every entry as its own chapter so
  // the picker stays useful instead of showing nothing.
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

/** Resolve the active chapter (and section, when nested) from the id
 *  chain produced by `resolveActiveToc`. */
export function locateInToc(
  structure: TocStructure,
  activeId: string | null,
  ancestorIds: string[],
): { chapter: ChapterInfo | null; section: SectionInfo | null } {
  if (!structure.chapters.length || !activeId) {
    return { chapter: null, section: null };
  }
  const idChain = [activeId, ...ancestorIds];

  for (const chapter of structure.chapters) {
    if (idChain.includes(chapter.id)) {
      const sectionMatch = chapter.sections.find((s) => idChain.includes(s.id));
      return { chapter, section: sectionMatch ?? null };
    }
    const sectionMatch = chapter.sections.find((s) => idChain.includes(s.id));
    if (sectionMatch) return { chapter, section: sectionMatch };
  }

  return { chapter: null, section: null };
}
