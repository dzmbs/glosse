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
 *   - AI panel open/closed and seed action
 *   - floating selection menu position + text
 */

import { flushSync } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AISeed } from "@/components/ai/AIPanel";
import { AIPanel } from "@/components/ai/AIPanel";
import { HighlightsDrawer } from "@/components/drawers/HighlightsDrawer";
import { TOCDrawer } from "@/components/drawers/TOCDrawer";
import { TweaksPanel } from "@/components/drawers/TweaksPanel";
import { BookPage } from "@/components/reader/BookPage";
import { ReaderBottomBar } from "@/components/reader/BottomBar";
import { SelectionMenu, type SelectionAction } from "@/components/reader/SelectionMenu";
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
  const { tweaks, mode } = useTweaks();

  const [chapter, setChapter] = useState<Chapter>(initialChapter);
  const [navPending, setNavPending] = useState(false);

  const [aiOpen, setAiOpen] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [highlightsOpen, setHighlightsOpen] = useState(false);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  const [aiSeed, setAiSeed] = useState<AISeed>(null);
  const [aiSeedPayload, setAiSeedPayload] = useState<string | null>(null);

  const [sel, setSel] = useState<{ x: number; y: number; text: string } | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const articleWrapRef = useRef<HTMLDivElement>(null);

  // -- Chapter navigation (client-side, animated) -----------------------

  /**
   * Swap the displayed chapter with a view-transition animation. Updates
   * the URL with `history.pushState` so back/forward still work. Keeps
   * the component mounted — no SSR round-trip.
   */
  const navigateChapter = useCallback(
    async (nextIndex: number) => {
      if (navPending || nextIndex === chapter.index) return;
      if (nextIndex < 0 || nextIndex >= chapter.chapters_total) return;

      setNavPending(true);
      const direction: SwapDirection = nextIndex > chapter.index ? "forward" : "back";

      // Disarm the AI panel's stale selection context before we swap.
      setSel(null);
      window.getSelection()?.removeAllRanges();

      try {
        const nextChapter = await api.chapter(book.id, nextIndex);

        // Tell globals.css which direction to slide.
        document.documentElement.dataset.readerDirection = direction;

        const start = getStartViewTransition();
        if (start) {
          // Keep React in sync before the new snapshot is captured.
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

  // -- Browser back/forward --------------------------------------------

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const s = e.state as { bookId?: string; chapterIndex?: number } | null;
      if (s && s.bookId === book.id && typeof s.chapterIndex === "number") {
        void navigateChapter(s.chapterIndex);
        return;
      }
      // Fallback: pull the chapter index out of the URL itself.
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

  // -- Selection tracking ----------------------------------------------

  useEffect(() => {
    const onSelectionChange = () => {
      const selObj = window.getSelection();
      if (!selObj || selObj.isCollapsed || !mainRef.current) {
        setSel(null);
        return;
      }
      const text = selObj.toString().trim();
      if (!text) {
        setSel(null);
        return;
      }
      if (!mainRef.current.contains(selObj.anchorNode)) return;

      const range = selObj.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      setSel({
        x: rect.left + rect.width / 2,
        y: rect.top,
        text,
      });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".sel-menu")) return;
      setSel(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // -- Intercept links inside chapter HTML -----------------------------

  /**
   * EPUB chapter HTML frequently contains internal links that point to
   * another file in the book (e.g. `<a href="345-h-21.htm.xhtml#chap19">`).
   * Left alone these cause a full-page navigation to a garbage URL like
   * `/read/dracula/345-h-21.htm.xhtml#chap19`, which the Server Component
   * dutifully tries to parse as a chapter index and throws 404.
   *
   * We catch clicks on anchors inside `.chapter-html` and either:
   *   - map the target file to a spine index and navigate via navigateChapter
   *   - scroll to an intra-chapter anchor if the href is `#foo`
   *   - swallow the click otherwise so the reader stays stable
   */
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

      // Let new-tab clicks (cmd/ctrl/shift/middle) behave normally.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

      e.preventDefault();

      // Pure anchor — scroll within the current chapter.
      if (raw.startsWith("#")) {
        const el = root.querySelector<HTMLElement>(`#${CSS.escape(raw.slice(1))}`)
          ?? root.querySelector<HTMLElement>(`[name="${CSS.escape(raw.slice(1))}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      // External http(s) — open in a new tab.
      if (/^https?:\/\//i.test(raw)) {
        window.open(raw, "_blank", "noopener,noreferrer");
        return;
      }

      // Cross-chapter file link. Strip the fragment, see if the file maps
      // to a spine entry, and navigate there if so.
      const [filePart] = raw.split("#");
      const spineIdx = hrefToSpine.get(filePart);
      if (typeof spineIdx === "number" && spineIdx !== chapter.index) {
        void navigateChapter(spineIdx);
      }
      // Otherwise: swallow. Better a dead click than a crash.
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [book.spine, chapter.index, navigateChapter]);

  // -- Selection → AI seed --------------------------------------------

  const onSelectionAction = useCallback(
    (id: SelectionAction) => {
      if (!sel) return;
      if (id === "ask" || id === "explain" || id === "define") {
        setAiOpen(true);
        setAiSeedPayload(sel.text);
        setAiSeed("selection-ask");
      }
      // highlight / note: LATER — no storage backend yet.
      setSel(null);
      window.getSelection()?.removeAllRanges();
    },
    [sel],
  );

  // Prefer the TOC-resolved title ("CHAPTER I JONATHAN HARKER'S JOURNAL")
  // over a spine-derived fallback like "Section 5" — spine index != book
  // chapter number.
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

  // -- Render ----------------------------------------------------------

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
        onAskToggle={() => setAiOpen((v) => !v)}
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

        {/* Side-panel AI */}
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
              seed={aiSeed}
              seedPayload={aiSeedPayload}
              onSeedConsumed={() => {
                setAiSeed(null);
                setAiSeedPayload(null);
              }}
              onClose={() => setAiOpen(false)}
            />
          </div>
        )}

        {/* Floating pill AI */}
        {isPill && !aiOpen && (
          <button
            type="button"
            onClick={() => setAiOpen(true)}
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
              seed={aiSeed}
              seedPayload={aiSeedPayload}
              onSeedConsumed={() => {
                setAiSeed(null);
                setAiSeedPayload(null);
              }}
              onClose={() => setAiOpen(false)}
            />
          </div>
        )}

        {sel && <SelectionMenu x={sel.x} y={sel.y} onAction={onSelectionAction} />}
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
