// Debug helper: dump first N pages' line structure so we can eyeball
// where the printed TOC actually lives in a fixture PDF.
//
// Run: pnpm tsx bench/debug-pdf-pages.ts <pdfPath> <fromPage> <toPage>

import { readFileSync } from "node:fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const [, , filePath, fromArg, toArg] = process.argv;
if (!filePath) {
  console.error("usage: tsx bench/debug-pdf-pages.ts <pdfPath> <from> <to>");
  process.exit(1);
}
const from = parseInt(fromArg ?? "1", 10);
const to = parseInt(toArg ?? "10", 10);

type Item = {
  str: string;
  transform: number[];
  width: number;
  hasEOL?: boolean;
};

function groupLinesByY(items: Item[], tolerance = 2): Item[][] {
  const filtered = items.filter((it) => it.str !== "");
  const sorted = filtered.slice().sort((a, b) => {
    const yDiff = b.transform[5] - a.transform[5];
    if (Math.abs(yDiff) > tolerance) return yDiff;
    return a.transform[4] - b.transform[4];
  });
  const lines: Item[][] = [];
  let current: Item[] = [];
  let currentY = -Infinity;
  for (const item of sorted) {
    if (Math.abs(item.transform[5] - currentY) > tolerance) {
      if (current.length > 0) lines.push(current);
      current = [item];
      currentY = item.transform[5];
    } else {
      current.push(item);
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

async function main() {
  const data = new Uint8Array(readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({
    data,
    isEvalSupported: false,
    disableWorker: true,
  }).promise;
  console.log(`pdf has ${pdf.numPages} pages`);

  for (let i = from; i <= Math.min(to, pdf.numPages); i++) {
    const page = await pdf.getPage(i);
    const { items } = await page.getTextContent();
    const lines = groupLinesByY(items as Item[]);
    console.log(`\n=== page ${i} (${lines.length} lines, ${items.length} items) ===`);
    for (const line of lines.slice(0, 30)) {
      const sorted = line.slice().sort((a, b) => a.transform[4] - b.transform[4]);
      const itemsDump = sorted
        .map(
          (it) =>
            `${Math.round(it.transform[4])}:${Math.round((it as Item).width ?? 0)}=` +
            JSON.stringify(it.str.slice(0, 300)),
        )
        .join("  ");
      console.log(
        `  y=${Math.round(line[0].transform[5])} | ${itemsDump}`,
      );
    }
    if (lines.length > 30) console.log(`  ... +${lines.length - 30} more lines`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
