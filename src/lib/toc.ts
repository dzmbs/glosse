import type { TocItem } from "@/components/BookViewport";

export type TocResolution = {
  activeId: string | null;
  activeLabel: string | null;
  ancestorIds: string[];
};

export function resolveActiveToc(
  toc: TocItem[],
  currentHref: string | null,
): TocResolution {
  if (!currentHref) return { activeId: null, activeLabel: null, ancestorIds: [] };

  const target = normalizeHref(currentHref);
  let best: { id: string; label: string; ancestors: string[]; score: number } | null =
    null;

  const walk = (items: TocItem[], trail: string[]) => {
    for (const item of items) {
      const score = scoreTocMatch(normalizeHref(item.href), target);
      if (score > (best?.score ?? -1)) {
        best = { id: item.id, label: item.label, ancestors: [...trail], score };
        if (score >= 1000) return true;
      }
      if (item.subitems && item.subitems.length > 0) {
        if (walk(item.subitems, [...trail, item.id])) return true;
      }
    }
    return false;
  };
  walk(toc, []);

  if (!best) return { activeId: null, activeLabel: null, ancestorIds: [] };
  return {
    activeId: (best as { id: string }).id,
    activeLabel: (best as { label: string }).label,
    ancestorIds: (best as { ancestors: string[] }).ancestors,
  };
}

// Keep the fragment: sibling TOC entries within the same spine item
// (e.g. "ch02.html" vs "ch02.html#fetch-modify") must stay distinct or
// the parent chapter steals the highlight from its sub-sections.
function normalizeHref(href: string): string {
  const trimmed = href.replace(/^\.?\/+/, "");
  const [path, fragment] = trimmed.split("#");
  const parts = (path ?? trimmed).split("/");
  const fileName = parts[parts.length - 1] ?? trimmed;
  return fragment ? `${fileName}#${fragment}` : fileName;
}

function scoreTocMatch(tocHref: string, currentHref: string): number {
  if (!tocHref || !currentHref) return -1;
  if (tocHref === currentHref) return 1000;
  const tocFile = tocHref.split("#")[0];
  const curFile = currentHref.split("#")[0];
  if (tocFile !== curFile) return -1;
  const tocFrag = tocHref.includes("#") ? tocHref.split("#")[1]! : "";
  const curFrag = currentHref.includes("#") ? currentHref.split("#")[1]! : "";
  if (tocFrag === "") return 100;
  if (curFrag.startsWith(tocFrag) || tocFrag === curFrag) {
    return 500 + tocFrag.length;
  }
  return -1;
}
