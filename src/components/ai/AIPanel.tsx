import { useEffect } from "react";

import { Icon } from "@/components/Icons";
import { AskBody } from "@/components/ai/AskBody";
import { FlashcardsBody } from "@/components/ai/FlashcardsBody";
import { QuizBody } from "@/components/ai/QuizBody";
import { MapBody } from "@/components/ai/MapBody";
import { HighlightsBody } from "@/components/ai/HighlightsBody";
import type { ReadingFocus } from "@/ai/types";
import type { QuizQuestion } from "@/ai";
import type { TocStructure, ChapterInfo, SectionInfo } from "@/lib/tocStructure";
import type { Highlight } from "@/ai/highlights";

export type AITab = "ask" | "flashcards" | "quiz" | "map" | "highlights";

type Props = {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  tab: AITab;
  onTabChange: (t: AITab) => void;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  currentPage: number;
  totalPages?: number;
  tocStructure: TocStructure;
  activeChapter: ChapterInfo | null;
  activeSection: SectionInfo | null;
  foliateBook: unknown | null;
  highlights: Highlight[];
  seedFocus?: ReadingFocus | null;
  /** Pre-built quiz from a selection action. Cleared once consumed. */
  seedQuiz?: QuizQuestion[] | null;
  /** Bump after selection-driven card insertion to refresh deck counts. */
  cardsRefreshKey?: number;
  onSeedConsumed?: () => void;
  onQuizSeedConsumed?: () => void;
  onJumpToHighlight?: (cfi: string) => void;
  onHighlightRemoved?: (id: string) => void;
};

const PANEL_WIDTH = 460;

/**
 * Unified AI sidebar for chat, review, maps, and saved passages.
 *
 * Tabs stay mounted so internal state like a mid-stream chat or a review
 * session survives tab switches.
 */
export function AIPanel({
  open,
  onClose,
  onOpenSettings,
  tab,
  onTabChange,
  bookId,
  bookTitle,
  bookAuthor,
  currentPage,
  totalPages,
  tocStructure,
  activeChapter,
  activeSection,
  foliateBook,
  highlights,
  seedFocus,
  seedQuiz,
  cardsRefreshKey,
  onSeedConsumed,
  onQuizSeedConsumed,
  onJumpToHighlight,
  onHighlightRemoved,
}: Props) {
  // Switching to Ask when a selection-seed arrives so the user sees it.
  useEffect(() => {
    if (seedFocus && tab !== "ask") onTabChange("ask");
  }, [seedFocus, tab, onTabChange]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: PANEL_WIDTH,
        transform: open ? "translateX(0)" : `translateX(${PANEL_WIDTH + 20}px)`,
        transition: "transform 0.3s cubic-bezier(0.32,0.72,0.24,1)",
        zIndex: 18,
        background: "var(--panel-bg)",
        borderLeft: "1px solid var(--rule-soft)",
        boxShadow: open ? "-12px 0 32px rgba(0,0,0,0.05)" : "none",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Header
        bookTitle={bookTitle}
        currentPage={currentPage}
        totalPages={totalPages}
        tab={tab}
        onTabChange={onTabChange}
        onOpenSettings={onOpenSettings}
        onClose={onClose}
      />

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <TabShell visible={tab === "ask"}>
          <AskBody
            active={tab === "ask" && open}
            onOpenSettings={onOpenSettings}
            bookId={bookId}
            bookTitle={bookTitle}
            bookAuthor={bookAuthor}
            currentPage={currentPage}
            totalPages={totalPages}
            foliateBook={foliateBook}
            seedFocus={seedFocus ?? null}
            onSeedConsumed={onSeedConsumed}
          />
        </TabShell>

        <TabShell visible={tab === "flashcards"}>
          <FlashcardsBody
            active={tab === "flashcards" && open}
            bookId={bookId}
            bookTitle={bookTitle}
            bookAuthor={bookAuthor}
            currentPage={currentPage}
            tocStructure={tocStructure}
            activeChapter={activeChapter}
            activeSection={activeSection}
            refreshKey={cardsRefreshKey}
          />
        </TabShell>

        <TabShell visible={tab === "quiz"}>
          <QuizBody
            active={tab === "quiz" && open}
            bookId={bookId}
            bookTitle={bookTitle}
            bookAuthor={bookAuthor}
            currentPage={currentPage}
            tocStructure={tocStructure}
            activeChapter={activeChapter}
            activeSection={activeSection}
            seedQuestions={seedQuiz}
            onSeedConsumed={onQuizSeedConsumed}
          />
        </TabShell>

        <TabShell visible={tab === "map"}>
          <MapBody
            active={tab === "map" && open}
            bookId={bookId}
            bookTitle={bookTitle}
            bookAuthor={bookAuthor}
            currentPage={currentPage}
          />
        </TabShell>

        <TabShell visible={tab === "highlights"}>
          <HighlightsBody
            highlights={highlights}
            onJump={(cfi) => onJumpToHighlight?.(cfi)}
            onRemoved={onHighlightRemoved}
          />
        </TabShell>
      </div>
    </div>
  );
}

// -- Header --------------------------------------------------------------

function Header({
  bookTitle,
  currentPage,
  totalPages,
  tab,
  onTabChange,
  onOpenSettings,
  onClose,
}: {
  bookTitle: string;
  currentPage: number;
  totalPages?: number;
  tab: AITab;
  onTabChange: (t: AITab) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        padding: "14px 16px 0",
        borderBottom: "1px solid var(--rule-soft)",
        background: "var(--panel-bg)",
      }}
    >
      <div className="flex items-center gap-[10px]" style={{ marginBottom: 12 }}>
        <div
          className="flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "var(--ink)",
            color: "var(--paper)",
          }}
        >
          <Icon.sparkle size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="truncate"
            style={{
              fontFamily: "var(--heading-stack)",
              fontSize: 14.5,
              fontWeight: 500,
              color: "var(--ink)",
            }}
          >
            Desk
          </div>
          <div
            className="uppercase truncate"
            style={{
              fontFamily: "var(--inter-stack)",
              fontSize: 10,
              color: "var(--ink-muted)",
              letterSpacing: 1.2,
              marginTop: 1,
            }}
          >
            {bookTitle} · p. {currentPage}
            {totalPages ? ` / ${totalPages}` : ""}
          </div>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onOpenSettings}
          title="AI settings"
          style={{ width: 30, height: 30 }}
        >
          <Icon.settings size={14} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="Close"
          style={{ width: 30, height: 30 }}
        >
          <Icon.close size={14} />
        </button>
      </div>

      <div className="flex items-stretch" style={{ gap: 2 }}>
        <Tab label="Ask" active={tab === "ask"} onClick={() => onTabChange("ask")} />
        <Tab
          label="Cards"
          active={tab === "flashcards"}
          onClick={() => onTabChange("flashcards")}
        />
        <Tab label="Quiz" active={tab === "quiz"} onClick={() => onTabChange("quiz")} />
        <Tab label="Map" active={tab === "map"} onClick={() => onTabChange("map")} />
        <Tab
          label="Saved"
          active={tab === "highlights"}
          onClick={() => onTabChange("highlights")}
        />
      </div>
    </div>
  );
}

function Tab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 8px",
        background: "transparent",
        border: "none",
        borderBottom: active
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        color: active ? "var(--ink)" : "var(--ink-muted)",
        fontFamily: "var(--inter-stack)",
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        letterSpacing: 0.3,
        cursor: "pointer",
        transition: "color 0.15s ease, border-color 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

function TabShell({
  visible,
  children,
}: {
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: visible ? "flex" : "none",
        flexDirection: "column",
      }}
    >
      {children}
    </div>
  );
}
