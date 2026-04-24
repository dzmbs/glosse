export type ViewportHighlight = {
  cfi: string;
  color?: string;
};

export function diffViewportHighlights(
  rendered: ReadonlyMap<string, string>,
  next: ViewportHighlight[],
): {
  toAdd: ViewportHighlight[];
  toRemove: string[];
} {
  const desired = new Map(
    next.map((highlight) => [highlight.cfi, highlight.color ?? "yellow"]),
  );

  const toAdd = next.filter((highlight) => {
    const currentColor = rendered.get(highlight.cfi);
    return currentColor !== (highlight.color ?? "yellow");
  });

  const toRemove = [...rendered.keys()].filter((cfi) => !desired.has(cfi));

  return { toAdd, toRemove };
}

export function parseSelectionPageNumber(label?: string | null): number | null {
  if (!label) return null;
  const match = label.match(/\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}
