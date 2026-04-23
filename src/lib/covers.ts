/**
 * Synthesize a deterministic cover color + accent for a book.
 * Ported from the sibling glosse frontend.
 */

const PALETTE: Array<{ cover: string; accent: string }> = [
  { cover: "#6b4226", accent: "#c98a4b" },
  { cover: "#2d3a2e", accent: "#8ba384" },
  { cover: "#484558", accent: "#b5a8c8" },
  { cover: "#5a3847", accent: "#c89aa9" },
  { cover: "#3a4d52", accent: "#8ab5b8" },
  { cover: "#704c2e", accent: "#d4a87a" },
  { cover: "#2e3b5c", accent: "#8fa3c8" },
  { cover: "#4a3c28", accent: "#c2a682" },
  { cover: "#3d2e3e", accent: "#b398b6" },
  { cover: "#28443a", accent: "#7fb09b" },
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function coverForBook(bookId: string): { cover: string; accent: string } {
  return PALETTE[hash(bookId) % PALETTE.length]!;
}
