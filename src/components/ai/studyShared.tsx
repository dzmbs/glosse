import { useEffect, useMemo, useRef, useState } from "react";

import {
  proposeFocusTopics,
  type StudyDifficulty,
  type StudyScope,
} from "@/ai";
import type { ChapterInfo, SectionInfo, TocStructure } from "@/lib/tocStructure";

export const DIFFICULTIES: StudyDifficulty[] = ["easy", "medium", "hard"];
export const COUNTS = [5, 10, 15, 20] as const;

export type ScopeKind = "all" | "chapter" | "section";

type ScopeInputs = {
  scope: ScopeKind;
  pickedChapter: ChapterInfo | null;
  activeSection: SectionInfo | null;
};

/** Translate a UI scope selection into the StudyScope the AI layer expects. */
export function buildStudyScope(
  inputs: ScopeInputs,
  currentPage: number,
): StudyScope {
  if (inputs.scope === "section" && inputs.activeSection && inputs.pickedChapter) {
    return {
      kind: "section",
      sectionTitle: inputs.activeSection.title,
      chapterTitle: inputs.pickedChapter.title,
      maxPage: currentPage,
    };
  }
  if (inputs.scope === "chapter" && inputs.pickedChapter) {
    return {
      kind: "chapter",
      chapterTitle: inputs.pickedChapter.title,
      titles: inputs.pickedChapter.allTitles,
      maxPage: currentPage,
    };
  }
  return { kind: "all", maxPage: currentPage };
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function useStudySetup(opts: {
  bookId: string;
  tocStructure: TocStructure;
  activeChapter: ChapterInfo | null;
  activeSection: SectionInfo | null;
  currentPage: number;
}) {
  const { bookId, tocStructure, activeChapter, activeSection, currentPage } =
    opts;

  // Chapters at or before the current reading position. Spoiler-safe —
  // we never expose later chapters, even though the index could.
  const readChapters = useMemo(() => {
    if (!activeChapter) return [];
    return tocStructure.chapters.filter(
      (c) => c.chapterIndex <= activeChapter.chapterIndex,
    );
  }, [tocStructure, activeChapter]);

  const [scope, setScope] = useState<ScopeKind>(
    activeChapter ? "chapter" : "all",
  );
  const [pickedChapterId, setPickedChapterId] = useState<string | null>(
    activeChapter?.id ?? null,
  );
  // Snap the picker to the current chapter as the reader moves through
  // the book, but only when the picker is still on the previously-active
  // chapter (so an explicit user override sticks).
  useEffect(() => {
    setPickedChapterId((prev) => {
      if (!activeChapter) return prev;
      if (prev === null) return activeChapter.id;
      const stillReadable = readChapters.some((c) => c.id === prev);
      if (!stillReadable) return activeChapter.id;
      return prev;
    });
  }, [activeChapter, readChapters]);

  const pickedChapter: ChapterInfo | null = useMemo(
    () => readChapters.find((c) => c.id === pickedChapterId) ?? activeChapter,
    [readChapters, pickedChapterId, activeChapter],
  );

  // Section scope only meaningful when reading inside a section AND the
  // picker is still on the current chapter — otherwise the section the
  // user is in doesn't belong to the picked chapter.
  const sectionAvailable =
    !!activeSection && pickedChapter?.id === activeChapter?.id;

  const [difficulty, setDifficulty] = useState<StudyDifficulty>("medium");
  const [count, setCount] = useState<number>(10);
  const [topics, setTopics] = useState<string[] | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [customFocus, setCustomFocus] = useState("");

  useEffect(() => {
    let cancelled = false;
    setTopics(null);
    setSelectedTopics(new Set());
    (async () => {
      const studyScope = buildStudyScope(
        {
          scope: scope === "section" && !sectionAvailable ? "all" : scope,
          pickedChapter,
          activeSection,
        },
        currentPage,
      );
      const result = await proposeFocusTopics(bookId, studyScope);
      if (!cancelled) setTopics(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    bookId,
    scope,
    pickedChapter,
    activeSection,
    sectionAvailable,
    currentPage,
  ]);

  const toggleTopic = (t: string) => {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  return {
    scope,
    setScope,
    pickedChapter,
    pickedChapterId,
    setPickedChapterId,
    readChapters,
    activeSection,
    sectionAvailable,
    difficulty,
    setDifficulty,
    count,
    setCount,
    topics,
    selectedTopics,
    toggleTopic,
    customFocus,
    setCustomFocus,
  };
}

/**
 * Shared scope chip row used by Quiz and Flashcards setup screens.
 * Renders "Everything I've read" + a chapter picker + an optional
 * "Current section" chip when a section is being read.
 */
export function ScopeChipRow({
  setup,
  currentPage,
}: {
  setup: ReturnType<typeof useStudySetup>;
  currentPage: number;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <Chip
        label="Everything I've read"
        sub={`p. 1–${currentPage}`}
        active={setup.scope === "all"}
        onClick={() => setup.setScope("all")}
      />
      <ChapterPickerChip
        active={setup.scope === "chapter"}
        pickedTitle={setup.pickedChapter?.title ?? null}
        chapters={setup.readChapters}
        pickedId={setup.pickedChapterId}
        onPick={setup.setPickedChapterId}
        onActivate={() => setup.setScope("chapter")}
        disabled={setup.readChapters.length === 0}
      />
      {setup.sectionAvailable && setup.activeSection && (
        <Chip
          label="Current section"
          sub={setup.activeSection.title}
          active={setup.scope === "section"}
          onClick={() => setup.setScope("section")}
        />
      )}
    </div>
  );
}

// -- Primitives ---------------------------------------------------------

export function Chip({
  label,
  sub,
  active,
  disabled,
  compact,
  onClick,
}: {
  label: string;
  sub?: string;
  active: boolean;
  disabled?: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        flex: compact ? 1 : "0 1 auto",
        padding: compact ? "7px 10px" : "8px 12px",
        borderRadius: 8,
        background: active ? "var(--ink)" : "var(--paper)",
        color: active ? "var(--paper)" : disabled ? "var(--ink-muted)" : "var(--ink)",
        border: active ? "1px solid var(--ink)" : "1px solid var(--rule)",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 1,
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.12s ease, color 0.12s ease, border-color 0.12s ease",
        textAlign: "left",
      }}
    >
      <span
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: compact ? 12 : 13,
          fontWeight: active ? 600 : 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        {label}
      </span>
      {sub && (
        <span
          style={{
            fontFamily: "var(--mono-stack)",
            fontSize: 10,
            color: active ? "rgba(255,255,255,0.65)" : "var(--ink-muted)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {sub}
        </span>
      )}
    </button>
  );
}

/**
 * Chip whose body acts like the regular Chip but with a chevron that
 * opens a dropdown of selectable chapters. Activating any chapter both
 * picks it and switches scope to "chapter".
 */
export function ChapterPickerChip({
  active,
  pickedTitle,
  chapters,
  pickedId,
  onPick,
  onActivate,
  disabled,
}: {
  active: boolean;
  pickedTitle: string | null;
  chapters: Array<{ id: string; title: string }>;
  pickedId: string | null;
  onPick: (id: string) => void;
  onActivate: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const showPicker = chapters.length > 1;

  return (
    <div ref={ref} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (!active) onActivate();
          else if (showPicker) setOpen((v) => !v);
        }}
        style={{
          width: "100%",
          padding: "7px 10px",
          borderRadius: 8,
          background: active ? "var(--ink)" : "var(--paper)",
          color: active
            ? "var(--paper)"
            : disabled
              ? "var(--ink-muted)"
              : "var(--ink)",
          border: active ? "1px solid var(--ink)" : "1px solid var(--rule)",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          opacity: disabled ? 0.5 : 1,
          transition:
            "background 0.12s ease, color 0.12s ease, border-color 0.12s ease",
          textAlign: "left",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 1,
            minWidth: 0,
            flex: 1,
          }}
        >
          <span
            style={{
              fontFamily: "var(--inter-stack)",
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            Chapter
          </span>
          <span
            style={{
              fontFamily: "var(--mono-stack)",
              fontSize: 10,
              color: active ? "rgba(255,255,255,0.65)" : "var(--ink-muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {pickedTitle ?? "no chapter"}
          </span>
        </div>
        {showPicker && (
          <span
            style={{
              fontSize: 12,
              color: active ? "rgba(255,255,255,0.65)" : "var(--ink-muted)",
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 0.12s ease",
            }}
          >
            ▾
          </span>
        )}
      </button>
      {open && showPicker && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 240,
            overflowY: "auto",
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: 8,
            boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
            zIndex: 30,
            padding: 4,
          }}
        >
          {chapters.map((c) => {
            const selected = c.id === pickedId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onPick(c.id);
                  if (!active) onActivate();
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  border: "none",
                  background: selected ? "var(--ink)" : "transparent",
                  color: selected ? "var(--paper)" : "var(--ink)",
                  cursor: "pointer",
                  borderRadius: 6,
                  fontFamily: "var(--inter-stack)",
                  fontSize: 12,
                  fontWeight: selected ? 600 : 500,
                  textAlign: "left",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {c.title}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <div
          className="uppercase"
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 1.4,
            color: "var(--ink-muted)",
          }}
        >
          {title}
        </div>
        {hint && (
          <div
            className="italic"
            style={{
              fontFamily: "var(--serif-stack)",
              fontSize: 11.5,
              color: "var(--ink-muted)",
            }}
          >
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function TopicsSkeleton() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {[68, 84, 52, 72, 96, 60].map((w, i) => (
        <div
          key={i}
          style={{
            width: w,
            height: 28,
            borderRadius: 8,
            background: "rgba(127,127,127,0.08)",
            border: "1px solid var(--rule-soft)",
          }}
        />
      ))}
    </div>
  );
}

export function BackRow({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-[10px]" style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "4px 8px 4px 0",
          color: "var(--ink-muted)",
          fontFamily: "var(--inter-stack)",
          fontSize: 12,
        }}
      >
        ← Back
      </button>
      <div
        style={{
          fontFamily: "var(--heading-stack)",
          fontSize: 15,
          fontWeight: 500,
          color: "var(--ink)",
        }}
      >
        {title}
      </div>
    </div>
  );
}

export function Status({ text }: { text: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const startedAt = performance.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((performance.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [text]);
  return (
    <div
      className="italic"
      style={{
        padding: "44px 24px",
        textAlign: "center",
        fontFamily: "var(--serif-stack)",
        fontSize: 14,
        color: "var(--ink-muted)",
      }}
    >
      <div>{text}</div>
      {elapsed >= 5 && (
        <div
          style={{
            marginTop: 10,
            fontFamily: "var(--mono-stack)",
            fontSize: 11,
            color: "var(--ink-muted)",
            opacity: 0.75,
          }}
        >
          {formatElapsed(elapsed)}
          {elapsed >= 60 && " — local models can take a minute"}
        </div>
      )}
    </div>
  );
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = "Try again",
}: {
  message: string;
  onRetry: () => void;
  retryLabel?: string;
}) {
  return (
    <div style={{ padding: "22px" }}>
      <div
        style={{
          fontFamily: "var(--heading-stack)",
          fontSize: 15,
          fontWeight: 500,
          color: "var(--ink)",
          marginBottom: 6,
        }}
      >
        Something broke
      </div>
      <div
        style={{
          fontFamily: "var(--mono-stack)",
          fontSize: 11.5,
          color: "var(--ink-muted)",
          marginBottom: 12,
          whiteSpace: "pre-wrap",
        }}
      >
        {message}
      </div>
      <button type="button" className="outline-btn" onClick={onRetry}>
        {retryLabel}
      </button>
    </div>
  );
}
