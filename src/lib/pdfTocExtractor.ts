// Reconstructs a hierarchical PDF TOC from page text geometry. Falls back
// path for DjVu→PDF conversions, OCR'd scans, and older academic PDFs
// whose embedded outline is empty or degenerate.

export const PDF_TOC_HREF_PREFIX = "pdf-toc:";

export function formatPdfTocHref(pageIndex: number): string {
  return `${PDF_TOC_HREF_PREFIX}${pageIndex}`;
}

export function parsePdfTocHref(href: string): number | null {
  if (!href.startsWith(PDF_TOC_HREF_PREFIX)) return null;
  const n = parseInt(href.slice(PDF_TOC_HREF_PREFIX.length), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type PdfTocItem = {
  label: string;
  href: string;
  subitems?: PdfTocItem[];
};

export type PdfLike = {
  numPages: number;
  getPage(pageNum: number): Promise<PdfPage>;
};

type PdfPage = {
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
};

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
};

type ParsedEntry = {
  title: string;
  pageNumber: number;
  isRoman: boolean;
  leftX: number;
  pdfTocPage: number;
};

export type ExtractDiagnostics = {
  scannedPages: number;
  tocPagesDetected: number[];
  rawEntries: number;
  resolvedEntries: number;
  indentLevels: number[];
  reason?: string;
};

const ROMAN_RE = /^[ivxlcdm]+$/i;
const PAGE_NUM_RE = /^([ivxlcdm]+|\d{1,4})$/i;

export async function extractPdfToc(
  pdf: PdfLike,
  opts: { maxScanPages?: number; locateRange?: number } = {},
): Promise<{ toc: PdfTocItem[]; diagnostics: ExtractDiagnostics } | null> {
  const diagnostics: ExtractDiagnostics = {
    scannedPages: 0,
    tocPagesDetected: [],
    rawEntries: 0,
    resolvedEntries: 0,
    indentLevels: [],
  };

  const maxScan = Math.min(
    pdf.numPages,
    opts.maxScanPages ?? Math.max(30, Math.floor(pdf.numPages * 0.1)),
  );
  diagnostics.scannedPages = maxScan;

  const entries: ParsedEntry[] = [];
  let lastTocPage = -1;
  let consecutiveNonToc = 0;

  for (let i = 0; i < maxScan; i++) {
    const page = await pdf.getPage(i + 1);
    const { items } = await page.getTextContent();
    const lines = groupLinesByY(items as PdfTextItem[]);
    const parsed = parseTocLines(lines, i);

    // A TOC page yields several entries (≥3) and the title-then-number
    // pattern dominates the page (≥40% of non-empty lines).
    const nonEmptyLines = lines.filter((l) => l.some((it) => it.str.trim() !== ""));
    const ratio = nonEmptyLines.length > 0 ? parsed.length / nonEmptyLines.length : 0;
    const looksLikeToc = parsed.length >= 3 && ratio >= 0.4;

    if (looksLikeToc) {
      diagnostics.tocPagesDetected.push(i);
      entries.push(...parsed);
      lastTocPage = i;
      consecutiveNonToc = 0;
    } else if (lastTocPage >= 0) {
      consecutiveNonToc++;
      // Stop once TOC ends — body started.
      if (consecutiveNonToc >= 2) break;
    }
  }

  diagnostics.rawEntries = entries.length;

  if (entries.length < 3) {
    diagnostics.reason = "fewer than 3 TOC entries detected";
    return null;
  }

  // Cluster leftmost-x values into indent levels.
  const indentLevels = clusterIndents(entries.map((e) => e.leftX));
  diagnostics.indentLevels = indentLevels;

  // Map printed page numbers → PDF page indices by sniffing each body
  // page's header/footer. Front-matter (Roman) and body (Arabic) carry
  // separate offsets, so anchor each independently. Done in batches so
  // pdfjs's worker can fan out, with an early exit once both systems
  // have enough anchors to be stable.
  const bodyStart = (entries[entries.length - 1]?.pdfTocPage ?? 0) + 1;
  const sampleRange = Math.min(
    pdf.numPages - bodyStart,
    opts.locateRange ?? 120,
  );
  const ANCHORS_NEEDED = 8;
  const BATCH = 8;

  const arabicAnchors: Array<{ printed: number; pdfIdx: number }> = [];
  const romanAnchors: Array<{ printed: number; pdfIdx: number }> = [];
  for (let i = bodyStart; i < bodyStart + sampleRange; i += BATCH) {
    const last = Math.min(i + BATCH, bodyStart + sampleRange);
    const batch = await Promise.all(
      Array.from({ length: last - i }, (_, k) =>
        sniffPrintedPageNumber(pdf, i + k),
      ),
    );
    for (let k = 0; k < batch.length; k++) {
      const printed = batch[k];
      if (!printed) continue;
      const target = printed.isRoman ? romanAnchors : arabicAnchors;
      target.push({ printed: printed.num, pdfIdx: i + k });
    }
    if (
      arabicAnchors.length >= ANCHORS_NEEDED &&
      (romanAnchors.length >= ANCHORS_NEEDED || bodyStart === 0)
    )
      break;
  }

  const arabicOffset = inferOffset(arabicAnchors);
  const romanOffset = inferOffset(romanAnchors);

  const resolved: Array<ParsedEntry & { pdfPage: number; level: number }> = [];
  for (const entry of entries) {
    const offset = entry.isRoman ? romanOffset : arabicOffset;
    if (offset === null) continue;
    const pdfPage = entry.pageNumber + offset;
    if (pdfPage < bodyStart || pdfPage >= pdf.numPages) continue;
    resolved.push({
      ...entry,
      pdfPage,
      level: levelForX(entry.leftX, indentLevels),
    });
  }

  diagnostics.resolvedEntries = resolved.length;

  if (resolved.length < 3) {
    diagnostics.reason =
      "could not infer a printed→pdf page offset from the body";
    return null;
  }

  return { toc: buildHierarchy(resolved), diagnostics };
}

async function sniffPrintedPageNumber(
  pdf: PdfLike,
  pageIdx: number,
): Promise<{ num: number; isRoman: boolean } | null> {
  const page = await pdf.getPage(pageIdx + 1);
  const { items } = await page.getTextContent();
  const lines = groupLinesByY(items as PdfTextItem[]);
  return detectPrintedPageNumber(lines);
}

function detectPrintedPageNumber(
  lines: PdfTextItem[][],
): { num: number; isRoman: boolean } | null {
  if (lines.length === 0) return null;
  // groupLinesByY sorts top→bottom, so lines[0] = top, lines[-1] = bottom.
  const indices: number[] = [lines.length - 1];
  if (lines.length > 1) indices.push(0);
  if (lines.length > 2) indices.push(lines.length - 2);

  for (const idx of indices) {
    const line = lines[idx];
    // Prefer short, header/footer-style lines — body lines that happen to
    // end in a digit (e.g., "...the year 1996") would otherwise hijack us.
    if (line.length > 4) continue;
    for (const item of line) {
      const s = item.str.trim();
      if (!PAGE_NUM_RE.test(s)) continue;
      const isRoman = ROMAN_RE.test(s);
      const num = isRoman ? romanToInt(s) : parseInt(s, 10);
      if (num > 0 && num < 10000) return { num, isRoman };
    }
  }
  return null;
}

function inferOffset(
  anchors: Array<{ printed: number; pdfIdx: number }>,
): number | null {
  if (anchors.length < 2) return null;
  // Use the median offset — robust to a handful of misdetected page
  // numbers (e.g., a body line containing a stray "12").
  const offsets = anchors.map((a) => a.pdfIdx - a.printed).sort((a, b) => a - b);
  return offsets[Math.floor(offsets.length / 2)];
}

function groupLinesByY(items: PdfTextItem[], tolerance = 2): PdfTextItem[][] {
  const filtered = items.filter((it) => it.str !== undefined && it.str !== "");
  const sorted = filtered.slice().sort((a, b) => {
    const yDiff = b.transform[5] - a.transform[5];
    if (Math.abs(yDiff) > tolerance) return yDiff;
    return a.transform[4] - b.transform[4];
  });

  const lines: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [];
  let currentY = Number.NEGATIVE_INFINITY;
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

// Two-pass: parse each line, then absorb up to two preceding continuation
// lines into entries that carry a page number. Continuations are wrapped
// title fragments without a trailing page number.
function parseTocLines(lines: PdfTextItem[][], pdfTocPage: number): ParsedEntry[] {
  const parsed = lines.map((line) => parseTocLine(line, pdfTocPage));
  const out: ParsedEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const entry = parsed[i];
    if (!entry) continue;

    let label = entry.title;
    let leftX = entry.leftX;
    for (let back = 1; back <= 2; back++) {
      const j = i - back;
      if (j < 0 || parsed[j]) break;
      const continuation = readContinuationText(lines[j]);
      if (!continuation) break;
      if (continuation.leftX > leftX + 30) break;
      label = `${continuation.text} ${label}`;
      leftX = Math.min(leftX, continuation.leftX);
    }

    out.push({ ...entry, title: collapseSpace(label), leftX });
  }
  return out;
}

function collapseSpace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function stripTrailingLeaders(s: string): string {
  return s.replace(/[.\s…]+$/, "");
}

function readContinuationText(
  line: PdfTextItem[],
): { text: string; leftX: number } | null {
  if (line.length === 0) return null;
  const sorted = line.slice().sort((a, b) => a.transform[4] - b.transform[4]);
  const last = sorted[sorted.length - 1];
  // A real continuation has no trailing page-number-shaped item.
  if (PAGE_NUM_RE.test(last.str.trim())) return null;
  if (INLINE_TOC_RE.test(last.str)) return null;
  const text = collapseSpace(stripTrailingLeaders(sorted.map((it) => it.str).join(" ")));
  if (text.length < 2 || /^[.\s…]+$/.test(text)) return null;
  if (/^contents$|^table of contents$/i.test(text)) return null;
  return { text, leftX: sorted[0].transform[4] };
}

// Matches TOC lines whose entire content (title, leaders, and page
// number) was emitted as a single text item, e.g. "Title ........ 47".
// Captures the title up to the leader run and the trailing number.
const INLINE_TOC_RE =
  /^(.+?)\s*(?:[\.…]\s*){2,}\s*(\d{1,4}|[ivxlcdm]{1,8})\s*$/i;

function parseTocLine(
  line: PdfTextItem[],
  pdfTocPage: number,
): ParsedEntry | null {
  if (line.length === 0) return null;

  const sorted = line.slice().sort((a, b) => a.transform[4] - b.transform[4]);
  const last = sorted[sorted.length - 1];

  // Two emission patterns: (a) page number is its own item at the right;
  // (b) title + leaders + page number are all inside a single wide item.
  let pageNumStr: string | null = null;
  let titleClean: string | null = null;
  let leftX = sorted[0].transform[4];

  if (PAGE_NUM_RE.test(last.str.trim())) {
    pageNumStr = last.str.trim();
    const titleItems = sorted.slice(0, -1);
    if (titleItems.length === 0) return null;
    titleClean = collapseSpace(
      stripTrailingLeaders(titleItems.map((it) => it.str).join(" ")),
    );
    // Visually separated? Either explicit gap from non-leader title item,
    // or inline `. . .` leaders within the joined string.
    const pageLeftX = last.transform[4];
    let titleRightX = sorted[0].transform[4];
    for (let j = sorted.length - 2; j >= 0; j--) {
      const it = sorted[j];
      if (!isLeaderItem(it.str)) {
        titleRightX = it.transform[4] + (it.width ?? 0);
        break;
      }
    }
    const gap = pageLeftX - titleRightX;
    const wholeLineText = line.map((it) => it.str).join("");
    const hasInlineLeaders = /\.\s*\.\s*\.|…/.test(wholeLineText);
    if (gap < 20 && !hasInlineLeaders) return null;
  } else {
    const m = INLINE_TOC_RE.exec(last.str);
    if (!m) return null;
    pageNumStr = m[2];
    const titleHead = sorted
      .slice(0, -1)
      .map((it) => it.str)
      .join(" ");
    titleClean = collapseSpace(stripTrailingLeaders(`${titleHead} ${m[1]}`));
  }

  if (!titleClean || titleClean.length < 2) return null;
  if (/^[.\s…]+$/.test(titleClean)) return null;
  if (/^\d+$/.test(titleClean)) return null;
  if (titleClean.length > 160) return null;

  const isRoman = ROMAN_RE.test(pageNumStr);
  const pageNumber = isRoman ? romanToInt(pageNumStr) : parseInt(pageNumStr, 10);
  if (!Number.isFinite(pageNumber) || pageNumber <= 0) return null;

  return {
    title: titleClean,
    pageNumber,
    isRoman,
    leftX,
    pdfTocPage,
  };
}

function isLeaderItem(s: string): boolean {
  return /^[\s.·•…_]*$/.test(s);
}

function clusterIndents(xs: number[]): number[] {
  if (xs.length === 0) return [];
  const sorted = xs.slice().sort((a, b) => a - b);
  // Cluster widths within 6 units (typical column-width spread).
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = clusters[clusters.length - 1];
    if (sorted[i] - prev[prev.length - 1] < 6) prev.push(sorted[i]);
    else clusters.push([sorted[i]]);
  }
  // Drop tiny clusters (<3 entries) — they're outliers (e.g. a stray
  // wrapped title), not real indent levels.
  const significant = clusters.filter((c) => c.length >= 3);
  if (significant.length === 0) return clusters.map((c) => c[0]);
  return significant.map((c) => c[Math.floor(c.length / 2)]);
}

function levelForX(x: number, levels: number[]): number {
  let bestLevel = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < levels.length; i++) {
    const delta = Math.abs(x - levels[i]);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestLevel = i;
    }
  }
  return bestLevel;
}

function buildHierarchy(
  entries: Array<ParsedEntry & { pdfPage: number; level: number }>,
): PdfTocItem[] {
  const root: PdfTocItem[] = [];
  const stack: Array<{ level: number; node: PdfTocItem }> = [];

  for (const entry of entries) {
    const node: PdfTocItem = {
      label: entry.title,
      href: formatPdfTocHref(entry.pdfPage),
    };
    while (stack.length > 0 && stack[stack.length - 1].level >= entry.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      root.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      if (!parent.subitems) parent.subitems = [];
      parent.subitems.push(node);
    }
    stack.push({ level: entry.level, node });
  }

  return root;
}

function romanToInt(s: string): number {
  const map: Record<string, number> = {
    i: 1,
    v: 5,
    x: 10,
    l: 50,
    c: 100,
    d: 500,
    m: 1000,
  };
  const lower = s.toLowerCase();
  let total = 0;
  for (let i = 0; i < lower.length; i++) {
    const cur = map[lower[i]] ?? 0;
    const next = i + 1 < lower.length ? map[lower[i + 1]] ?? 0 : 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}
