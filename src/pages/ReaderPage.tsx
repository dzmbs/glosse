import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  BookViewport,
  type BookViewportHandle,
  type RelocatedEvent,
  type SelectionEvent,
  type TocItem,
} from "@/components/BookViewport";
import { Icon } from "@/components/Icons";
import { TocDrawer } from "@/components/TocDrawer";
import { TweaksPanel } from "@/components/TweaksPanel";
import { AIPanel, type AITab } from "@/components/ai/AIPanel";
import { AISettingsPanel } from "@/components/ai/AISettingsPanel";
import { RuntimeBanner } from "@/components/RuntimeBanner";
import {
  SelectionMenu,
  type SelectionAction,
} from "@/components/ai/SelectionMenu";
import {
  createHighlight,
  listHighlights,
  type Highlight,
} from "@/ai/highlights";
import { insertCards } from "@/ai";
import { useAISettings } from "@/ai/providers/settings";
import type { ReadingFocus } from "@/ai/types";
import {
  getBook,
  getProgress,
  setProgress,
  type BookRecord,
} from "@/lib/db";
import { resolveActiveToc } from "@/lib/toc";
import { useLocalStorage } from "@/lib/useLocalStorage";

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

const THEME = {
  paper: "#ffffff",
  ink: "#1a1a1a",
  inkSoft: "#3a3a3a",
  bodyStack:
    "'Literata', 'Charter', 'Iowan Old Style', Georgia, 'Times New Roman', serif",
  lineHeight: 1.55,
} as const;

const PROGRESS_DEBOUNCE_MS = 500;

type Location = {
  cfi: string;
  href: string | null;
  percentage: number;
  page: number | null;
  pageTotal: number | null;
  pageLabel: string | null;
  tocLabel: string | null;
};

const EMPTY_LOCATION: Location = {
  cfi: "",
  href: null,
  percentage: 0,
  page: null,
  pageTotal: null,
  pageLabel: null,
  tocLabel: null,
};

export function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();

  const [book, setBook] = useState<BookRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [initialCfi, setInitialCfi] = useState<string | null | undefined>(
    undefined,
  );

  const [toc, setToc] = useState<TocItem[]>([]);
  const [foliateBook, setFoliateBook] = useState<unknown | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTab, setAiTab] = useState<AITab>("ask");
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [selection, setSelection] = useState<SelectionEvent | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [chatSeed, setChatSeed] = useState<ReadingFocus | null>(null);
  const aiEnabled = useAISettings((s) => s.enabled);

  const [fontSize, setFontSize] = useLocalStorage<number>(
    "glosse.fontSize",
    18,
    (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) && n >= 13 && n <= 28 ? n : null;
    },
  );
  const [spread, setSpread] = useLocalStorage<"auto" | "none">(
    "glosse.spread",
    "auto",
    (raw) => (raw === "none" || raw === "auto" ? raw : null),
  );

  const [location, setLocation] = useState<Location>(EMPTY_LOCATION);

  const viewportRef = useRef<BookViewportHandle>(null);
  const progressSaveTimer = useRef<number | null>(null);
  const pendingProgressRef = useRef<{ cfi: string; percentage: number } | null>(
    null,
  );

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    (async () => {
      const record = await getBook(bookId);
      if (cancelled) return;
      if (!record) {
        setNotFound(true);
        return;
      }
      const progress = await getProgress(bookId);
      if (cancelled) return;
      setBook(record);
      setInitialCfi(progress?.cfi ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const handleReady = useCallback(
    (payload: { toc: TocItem[]; book: unknown }) => {
      setToc(payload.toc);
      setFoliateBook(payload.book);
    },
    [],
  );

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listHighlights(bookId);
        if (!cancelled) setHighlights(list);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const handleSelection = useCallback((ev: SelectionEvent | null) => {
    setSelection(ev);
  }, []);

  const resolved = useMemo(
    () => resolveActiveToc(toc, location.href),
    [toc, location.href],
  );
  // EPUB hrefs match cleanly via resolveActiveToc; PDFs encode TOC hrefs
  // as JSON-stringified PDF destinations that won't match the relocate
  // href, so foliate's own tocItem.label is the only signal we get for
  // those. Prefer it when present.
  const { activeId, ancestorIds } = resolved;
  const activeLabel = resolved.activeLabel ?? location.tocLabel;

  const handleSelectionAction = useCallback(
    async (action: SelectionAction) => {
      const sel = selection;
      if (!sel || !bookId) return;
      switch (action) {
        case "highlight": {
          try {
            const h = await createHighlight({
              bookId,
              cfi: sel.cfi,
              text: sel.text,
              pageNumber: sel.pageNumber ?? null,
            });
            setHighlights((hs) => [h, ...hs]);
            await viewportRef.current?.addHighlight(sel.cfi, "yellow");
          } catch (err) {
            console.warn("Failed to save highlight:", err);
          }
          break;
        }
        case "ask": {
          setChatSeed({
            selectedText: sel.text,
            cfi: sel.cfi,
            pageNumber: sel.pageNumber ?? null,
            chapterTitle: activeLabel ?? null,
          });
          setAiTab("ask");
          setAiOpen(true);
          if (aiEnabled) {
            void import("@/ai/events").then(({ recordReadingEvent }) =>
              recordReadingEvent({
                bookId,
                kind: "selection_ask",
                pageNumber: sel.pageNumber ?? null,
              }),
            );
          }
          break;
        }
        case "quiz": {
          try {
            await insertCards([
              {
                bookId,
                front: `From p. ${sel.pageNumber ?? "?"}: What's the key idea of this passage?\n\n"${truncate(sel.text, 280)}"`,
                back: sel.text,
                explanation:
                  "You saved this passage as a flashcard. On review, recall the key idea before revealing.",
                sourceCfi: sel.cfi,
              },
            ]);
            setAiTab("flashcards");
            setAiOpen(true);
          } catch (err) {
            console.warn("Failed to create quiz card:", err);
          }
          break;
        }
        case "copy": {
          try {
            await navigator.clipboard.writeText(sel.text);
          } catch {
            // ignore
          }
          break;
        }
      }
      viewportRef.current?.clearSelection();
      setSelection(null);
    },
    [activeLabel, aiEnabled, bookId, selection],
  );

  const handleRelocated = useCallback(
    (ev: RelocatedEvent) => {
      setLocation({
        cfi: ev.cfi,
        href: ev.href,
        percentage: ev.percentage,
        page: ev.page,
        pageTotal: ev.pageTotal,
        pageLabel: ev.pageLabel,
        tocLabel: ev.tocLabel,
      });

      if (!bookId) return;
      pendingProgressRef.current = { cfi: ev.cfi, percentage: ev.percentage };
      if (progressSaveTimer.current !== null) {
        window.clearTimeout(progressSaveTimer.current);
      }
      progressSaveTimer.current = window.setTimeout(() => {
        const pending = pendingProgressRef.current;
        pendingProgressRef.current = null;
        progressSaveTimer.current = null;
        if (!pending) return;
        void setProgress({
          bookId,
          cfi: pending.cfi,
          percentage: pending.percentage,
          updatedAt: Date.now(),
        });
        if (aiEnabled && ev.page != null) {
          void import("@/ai/events").then(({ recordReadingEvent }) =>
            recordReadingEvent({
              bookId,
              kind: "page_view",
              pageNumber: ev.page,
            }),
          );
        }
      }, PROGRESS_DEBOUNCE_MS);
    },
    [aiEnabled, bookId],
  );

  // Flush the pending progress write on unmount so the last page turn
  // before leaving the reader doesn't get dropped by the debounce.
  useEffect(() => {
    return () => {
      if (progressSaveTimer.current !== null) {
        window.clearTimeout(progressSaveTimer.current);
      }
      const pending = pendingProgressRef.current;
      if (pending && bookId) {
        void setProgress({
          bookId,
          cfi: pending.cfi,
          percentage: pending.percentage,
          updatedAt: Date.now(),
        });
      }
    };
  }, [bookId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable)
          return;
      }
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        void viewportRef.current?.next();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        void viewportRef.current?.prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (notFound) {
    return (
      <div
        className="flex h-screen w-screen flex-col items-center justify-center gap-3"
        style={{ background: "var(--paper)", color: "var(--ink)" }}
      >
        <div
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: 22,
            fontWeight: 500,
          }}
        >
          Book not found.
        </div>
        <button
          type="button"
          className="outline-btn"
          onClick={() => navigate("/")}
        >
          Back to library
        </button>
      </div>
    );
  }

  if (!book || initialCfi === undefined) {
    return (
      <div
        className="flex h-screen w-screen items-center justify-center italic"
        style={{
          background: "var(--paper)",
          color: "var(--ink-muted)",
          fontFamily: "var(--serif-stack)",
          fontSize: 15,
        }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <RuntimeBanner />
      <TopBar
        bookTitle={book.title}
        chapterLabel={activeLabel ?? ""}
        progressPct={location.percentage}
        onOpenToc={() => setTocOpen(true)}
        onOpenTweaks={() => setTweaksOpen((v) => !v)}
        onOpenAiSettings={() => setAiSettingsOpen(true)}
        onToggleAiChat={() => {
          setAiTab("ask");
          setAiOpen((v) => !v);
        }}
        aiEnabled={aiEnabled}
      />

      <div className="relative flex-1 overflow-hidden">
        {spread === "auto" && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 bottom-0 -translate-x-1/2"
            style={{
              width: 1,
              background: "var(--rule-soft)",
              zIndex: 1,
            }}
          />
        )}
        <BookViewport
          ref={viewportRef}
          file={book.file}
          initialCfi={initialCfi}
          onReady={handleReady}
          onRelocated={handleRelocated}
          onSelection={handleSelection}
          initialHighlights={highlights.map((h) => ({
            cfi: h.cfi,
            color: h.color,
          }))}
          themeKey="fixed"
          theme={THEME}
          fontSize={fontSize}
          spread={spread}
        />

        {selection && (
          <SelectionMenu
            x={selection.rect.left}
            y={selection.rect.top}
            onAction={(action) => void handleSelectionAction(action)}
          />
        )}
      </div>

      <BottomBar
        location={location}
        onPrev={() => void viewportRef.current?.prev()}
        onNext={() => void viewportRef.current?.next()}
      />

      <TocDrawer
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        toc={toc}
        activeId={activeId}
        ancestorIds={ancestorIds}
        bookTitle={book.title}
        bookAuthor={book.author}
        onJump={(href) => void viewportRef.current?.goToHref(href)}
      />

      <TweaksPanel
        open={tweaksOpen}
        onClose={() => setTweaksOpen(false)}
        fontSize={fontSize}
        onFontSize={setFontSize}
        spread={spread}
        onSpread={setSpread}
      />

      <AIPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onOpenSettings={() => setAiSettingsOpen(true)}
        tab={aiTab}
        onTabChange={setAiTab}
        bookId={book.id}
        bookTitle={book.title}
        bookAuthor={book.author}
        currentPage={location.page ?? 1}
        totalPages={location.pageTotal ?? undefined}
        currentChapterTitle={activeLabel ?? null}
        foliateBook={foliateBook}
        seedFocus={chatSeed}
        onSeedConsumed={() => setChatSeed(null)}
        onJumpToHighlight={(cfi) => {
          setAiOpen(false);
          void viewportRef.current?.goToCfi(cfi);
        }}
        onHighlightRemoved={(id) => {
          const removed = highlights.find((highlight) => highlight.id === id);
          setHighlights((hs) => hs.filter((h) => h.id !== id));
          if (removed) {
            void viewportRef.current?.removeHighlight(removed.cfi);
          }
        }}
      />

      <AISettingsPanel
        open={aiSettingsOpen}
        onClose={() => setAiSettingsOpen(false)}
      />
    </div>
  );
}

function TopBar({
  bookTitle,
  chapterLabel,
  progressPct,
  onOpenToc,
  onOpenTweaks,
  onOpenAiSettings,
  onToggleAiChat,
  aiEnabled,
}: {
  bookTitle: string;
  chapterLabel: string;
  progressPct: number;
  onOpenToc: () => void;
  onOpenTweaks: () => void;
  onOpenAiSettings: () => void;
  onToggleAiChat: () => void;
  aiEnabled: boolean;
}) {
  return (
    <header
      className="flex items-center gap-[14px] border-b"
      style={{
        padding: "14px 22px",
        background: "var(--paper)",
        borderColor: "var(--rule-soft)",
        zIndex: 5,
        position: "relative",
      }}
    >
      <Link to="/" className="icon-btn" title="Library">
        <Icon.library size={18} />
      </Link>
      <button
        type="button"
        className="icon-btn"
        onClick={onOpenToc}
        title="Contents"
      >
        <Icon.toc size={18} />
      </button>

      <div className="flex min-w-0 flex-1 flex-col items-center gap-[3px]">
        <div
          className="max-w-full truncate"
          style={{
            fontFamily: "var(--heading-stack)",
            fontSize: 14,
            fontWeight: 500,
            color: "var(--ink)",
            letterSpacing: 0.2,
          }}
        >
          {bookTitle}
        </div>
        <div
          className="max-w-full truncate uppercase"
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 10,
            fontWeight: 500,
            color: "var(--ink-muted)",
            letterSpacing: 1.4,
          }}
          title={chapterLabel}
        >
          {chapterLabel
            ? `${chapterLabel} · ${Math.round(progressPct * 100)}%`
            : `${Math.round(progressPct * 100)}%`}
        </div>
      </div>

      <button
        type="button"
        className="icon-btn"
        onClick={onOpenTweaks}
        title="Display"
      >
        <Icon.settings size={18} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={onOpenAiSettings}
        title="AI settings"
      >
        <KeyIcon />
      </button>
      <button
        type="button"
        className="ai-btn"
        onClick={onToggleAiChat}
        title={aiEnabled ? "Open Desk" : "Configure AI to open Desk"}
      >
        <Icon.sparkle size={15} />
        <span>Desk</span>
      </button>
    </header>
  );
}

function KeyIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx={8} cy={15} r={4} />
      <path d="M10.85 12.15 19 4M15 8l3 3" />
    </svg>
  );
}

function BottomBar({
  location,
  onPrev,
  onNext,
}: {
  location: Location;
  onPrev: () => void;
  onNext: () => void;
}) {
  const pct = Math.min(1, Math.max(0, location.percentage));

  // Prefer the EPUB's published page-list label when the book ships one
  // (print-edition page numbers). Otherwise fall back to SectionProgress's
  // virtual page (1500 chars each — foliate-js default).
  const pageText =
    location.pageLabel && location.pageTotal
      ? `p. ${location.pageLabel} / ${location.pageTotal}`
      : location.page && location.pageTotal
        ? `p. ${location.page} / ${location.pageTotal}`
        : `${Math.round(pct * 100)}%`;

  return (
    <footer
      className="flex items-center gap-5 border-t"
      style={{
        padding: "12px 24px 16px",
        background: "var(--paper)",
        borderColor: "var(--rule-soft)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono-stack)",
          fontSize: 11,
          color: "var(--ink-muted)",
          letterSpacing: 0.5,
          minWidth: 110,
        }}
      >
        {pageText}
      </div>

      <div className="flex flex-1 items-center gap-[14px]">
        <button type="button" className="icon-btn" onClick={onPrev} aria-label="Previous">
          <Icon.chevL />
        </button>
        <div
          className="relative flex-1"
          style={{ height: 2, background: "var(--rule)", borderRadius: 2 }}
        >
          <div
            className="absolute left-0 top-0 bottom-0"
            style={{
              width: `${pct * 100}%`,
              background: "var(--ink-soft)",
              borderRadius: 2,
            }}
          />
        </div>
        <button type="button" className="icon-btn" onClick={onNext} aria-label="Next">
          <Icon.chevR />
        </button>
      </div>

      <div
        style={{
          fontFamily: "var(--mono-stack)",
          fontSize: 11,
          color: "var(--ink-muted)",
          letterSpacing: 0.5,
          minWidth: 110,
          textAlign: "right",
        }}
      >
        {Math.round(pct * 100)}% · ← → to turn
      </div>
    </footer>
  );
}
