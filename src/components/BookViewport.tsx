import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

// Side-effect import registers the <foliate-view> custom element.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- vendored library, no types
import "../../vendor/foliate-js/view.js";

import {
  diffViewportHighlights,
  parseSelectionPageNumber,
} from "@/components/bookViewportState";
import { extractAuthor, extractTitle } from "@/lib/foliate-meta";
import type {
  FoliateRelocateDetail,
  FoliateTocItem,
  FoliateView,
} from "@/lib/foliate";
import { extractPdfToc, parsePdfTocHref } from "@/lib/pdfTocExtractor";

export type TocItem = {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
};

export type RelocatedEvent = {
  cfi: string;
  href: string | null;
  percentage: number;
  tocLabel: string | null;
  pageLabel: string | null;
  page: number | null;
  pageTotal: number | null;
};

export type BookViewportHandle = {
  next: () => Promise<void>;
  prev: () => Promise<void>;
  goToHref: (href: string) => Promise<void>;
  goToCfi: (cfi: string) => Promise<void>;
  addHighlight: (cfi: string, color?: string) => Promise<void>;
  removeHighlight: (cfi: string) => Promise<void>;
  clearSelection: () => void;
};

export type SelectionEvent = {
  text: string;
  cfi: string;
  pageNumber: number | null;
  rect: { left: number; top: number; bottom: number };
};

type Props = {
  file: Blob;
  initialCfi?: string | null;
  onReady?: (payload: {
    toc: TocItem[];
    title: string;
    author: string;
    /** Raw foliate-js book. Opaque to callers; used for on-demand indexing. */
    book: unknown;
  }) => void;
  onRelocated?: (ev: RelocatedEvent) => void;
  /** Called when the reader selects text inside the book. */
  onSelection?: (ev: SelectionEvent | null) => void;
  /** Called when the reader clicks an existing highlight. */
  onHighlightClick?: (cfi: string) => void;
  /** Pre-existing highlights to render. */
  initialHighlights?: Array<{ cfi: string; color?: string }>;
  theme: {
    paper: string;
    ink: string;
    inkSoft: string;
    bodyStack: string;
    lineHeight: number;
  };
  /** Changing this re-injects the stylesheet without reopening the book. */
  themeKey: string;
  fontSize: number;
  /** "auto" = up to 2 columns when wide; "none" = always 1 column. */
  spread: "auto" | "none";
};

// Returns true once the count reaches `min`, short-circuiting the walk.
function tocHasAtLeast(
  items: FoliateTocItem[] | null | undefined,
  min: number,
): boolean {
  if (!items) return false;
  let total = 0;
  const walk = (xs: FoliateTocItem[]): boolean => {
    for (const x of xs) {
      total += 1;
      if (total >= min) return true;
      if (x.subitems && walk(x.subitems)) return true;
    }
    return false;
  };
  return walk(items);
}

function normalizeToc(items: FoliateTocItem[] | undefined, path = "0"): TocItem[] {
  if (!items) return [];
  const out: TocItem[] = [];
  items.forEach((node, i) => {
    if (!node.label || !node.href) return;
    const id = `${path}-${i}`;
    out.push({
      id,
      href: node.href,
      label: node.label.trim(),
      subitems:
        node.subitems && node.subitems.length > 0
          ? normalizeToc(node.subitems, id)
          : undefined,
    });
  });
  return out;
}

// foliate-js renders each section in its own iframe. We inject a <style>
// into each section's document on `load`. The font-size goes on the ROOT
// element so books' relative-unit hierarchies (1.6em headings, 0.9em
// captions) scale proportionally — setting it on body steamrolled them.
// The font-family override on body has normal specificity so any working
// @font-face in the book wins, with our serif as a readable fallback when
// the book's embedded font fails to load (EPUBs where that happens often
// fall back to something ugly like monospace).
function buildThemeCSS(theme: Props["theme"], fontSize: number): string {
  return `
    html, body {
      background: ${theme.paper} !important;
      color: ${theme.ink};
    }
    html { font-size: ${fontSize}px; }
    body {
      font-family: ${theme.bodyStack};
      line-height: ${theme.lineHeight};
      hyphens: auto;
      -webkit-hyphens: auto;
    }
    a { color: ${theme.inkSoft}; }
    pre, code, tt, kbd, samp, var {
      font-family: ui-monospace, "SF Mono", "Menlo", "Consolas", monospace;
    }
    ::selection { background: rgba(255,224,102,0.55); }
  `;
}

function applyThemeToDoc(doc: Document, css: string) {
  const id = "glosse-theme";
  let style = doc.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = id;
    doc.head?.appendChild(style);
  }
  style.textContent = css;
}

export const BookViewport = forwardRef<BookViewportHandle, Props>(
  function BookViewport(
    {
      file,
      initialCfi,
      onReady,
      onRelocated,
      onSelection,
      onHighlightClick,
      initialHighlights,
      theme,
      themeKey,
      fontSize,
      spread,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<FoliateView | null>(null);
    const loadedDocsRef = useRef<Set<Document>>(new Set());
    const renderedHighlightsRef = useRef<Map<string, string>>(new Map());
    const onSelectionRef = useRef(onSelection);
    const onHighlightClickRef = useRef(onHighlightClick);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      onSelectionRef.current = onSelection;
    }, [onSelection]);
    useEffect(() => {
      onHighlightClickRef.current = onHighlightClick;
    }, [onHighlightClick]);

    useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);

      (async () => {
        try {
          const container = containerRef.current;
          if (!container) return;

          container.innerHTML = "";
          loadedDocsRef.current.clear();
          renderedHighlightsRef.current.clear();

          const view = document.createElement("foliate-view");
          viewRef.current = view;
          container.appendChild(view);

          view.addEventListener("load", (e) => {
            const { doc, index } = (
              e as CustomEvent<{ doc: Document; index: number }>
            ).detail;
            loadedDocsRef.current.add(doc);
            applyThemeToDoc(doc, buildThemeCSS(theme, fontSize));
            attachSelectionListener(doc, index, view, onSelectionRef);
          });

          view.addEventListener(
            "show-annotation",
            (e) => {
              const { value } = (e as CustomEvent<{ value: string }>).detail;
              onHighlightClickRef.current?.(value);
            },
          );

          view.addEventListener("draw-annotation", (e) => {
            const detail = (
              e as CustomEvent<{
                draw: (ctor: unknown, opts?: unknown) => void;
                annotation: { color?: string };
              }>
            ).detail;
            drawHighlightStripe(detail);
          });

          view.addEventListener("relocate", (e) => {
            const d = (e as CustomEvent<FoliateRelocateDetail>).detail;
            const pageCurrent = d.location?.current;
            const pageTotal = d.location?.total;
            onRelocated?.({
              cfi: d.cfi,
              href: d.tocItem?.href ?? null,
              percentage: d.fraction ?? 0,
              tocLabel: d.tocItem?.label ?? null,
              pageLabel: d.pageItem?.label ?? null,
              page: typeof pageCurrent === "number" ? pageCurrent + 1 : null,
              pageTotal: typeof pageTotal === "number" ? pageTotal : null,
            });
          });

          await view.open(file);
          if (cancelled) return;

          // Omit `max-inline-size` deliberately — pixel caps make the
          // paginator lay out more columns than it displays, which leaks
          // neighbour pages into the viewport edges.
          const renderer = view.renderer;
          if (renderer) {
            renderer.setAttribute("flow", "paginated");
            renderer.setAttribute("gap", "6%");
            renderer.setAttribute(
              "max-column-count",
              spread === "auto" ? "2" : "1",
            );
          }

          const book = view.book;
          // For PDFs whose embedded outline is empty or degenerate
          // (DjVu→PDF conversions, OCR'd scans, older academic PDFs),
          // For PDFs whose embedded outline is empty or degenerate,
          // reconstruct the TOC from the printed contents page geometry
          // and route our `pdf-toc:<idx>` hrefs through book.resolveHref.
          const pdf = book?.pdf;
          if (pdf && book && !tocHasAtLeast(book.toc, 5) && !cancelled) {
            const result = await extractPdfToc(pdf).catch(() => null);
            if (!cancelled && result && result.toc.length >= 5) {
              book.toc = result.toc;
              const origResolve = book.resolveHref?.bind(book);
              book.resolveHref = async (href: string) => {
                const idx = parsePdfTocHref(href);
                if (idx !== null) return { index: idx };
                return origResolve?.(href);
              };
              const bookWithSplit = book as typeof book & {
                splitTOCHref?: (href: string) => unknown;
              };
              const origSplit = bookWithSplit.splitTOCHref?.bind(book);
              bookWithSplit.splitTOCHref = async (href: string) => {
                const idx = parsePdfTocHref(href);
                if (idx !== null) return [idx, null];
                return origSplit?.(href);
              };
            }
          }

          onReady?.({
            toc: normalizeToc(book?.toc),
            title: extractTitle(book?.metadata),
            author: extractAuthor(book?.metadata),
            book: book ?? null,
          });

          // Force a nav after setting paginator attributes: view.open() auto-
          // navigates to bodymatter, but attribute changes afterwards
          // invalidate the paginator's layout without triggering a redraw,
          // which left the first page blank until the user pressed an arrow.
          let navigated = false;
          if (initialCfi) {
            try {
              await view.goTo(initialCfi);
              navigated = true;
            } catch {
              // Stored CFI may be stale across book versions.
            }
          }
          if (!navigated && view.book?.sections) {
            const firstLinear = view.book.sections.findIndex(
              (s) => s.linear !== "no",
            );
            await view.goTo(firstLinear >= 0 ? firstLinear : 0);
          }

          // Render pre-existing highlights (after the first section loads
          // foliate will redraw when the section becomes visible).
          if (initialHighlights && initialHighlights.length > 0) {
            for (const h of initialHighlights) {
              try {
                await (view as unknown as {
                  addAnnotation: (ann: {
                    value: string;
                    color?: string;
                  }) => Promise<void>;
                }).addAnnotation({ value: h.cfi, color: h.color ?? "yellow" });
                renderedHighlightsRef.current.set(h.cfi, h.color ?? "yellow");
              } catch {
                // ignore
              }
            }
          }

          if (!cancelled) setLoading(false);
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
          }
        }
      })();

      return () => {
        cancelled = true;
        try {
          viewRef.current?.close?.();
          viewRef.current?.remove();
        } catch {
          // ignore
        }
        viewRef.current = null;
        loadedDocsRef.current.clear();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file]);

    // Re-inject theme into currently-loaded section docs. Drop stale docs
    // (foliate keeps a rolling window of sections; unloaded ones have no
    // body) so the set doesn't grow unbounded across a long reading session.
    useEffect(() => {
      const css = buildThemeCSS(theme, fontSize);
      const live = loadedDocsRef.current;
      for (const doc of [...live]) {
        if (!doc.body || !doc.head) {
          live.delete(doc);
          continue;
        }
        try {
          applyThemeToDoc(doc, css);
        } catch {
          live.delete(doc);
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [themeKey, fontSize]);

    useEffect(() => {
      const r = viewRef.current?.renderer;
      if (!r) return;
      r.setAttribute("max-column-count", spread === "auto" ? "2" : "1");
    }, [spread]);

    useEffect(() => {
      const view = viewRef.current as unknown as
        | {
            addAnnotation: (annotation: {
              value: string;
              color?: string;
            }) => Promise<void>;
            deleteAnnotation: (annotation: { value: string }) => Promise<void>;
          }
        | null;
      if (!view) return;

      const rendered = renderedHighlightsRef.current;
      const nextHighlights = initialHighlights ?? [];
      const { toAdd, toRemove } = diffViewportHighlights(rendered, nextHighlights);
      if (toAdd.length === 0 && toRemove.length === 0) return;

      void (async () => {
        for (const cfi of toRemove) {
          try {
            await view.deleteAnnotation({ value: cfi });
          } catch {
            // ignore
          }
          rendered.delete(cfi);
        }

        for (const highlight of toAdd) {
          const color = highlight.color ?? "yellow";
          try {
            await view.addAnnotation({ value: highlight.cfi, color });
            rendered.set(highlight.cfi, color);
          } catch {
            // ignore
          }
        }
      })();
    }, [initialHighlights]);

    useImperativeHandle(
      ref,
      () => ({
        next: async () => {
          await viewRef.current?.next();
        },
        prev: async () => {
          await viewRef.current?.prev();
        },
        goToHref: async (href) => {
          await viewRef.current?.goTo(href);
        },
        goToCfi: async (cfi) => {
          await viewRef.current?.goTo(cfi);
        },
        addHighlight: async (cfi: string, color = "yellow") => {
          const v = viewRef.current as unknown as
            | {
                addAnnotation: (ann: {
                  value: string;
                  color?: string;
                }) => Promise<void>;
              }
            | null;
          await v?.addAnnotation({ value: cfi, color });
        },
        removeHighlight: async (cfi: string) => {
          const v = viewRef.current as unknown as
            | {
                deleteAnnotation: (ann: { value: string }) => Promise<void>;
              }
            | null;
          await v?.deleteAnnotation({ value: cfi });
        },
        clearSelection: () => {
          for (const doc of loadedDocsRef.current) {
            try {
              doc.defaultView?.getSelection()?.removeAllRanges();
            } catch {
              // ignore
            }
          }
          onSelectionRef.current?.(null);
        },
      }),
      [],
    );

    return (
      <div
        className="relative h-full w-full"
        style={{ background: theme.paper }}
      >
        <div
          ref={containerRef}
          className="h-full w-full"
          style={{
            opacity: loading ? 0 : 1,
            transition: "opacity 0.35s ease",
          }}
        />
        {loading && <Loader paper={theme.paper} inkSoft={theme.inkSoft} />}
        {error && (
          <div
            className="absolute inset-0 flex items-center justify-center p-10"
            style={{ background: theme.paper }}
          >
            <div
              className="max-w-md text-center"
              style={{
                fontFamily: "var(--serif-stack)",
                color: "var(--ink)",
              }}
            >
              <div style={{ fontSize: 18, marginBottom: 8 }}>
                Could not open this book.
              </div>
              <div
                style={{
                  fontFamily: "var(--mono-stack)",
                  fontSize: 11,
                  color: "var(--ink-muted)",
                }}
              >
                {error}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);

const SELECTION_ATTACHED = new WeakSet<Document>();

function attachSelectionListener(
  doc: Document,
  index: number,
  view: FoliateView,
  onSelectionRef: React.MutableRefObject<
    ((ev: SelectionEvent | null) => void) | undefined
  >,
) {
  if (SELECTION_ATTACHED.has(doc)) return;
  SELECTION_ATTACHED.add(doc);

  const emit = () => {
    const selection = doc.defaultView?.getSelection();
    if (!selection || selection.rangeCount === 0) {
      onSelectionRef.current?.(null);
      return;
    }
    const text = selection.toString().trim();
    if (!text) {
      onSelectionRef.current?.(null);
      return;
    }
    const range = selection.getRangeAt(0);
    let cfi: string | null = null;
    let pageNumber: number | null = null;
    try {
      const v = view as unknown as {
        getCFI: (idx: number, range: Range) => string;
        getProgressOf?: (
          idx: number,
          range: Range,
        ) => { pageItem?: { label?: string } | null } | undefined;
      };
      cfi = v.getCFI(index, range);
      pageNumber = parseSelectionPageNumber(
        v.getProgressOf?.(index, range)?.pageItem?.label,
      );
    } catch {
      return;
    }
    if (!cfi) return;

    // Convert the range's bounding rect from the iframe doc to viewport
    // coords. foliate's paginator positions each iframe inside a parent;
    // we add the iframe's frame element offset when available.
    const rangeRect = range.getBoundingClientRect();
    const frame = doc.defaultView?.frameElement as HTMLElement | null;
    const frameRect = frame?.getBoundingClientRect();
    const dx = frameRect?.left ?? 0;
    const dy = frameRect?.top ?? 0;

    onSelectionRef.current?.({
      text,
      cfi,
      pageNumber,
      rect: {
        left: rangeRect.left + dx + rangeRect.width / 2,
        top: rangeRect.top + dy,
        bottom: rangeRect.bottom + dy,
      },
    });
  };

  const onPointerUp = () => setTimeout(emit, 10);
  const onSelChange = () => {
    const selection = doc.defaultView?.getSelection();
    if (!selection || selection.rangeCount === 0) {
      onSelectionRef.current?.(null);
    }
  };

  doc.addEventListener("pointerup", onPointerUp);
  doc.addEventListener("selectionchange", onSelChange);
}

function drawHighlightStripe(detail: {
  draw: (ctor: unknown, opts?: unknown) => void;
  annotation: { color?: string };
}) {
  const color = highlightFill(detail.annotation.color);
  try {
    detail.draw(undefined, { fill: color, opacity: 1 });
  } catch {
    // ignore
  }
}

function highlightFill(color?: string): string {
  switch (color) {
    case "red":
      return "rgba(200, 60, 40, 0.25)";
    case "blue":
      return "rgba(60, 120, 200, 0.25)";
    case "green":
      return "rgba(60, 160, 100, 0.28)";
    case "yellow":
    default:
      return "rgba(255, 214, 90, 0.38)";
  }
}

function Loader({ paper, inkSoft }: { paper: string; inkSoft: string }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-5"
      style={{
        background: paper,
        animation: "glosse-fade-in 0.2s ease",
      }}
    >
      <svg
        width={28}
        height={28}
        viewBox="0 0 50 50"
        style={{ animation: "glosse-spin 1.1s linear infinite" }}
      >
        <circle
          cx={25}
          cy={25}
          r={20}
          fill="none"
          stroke={inkSoft}
          strokeOpacity={0.18}
          strokeWidth={2.2}
        />
        <circle
          cx={25}
          cy={25}
          r={20}
          fill="none"
          stroke={inkSoft}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeDasharray={90}
          strokeDashoffset={60}
        />
      </svg>
      <div
        className="italic"
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 13,
          color: inkSoft,
          opacity: 0.75,
          letterSpacing: 0.2,
        }}
      >
        opening
      </div>
      <style>{`
        @keyframes glosse-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes glosse-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
