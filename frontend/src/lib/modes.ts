/**
 * Surface modes, accent/serif/margin options — ported from
 * glosse-design/src/modes.jsx + tweaks.jsx.
 *
 * The CSS tokens for each mode live in globals.css under
 * `[data-surface="..."]` — this file only carries the *behavioural* config
 * (which chapter-head variant to use, whether to show a drop cap, etc.).
 */

import type { PedagogyMode } from "@/lib/api";

export type SurfaceId = "novel" | "study" | "article" | "focus";

export type ModeSpec = {
  id: SurfaceId;
  label: string;
  sub: string;
  icon: "book" | "grid" | "column" | "moon";
  bodySize: number;
  dropcap: boolean;
  runningHead: boolean;
  chapterHead: "roman" | "number" | "banner";
  // The pedagogy mode to pair with this surface. See
  // glosse/codex/modes.py for the backend pedagogy modes.
  pedagogy: PedagogyMode;
};

export const MODES: Record<SurfaceId, ModeSpec> = {
  novel: {
    id: "novel",
    label: "Novel",
    sub: "Warm paper · literary",
    icon: "book",
    bodySize: 20,
    dropcap: true,
    runningHead: true,
    chapterHead: "roman",
    pedagogy: "story",
  },
  study: {
    id: "study",
    label: "Study",
    sub: "Crisp B&W · textbooks & technical",
    icon: "grid",
    bodySize: 17,
    dropcap: false,
    runningHead: false,
    chapterHead: "number",
    pedagogy: "technical",
  },
  article: {
    id: "article",
    label: "Article",
    sub: "Editorial · essays & non-fiction",
    icon: "column",
    bodySize: 19,
    dropcap: true,
    runningHead: false,
    chapterHead: "banner",
    pedagogy: "discussion",
  },
  focus: {
    id: "focus",
    label: "Focus",
    sub: "Dark · night reading",
    icon: "moon",
    bodySize: 20,
    dropcap: true,
    runningHead: true,
    chapterHead: "roman",
    pedagogy: "learning",
  },
};

export const SURFACE_IDS: SurfaceId[] = ["novel", "study", "article", "focus"];

// -- Tweaks (per-user style preferences) ----------------------------------

export type AccentId = "terracotta" | "ink" | "forest" | "indigo";

export const ACCENT_OPTIONS: Array<{ id: AccentId; name: string; hex: string }> = [
  { id: "terracotta", name: "Terracotta", hex: "#b84a2b" },
  { id: "ink", name: "Ink", hex: "#2a241c" },
  { id: "forest", name: "Forest", hex: "#4a6b3f" },
  { id: "indigo", name: "Indigo", hex: "#3e4e7b" },
];

export type SerifId = "newsreader" | "lora" | "fraunces";

export const SERIF_OPTIONS: Array<{ id: SerifId; name: string; stack: string }> = [
  { id: "newsreader", name: "Newsreader", stack: "var(--font-newsreader), Georgia, serif" },
  { id: "lora", name: "Lora", stack: "'Lora', Georgia, serif" },
  { id: "fraunces", name: "Fraunces", stack: "'Fraunces', Georgia, serif" },
];

export type MarginId = "tight" | "normal" | "wide";

export const MARGIN_OPTIONS: Array<{ id: MarginId; name: string; pad: number }> = [
  { id: "tight", name: "Tight", pad: 48 },
  { id: "normal", name: "Normal", pad: 72 },
  { id: "wide", name: "Wide", pad: 112 },
];

export type AIStyleId = "panel" | "pill";

export const AI_STYLE_OPTIONS: Array<{ id: AIStyleId; name: string }> = [
  { id: "panel", name: "Side panel" },
  { id: "pill", name: "Floating pill" },
];

// Cheap hex → rgb lighten (matches the design's mixToEdge helper).
export function lightenHex(hex: string, amount = 0.55): string {
  try {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const mix = (c: number) => Math.round(c + (255 - c) * amount);
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  } catch {
    return hex;
  }
}
