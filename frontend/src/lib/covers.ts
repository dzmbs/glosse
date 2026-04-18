/**
 * Synthesize a deterministic cover color + accent for a book.
 *
 * LATER: once the ingest pipeline extracts real cover art from the EPUB's
 * `cover.jpg` entry we can replace this with actual image URLs. For now
 * each book id hashes to a stable cover/accent pair picked from a curated
 * palette so covers look hand-made rather than algorithmic.
 */

// Curated cover palettes — each pair works well on the cream library bg.
// Matches the demo library in glosse-design/src/drawers.jsx (LibraryView).
const PALETTE: Array<{ cover: string; accent: string }> = [
  { cover: "#6b4226", accent: "#c98a4b" }, // warm brown (Frankenstein)
  { cover: "#2d3a2e", accent: "#8ba384" }, // deep green (Meditations)
  { cover: "#484558", accent: "#b5a8c8" }, // dusk violet (The Waste Land)
  { cover: "#5a3847", accent: "#c89aa9" }, // plum (Middlemarch)
  { cover: "#3a4d52", accent: "#8ab5b8" }, // teal (On Liberty)
  { cover: "#704c2e", accent: "#d4a87a" }, // sienna (Age of Innocence)
  { cover: "#2e3b5c", accent: "#8fa3c8" }, // indigo
  { cover: "#4a3c28", accent: "#c2a682" }, // bronze
  { cover: "#3d2e3e", accent: "#b398b6" }, // aubergine
  { cover: "#28443a", accent: "#7fb09b" }, // forest
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
  return PALETTE[hash(bookId) % PALETTE.length];
}
