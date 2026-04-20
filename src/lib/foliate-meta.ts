import type { FoliateBook } from "@/lib/foliate";

export function extractTitle(
  metadata: FoliateBook["metadata"],
  fallback = "",
): string {
  const t = metadata?.title;
  if (!t) return fallback;
  if (typeof t === "string") return t.trim() || fallback;
  return t["en"] ?? t["default"] ?? Object.values(t)[0] ?? fallback;
}

export function extractAuthor(metadata: FoliateBook["metadata"]): string {
  const a = metadata?.author;
  if (!a) return "";
  if (typeof a === "string") return a.trim();
  if (Array.isArray(a)) {
    return a
      .map((x) => (typeof x === "string" ? x : (x.name ?? "")))
      .filter(Boolean)
      .join(", ");
  }
  return a.name ?? "";
}
