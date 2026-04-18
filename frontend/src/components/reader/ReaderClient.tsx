"use client";

/**
 * ReaderClient — the client-side glue that owns all interactive state for
 * a single chapter view. Mounted by the Server Component at
 * app/read/[bookId]/[chapter]/page.tsx with prefetched data.
 *
 * State:
 *   - open drawers (TOC, Highlights, Tweaks)
 *   - AI panel open/closed and seed action
 *   - floating selection menu position + text
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { AISeed } from "@/components/ai/AIPanel";
import { AIPanel } from "@/components/ai/AIPanel";
import type { QuickActionId } from "@/components/ai/QuickActions";
import { Drawer as _Drawer } from "@/components/drawers/Drawer";
import { HighlightsDrawer } from "@/components/drawers/HighlightsDrawer";
import { TOCDrawer } from "@/components/drawers/TOCDrawer";
import { TweaksPanel } from "@/components/drawers/TweaksPanel";
import { BookPage } from "@/components/reader/BookPage";
import { ReaderBottomBar } from "@/components/reader/BottomBar";
import { SelectionMenu, type SelectionAction } from "@/components/reader/SelectionMenu";
import { ReaderTopBar } from "@/components/reader/TopBar";
import { Icon } from "@/components/Icons";
import type { BookDetail, Chapter } from "@/lib/api";
import { useTweaks } from "@/lib/tweaks";

// Suppress unused import warning without shipping an unused side-effect.
void _Drawer;

const WORDS_PER_MINUTE = 240;

export function ReaderClient({
  book,
  chapter,
}: {
  book: BookDetail;
  chapter: Chapter;
}) {
  const { tweaks, mode } = useTweaks();
  const router = useRouter();

  const [aiOpen, setAiOpen] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [highlightsOpen, setHighlightsOpen] = useState(false);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  const [aiSeed, setAiSeed] = useState<AISeed>(null);
  const [aiSeedPayload, setAiSeedPayload] = useState<string | null>(null);

  const [sel, setSel] = useState<{ x: number; y: number; text: string } | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  // Prefetch neighbours so next/previous feels instant.
  useEffect(() => {
    if (chapter.next_index !== null) {
      router.prefetch(`/read/${book.id}/${chapter.next_index}`);
    }
    if (chapter.prev_index !== null) {
      router.prefetch(`/read/${book.id}/${chapter.prev_index}`);
    }
  }, [book.id, chapter.prev_index, chapter.next_index, router]);

  // Reading-time estimate: count words in `chapter.text` the backend sent.
  const minutesLeft = useMemo(() => {
    if (!chapter.text) return null;
    const words = chapter.text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  }, [chapter.text]);

  const progressPct = (chapter.index + 1) / chapter.chapters_total;

  // -- Selection tracking ------------------------------------------------

  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !mainRef.current) {
        setSel(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setSel(null);
        return;
      }
      // Only arm the menu when the selection originates in the chapter.
      if (!mainRef.current.contains(sel.anchorNode)) {
        return;
      }
      const range = sel.getRangeAt(0);
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

  // Dismiss the selection menu on plain clicks.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".sel-menu")) return;
      setSel(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const onSelectionAction = useCallback((id: SelectionAction) => {
    if (!sel) return;
    if (id === "ask" || id === "explain") {
      setAiOpen(true);
      setAiSeedPayload(sel.text);
      setAiSeed("selection-ask");
    } else if (id === "define") {
      setAiOpen(true);
      setAiSeedPayload(sel.text);
      setAiSeed("selection-ask");
    }
    // highlight / note are LATER — see SelectionMenu.
    setSel(null);
    window.getSelection()?.removeAllRanges();
  }, [sel]);

  // Context label for the AI panel.
  const chapterLabel = `Chapter ${chapter.index + 1}`;

  // -- Render ------------------------------------------------------------

  const isPill = tweaks.aiStyle === "pill";

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <ReaderTopBar
        bookTitle={book.title}
        chapterIndex={chapter.index}
        chaptersTotal={chapter.chapters_total}
        progressPct={progressPct}
        onOpenToc={() => setTocOpen(true)}
        onOpenHighlights={() => setHighlightsOpen(true)}
        onOpenTweaks={() => setTweaksOpen((v) => !v)}
        onAskToggle={() => setAiOpen((v) => !v)}
      />

      <div
        className="flex-1 relative overflow-hidden"
        style={{ display: "flex" }}
      >
        <div
          ref={mainRef}
          className="flex-1 flex"
          style={{
            background: "var(--paper)",
            marginRight: aiOpen && !isPill ? 440 : 0,
            transition: "margin-right 0.35s cubic-bezier(0.32, 0.72, 0.24, 1), background 0.4s ease",
          }}
        >
          <BookPage
            html={chapter.html}
            chapterIndex={chapter.index}
            chaptersTotal={chapter.chapters_total}
            bookTitle={book.title}
            chapterTitle={chapter.title}
            mode={mode}
          />
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

        {sel && (
          <SelectionMenu x={sel.x} y={sel.y} onAction={onSelectionAction} />
        )}
      </div>

      <ReaderBottomBar
        chapterIndex={chapter.index}
        chaptersTotal={chapter.chapters_total}
        prevHref={
          chapter.prev_index !== null ? `/read/${book.id}/${chapter.prev_index}` : null
        }
        nextHref={
          chapter.next_index !== null ? `/read/${book.id}/${chapter.next_index}` : null
        }
        minutesLeft={minutesLeft}
      />

      <TOCDrawer
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        book={book}
        currentIndex={chapter.index}
      />
      <HighlightsDrawer
        open={highlightsOpen}
        onClose={() => setHighlightsOpen(false)}
      />
      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)} />

      {/* Exposed so the AI panel can broadcast a quick-action seed. */}
      <QuickActionSeedBridge setSeed={setAiSeed} />
    </div>
  );
}

/**
 * Tiny helper so callers that don't have direct access to ReaderClient
 * state can still push a quick-action seed into the AI panel. Not used
 * externally yet — reserved for future "explain this margin note" flows.
 */
function QuickActionSeedBridge({
  setSeed,
}: {
  setSeed: (s: QuickActionId | "selection-ask" | null) => void;
}) {
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<QuickActionId>;
      setSeed(ev.detail);
    };
    window.addEventListener("glosse:ai-seed", handler as EventListener);
    return () =>
      window.removeEventListener("glosse:ai-seed", handler as EventListener);
  }, [setSeed]);
  return null;
}
