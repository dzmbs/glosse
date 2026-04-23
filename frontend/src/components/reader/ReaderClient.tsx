"use client";

/**
 * ReaderClient — the client-side glue that owns all interactive state for
 * the reader. The Server Component at app/read/[bookId]/[chapter]/page.tsx
 * hands us the initial book + chapter; every subsequent chapter swap
 * happens in-place through client-side fetches so prev/next/TOC can
 * animate with the View Transitions API instead of full-page reloads.
 *
 * What it owns:
 *   - the currently-displayed chapter (state, not props)
 *   - open drawers (TOC, Highlights, Tweaks)
 *   - AI panel open/closed
 *   - current text selection (used as chat context when present)
 */

import { flushSync } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AIPanel } from "@/components/ai/AIPanel";
import { HighlightsDrawer } from "@/components/drawers/HighlightsDrawer";
import { TOCDrawer } from "@/components/drawers/TOCDrawer";
import { TweaksPanel } from "@/components/drawers/TweaksPanel";
import { BookPage } from "@/components/reader/BookPage";
import { ReaderBottomBar } from "@/components/reader/BottomBar";
import { ReaderTopBar } from "@/components/reader/TopBar";
import { Icon } from "@/components/Icons";
import { api, type BookDetail, type Chapter } from "@/lib/api";
import { tocTitleForChapter } from "@/lib/toc";
import { useTweaks } from "@/lib/tweaks";

const WORDS_PER_MINUTE = 240;

type SwapDirection = "forward" | "back";

type StartViewTransition = (cb: () => void | Promise<void>) => unknown;

/** Narrow browser type for the View Transitions API without polyfill drama. */
function getStartViewTransition(): StartViewTransition | null {
  if (typeof document === "undefined") return null;
  const d = document as Document & { startViewTransition?: StartViewTransition };
  return typeof d.startViewTransition === "function" ? d.startViewTransition.bind(d) : null;
}

export function ReaderClient({
  book,
  chapter: initialChapter,
}: {
  book: BookDetail;
  chapter: Chapter;
}) {
  const { tweaks, mode, setTweaks } = useTweaks();

  const [chapter, setChapter] = useState<Chapter>(initialChapter);
  const [navPending, setNavPending] = useState(false);
  const [pageTurn, setPageTurn] = useState<SwapDirection | null>(null);
  const pageTurnTimer = useRef<number | null>(null);

  // AI is off by default. The user opens it explicitly via the Ask
  // button in the top bar or the "Ask about this page" floating pill —
  // auto-opening felt like the AI was barging into their reading session.
  const [aiOpen, setAiOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [highlightsOpen, setHighlightsOpen] = useState(false);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  // Apply the book's default surface once, the first time we mount this
  // reader for this book id. After that, mode changes are driven by the
  // user's own ModePill clicks and stay sticky across navigation.
  const appliedSurfaceFor = useRef<string | null>(null);
  useEffect(() => {
    if (appliedSurfaceFor.current === book.id) return;
    appliedSurfaceFor.current = book.id;
    const wanted = book.default_surface;
    if (wanted && wanted !== tweaks.surface) {
      setTweaks({ surface: wanted });
    }
    // `tweaks.surface` deliberately omitted — applying once on entry is
    // the point; we don't want this to fire every time the user tweaks
    // the mode manually.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, book.default_surface, setTweaks]);

  const mainRef = useRef<HTMLDivElement>(null);
  const articleWrapRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const selectedTextRef = useRef<string | null>(null);
  const preserveSelectionForAskRef = useRef(false);

  // -- Chapter navigation (client-side, animated) -----------------------

  const navigateChapter = useCallback(
    async (nextIndex: number) => {
      if (navPending || nextIndex === chapter.index) return;
      if (nextIndex < 0 || nextIndex >= chapter.chapters_total) return;

      setNavPending(true);
      const direction: SwapDirection = nextIndex > chapter.index ? "forward" : "back";

      setSelectedText(null);
      selectedTextRef.current = null;
      preserveSelectionForAskRef.current = false;
      window.getSelection()?.removeAllRanges();

      try {
        const nextChapter = await api.chapter(book.id, nextIndex);
        document.documentElement.dataset.readerDirection = direction;
        setPageTurn(direction);
        if (pageTurnTimer.current !== null) {
          window.clearTimeout(pageTurnTimer.current);
        }
        pageTurnTimer.current = window.setTimeout(() => {
          setPageTurn(null);
          pageTurnTimer.current = null;
        }, 420);

        const start = getStartViewTransition();
        if (start) {
          start(() => {
            flushSync(() => setChapter(nextChapter));
          });
        } else {
          setChapter(nextChapter);
        }

        window.history.pushState(
          { bookId: book.id, chapterIndex: nextIndex },
          "",
          `/read/${book.id}/${nextIndex}`,
        );
      } finally {
        setNavPending(false);
      }
    },
    [book.id, chapter.chapters_total, chapter.index, navPending],
  );

  useEffect(() => {
    return () => {
      if (pageTurnTimer.current !== null) {
        window.clearTimeout(pageTurnTimer.current);
      }
    };
  }, []);

  // -- Browser back/forward --------------------------------------------

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const s = e.state as { bookId?: string; chapterIndex?: number } | null;
      if (s && s.bookId === book.id && typeof s.chapterIndex === "number") {
        void navigateChapter(s.chapterIndex);
        return;
      }
      const match = window.location.pathname.match(/^\/read\/([^/]+)\/(\d+)/);
      if (match && match[1] === book.id) {
        void navigateChapter(Number(match[2]));
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [book.id, navigateChapter]);

  // -- Reading-time estimate -------------------------------------------

  const minutesLeft = useMemo(() => {
    if (!chapter.text) return null;
    const words = chapter.text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  }, [chapter.text]);

  const progressPct = (chapter.index + 1) / chapter.chapters_total;

  // -- Selection tracking ------------------------------------------------
  // Native selection/copy must feel exactly like a normal reader. We only
  // remember the currently-selected text so the explicit Ask button can use
  // it; selecting text alone must not trigger UI.

  const readSelectedText = useCallback(() => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !mainRef.current || s.rangeCount === 0) return null;

    const anchorNode = s.anchorNode;
    const focusNode = s.focusNode;
    if (!anchorNode || !focusNode) return null;
    if (!mainRef.current.contains(anchorNode) || !mainRef.current.contains(focusNode)) {
      return null;
    }

    const text = s.toString().trim();
    return text || null;
  }, []);

  const captureSelectedText = useCallback(() => {
    const text = readSelectedText();
    if (text) {
      setSelectedText(text);
      selectedTextRef.current = text;
      preserveSelectionForAskRef.current = true;
    }
  }, [readSelectedText]);

  // Mirror the native selection into React state at gesture end so the
  // AI panel can show it live as "Using selected passage". We intentionally
  // do NOT listen to `selectionchange` — committing on every tick wipes the
  // browser's live Range mid-drag. BookPage is memoised, so this re-render
  // no longer re-applies the chapter's innerHTML.
  //
  // Selection is sticky: once captured it stays as AI context until the
  // user dismisses it via the × on the chip, selects a new passage, or
  // navigates to a different chapter. Clicking into the textarea collapses
  // the DOM selection but must not clear our stored passage.
  useEffect(() => {
    const commit = () => {
      const text = readSelectedText();
      if (!text) return;
      selectedTextRef.current = text;
      preserveSelectionForAskRef.current = false;
      setSelectedText((prev) => (prev === text ? prev : text));
    };

    document.addEventListener("mouseup", commit);
    document.addEventListener("keyup", commit);
    return () => {
      document.removeEventListener("mouseup", commit);
      document.removeEventListener("keyup", commit);
    };
  }, [readSelectedText]);

  const clearSelection = useCallback(() => {
    selectedTextRef.current = null;
    preserveSelectionForAskRef.current = false;
    setSelectedText(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  // -- Intercept links inside chapter HTML -----------------------------

  useEffect(() => {
    const root = articleWrapRef.current;
    if (!root) return;

    const hrefToSpine = new Map<string, number>();
    for (const s of book.spine) hrefToSpine.set(s.href, s.index);

    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;
      if (!root.contains(target)) return;

      const raw = target.getAttribute("href") ?? "";
      if (!raw) return;

      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

      e.preventDefault();

      if (raw.startsWith("#")) {
        const el = (root.querySelector(`#${CSS.escape(raw.slice(1))}`) as HTMLElement | null)
          ?? (root.querySelector(`[name="${CSS.escape(raw.slice(1))}"]`) as HTMLElement | null);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      if (/^https?:\/\//i.test(raw)) {
        window.open(raw, "_blank", "noopener,noreferrer");
        return;
      }

      const [filePart] = raw.split("#");
      const spineIdx = hrefToSpine.get(filePart);
      if (typeof spineIdx === "number" && spineIdx !== chapter.index) {
        void navigateChapter(spineIdx);
      }
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [book.spine, chapter.index, navigateChapter]);

  // -- Ask button ------------------------------------------------------

  const onAskToggle = useCallback(() => {
    const text = selectedTextRef.current?.trim();
    preserveSelectionForAskRef.current = false;
    if (text) {
      setAiOpen(true);
      return;
    }
    setAiOpen((v) => !v);
  }, []);

  // Prefer the TOC-resolved title over a spine-derived fallback.
  const sectionTitle = useMemo(
    () => tocTitleForChapter(book, chapter),
    [book, chapter],
  );
  const chapterLabel = sectionTitle ?? `Section ${chapter.index + 1}`;
  const isPill = tweaks.aiStyle === "pill";

  const prevHandler = useCallback(() => {
    if (chapter.prev_index !== null) void navigateChapter(chapter.prev_index);
  }, [chapter.prev_index, navigateChapter]);
  const nextHandler = useCallback(() => {
    if (chapter.next_index !== null) void navigateChapter(chapter.next_index);
  }, [chapter.next_index, navigateChapter]);

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <ReaderTopBar
        bookTitle={book.title}
        chapterLabel={chapterLabel}
        progressPct={progressPct}
        onOpenToc={() => setTocOpen(true)}
        onOpenHighlights={() => setHighlightsOpen(true)}
        onOpenTweaks={() => setTweaksOpen((v) => !v)}
        onAskToggle={onAskToggle}
        onAskMouseDown={captureSelectedText}
      />

      <div className="flex-1 relative overflow-hidden" style={{ display: "flex" }}>
        <div
          ref={mainRef}
          className="flex-1 flex"
          style={{
            background: "var(--paper)",
            marginRight: aiOpen && !isPill ? 440 : 0,
            transition: "margin-right 0.35s cubic-bezier(0.32, 0.72, 0.24, 1), background 0.4s ease",
          }}
        >
          <div ref={articleWrapRef} className="flex-1 flex min-w-0">
            <BookPage
              key={chapter.index}
              html={chapter.html}
              sectionIndex={chapter.index}
              sectionsTotal={chapter.chapters_total}
              bookTitle={book.title}
              sectionTitle={sectionTitle}
              mode={mode}
            />
          </div>
        </div>

        {pageTurn && (
          <div
            className={"reader-page-turn reader-page-turn--" + pageTurn}
            aria-hidden="true"
          />
        )}

        {!isPill && (
          <div
            className="absolute top-0 bottom-0 right-0"
            style={{
              width: 440,
              transform: aiOpen ? "translateX(0)" : "translateX(100%)",
              transition: "transform 0.35s cubic-bezier(0.32, 0.72, 0.24, 1)",
              zIndex: 8,
            }}
          >
            <AIPanel
              bookId={book.id}
              chapterIndex={chapter.index}
              bookTitle={book.title}
              chapterLabel={chapterLabel}
              activeSelection={selectedText}
              onClearSelection={clearSelection}
              seed={null}
              seedPayload={null}
              onSeedConsumed={() => {}}
              onClose={() => setAiOpen(false)}
            />
          </div>
        )}

        {isPill && !aiOpen && (
          <button
            type="button"
            onMouseDown={captureSelectedText}
            onClick={onAskToggle}
            className="absolute flex items-center gap-2"
            style={{
              right: 24,
              bottom: 24,
              zIndex: 7,
              padding: "12px 18px",
              background: "var(--ink)",
              color: "var(--paper)",
              border: "none",
              borderRadius: 99,
              fontFamily: "var(--inter-stack)",
              fontSize: 14,
              fontWeight: 500,
              boxShadow: "0 10px 30px rgba(26,22,18,0.25), 0 2px 8px rgba(26,22,18,0.15)",
              cursor: "pointer",
            }}
          >
            <Icon.sparkle size={15} />
            <span>Ask about this page</span>
          </button>
        )}
        {isPill && aiOpen && (
          <div
            className="absolute"
            style={{
              right: 24,
              bottom: 24,
              width: 420,
              height: 580,
              zIndex: 8,
              borderRadius: 20,
              overflow: "hidden",
              boxShadow: "0 30px 80px rgba(26,22,18,0.35), 0 8px 20px rgba(26,22,18,0.15)",
              border: "1px solid var(--rule)",
            }}
          >
            <AIPanel
              bookId={book.id}
              chapterIndex={chapter.index}
              bookTitle={book.title}
              chapterLabel={chapterLabel}
              activeSelection={selectedText}
              onClearSelection={clearSelection}
              seed={null}
              seedPayload={null}
              onSeedConsumed={() => {}}
              onClose={() => setAiOpen(false)}
            />
          </div>
        )}
      </div>

      <ReaderBottomBar
        chapterIndex={chapter.index}
        chaptersTotal={chapter.chapters_total}
        canPrev={chapter.prev_index !== null}
        canNext={chapter.next_index !== null}
        onPrev={prevHandler}
        onNext={nextHandler}
        minutesLeft={minutesLeft}
      />

      <TOCDrawer
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        book={book}
        currentIndex={chapter.index}
        onJump={(idx) => {
          setTocOpen(false);
          void navigateChapter(idx);
        }}
      />
      <HighlightsDrawer open={highlightsOpen} onClose={() => setHighlightsOpen(false)} />
      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)} />
    </div>
  );
}
