// E2E test harness for the geometry-based PDF TOC extractor.
//
// Loads each fixture PDF via pdfjs-dist's Node build, runs both the
// embedded outline and the reconstructed TOC, prints a side-by-side
// summary so we can eyeball quality across genres of broken PDFs.
//
// Run: pnpm tsx bench/test-toc-extract.ts [path/to/extra.pdf ...]

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
// pdfjs-dist's legacy build runs in plain Node without DOM/Worker shims.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

import { extractPdfToc, type PdfTocItem } from "../src/lib/pdfTocExtractor";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE_DIR = join(__dirname, "toc-fixtures");

async function loadPdf(filePath: string) {
  const data = new Uint8Array(readFileSync(filePath));
  return pdfjsLib.getDocument({
    data,
    isEvalSupported: false,
    // Disable worker entirely — single-threaded is fine for a bench.
    disableWorker: true,
    useSystemFonts: false,
    standardFontDataUrl: undefined,
  }).promise;
}

async function summarizeOutline(pdf: pdfjsLib.PDFDocumentProxy) {
  const outline = await pdf.getOutline().catch(() => null);
  if (!outline) return { count: 0, sample: [] };
  const flat: string[] = [];
  const walk = (items: pdfjsLib.OutlineNode[], depth: number) => {
    for (const it of items) {
      flat.push(`${"  ".repeat(depth)}${it.title}`);
      if (it.items?.length) walk(it.items, depth + 1);
    }
  };
  walk(outline, 0);
  return { count: flat.length, sample: flat.slice(0, 30) };
}

function flattenReconstructed(toc: PdfTocItem[], depth = 0): string[] {
  const out: string[] = [];
  for (const item of toc) {
    out.push(`${"  ".repeat(depth)}${item.label}  →  ${item.href}`);
    if (item.subitems) out.push(...flattenReconstructed(item.subitems, depth + 1));
  }
  return out;
}

async function runOne(filePath: string) {
  const name = basename(filePath);
  console.log("\n" + "=".repeat(72));
  console.log(`FIXTURE: ${name}`);
  console.log("=".repeat(72));

  const pdf = await loadPdf(filePath);
  console.log(`pages: ${pdf.numPages}`);

  const outline = await summarizeOutline(pdf);
  console.log(`embedded outline entries: ${outline.count}`);
  if (outline.count > 0 && outline.count <= 30) {
    console.log("--- embedded outline ---");
    for (const line of outline.sample) console.log(line);
  } else if (outline.count > 30) {
    console.log("--- embedded outline (first 30 of " + outline.count + ") ---");
    for (const line of outline.sample) console.log(line);
  }

  const t0 = Date.now();
  const result = await extractPdfToc(pdf as never, { maxScanPages: 60 });
  const ms = Date.now() - t0;

  if (!result) {
    console.log(`\n--- reconstructed TOC ---  (no extraction; ${ms}ms)`);
    return;
  }

  const flat = flattenReconstructed(result.toc);
  console.log(
    `\n--- reconstructed TOC ---  (${flat.length} entries, ${ms}ms)`,
  );
  console.log(
    `diagnostics: scanned=${result.diagnostics.scannedPages}, ` +
      `tocPages=[${result.diagnostics.tocPagesDetected.join(",")}], ` +
      `raw=${result.diagnostics.rawEntries}, ` +
      `resolved=${result.diagnostics.resolvedEntries}, ` +
      `levels=${result.diagnostics.indentLevels.length}`,
  );
  for (const line of flat.slice(0, 60)) console.log(line);
  if (flat.length > 60) console.log(`... +${flat.length - 60} more`);
}

async function main() {
  const args = process.argv.slice(2);
  const fixtures: string[] = [];
  if (existsSync(FIXTURE_DIR)) {
    for (const f of readdirSync(FIXTURE_DIR)) {
      if (f.endsWith(".pdf")) fixtures.push(join(FIXTURE_DIR, f));
    }
  }
  for (const a of args) fixtures.push(a);

  if (fixtures.length === 0) {
    console.error("no PDFs found in", FIXTURE_DIR);
    process.exit(1);
  }

  for (const f of fixtures) {
    try {
      await runOne(f);
    } catch (err) {
      console.error(`\nFAILED on ${basename(f)}:`, err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
