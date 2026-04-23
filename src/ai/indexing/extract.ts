import type { SectionSource } from "../chunking/chunker";

type FoliateSection = {
  id?: string | number;
  linear?: string;
  createDocument?: () => Promise<Document>;
};

type FoliateBook = {
  sections?: FoliateSection[];
  toc?: Array<{ href?: string; label?: string; subitems?: unknown[] }>;
};

/**
 * Walk a foliate-js book and produce `SectionSource` inputs for the
 * chunker. Skips sections with `linear="no"` (front-matter that isn't
 * part of the reading order). Chapter titles come from the TOC entry
 * whose href maps to each section; if a section has no TOC entry, we
 * carry the most recent ancestor label forward.
 */
export async function extractSections(book: FoliateBook): Promise<SectionSource[]> {
  if (!book.sections || book.sections.length === 0) return [];

  const tocLabelByHref = flattenToc(book.toc ?? []);
  const out: SectionSource[] = [];
  let lastChapter = "";

  for (let i = 0; i < book.sections.length; i++) {
    const section = book.sections[i]!;
    if (section.linear === "no" || !section.createDocument) continue;

    const sectionKey =
      typeof section.id === "string" || typeof section.id === "number"
        ? String(section.id)
        : "";
    const label = findTocLabel(tocLabelByHref, sectionKey);
    if (label) lastChapter = label;

    const doc = await section.createDocument();
    const text = extractText(doc);
    if (!text) continue;

    out.push({
      sectionIndex: i,
      chapterTitle: lastChapter,
      text,
    });
  }

  return out;
}

function extractText(doc: Document): string {
  const clone = doc.body.cloneNode(true) as HTMLElement;
  for (const tag of ["script", "style", "nav", "header", "footer"]) {
    clone.querySelectorAll(tag).forEach((el) => el.remove());
  }
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

type TocMap = Array<{ href: string; label: string }>;

function flattenToc(
  items: Array<{ href?: string; label?: string; subitems?: unknown[] }>,
): TocMap {
  const out: TocMap = [];
  const walk = (
    list: Array<{ href?: string; label?: string; subitems?: unknown[] }>,
  ) => {
    for (const item of list) {
      if (item.href && item.label) {
        out.push({ href: item.href, label: item.label.trim() });
      }
      if (Array.isArray(item.subitems) && item.subitems.length > 0) {
        walk(item.subitems as typeof list);
      }
    }
  };
  walk(items);
  return out;
}

function findTocLabel(toc: TocMap, sectionKey: string): string {
  if (!sectionKey) return "";
  const hit = toc.find((t) => t.href === sectionKey || t.href.startsWith(sectionKey));
  return hit?.label ?? "";
}
