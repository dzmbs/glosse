import { useEffect, useMemo, useRef, useState } from "react";

import {
  proposeFocusTopics,
  type StudyDifficulty,
  type StudyScope,
} from "@/ai";
import type { ChapterInfo, SectionInfo, TocStructure } from "@/lib/tocStructure";

export const DIFFICULTIES: StudyDifficulty[] = ["easy", "medium", "hard"];
export const COUNTS = [5, 10, 15, 20] as const;

export type ScopeKind = "all" | "chapter";

type ScopeInputs = {
  scope: ScopeKind;
  pickedChapter: ChapterInfo | null;
  /** Subset of section ids the user has unchecked. Empty = the whole
   *  chapter; populated = chapter narrowed to the checked sections. */
  selectedSectionIds: Set<string> | null;
};

/** Translate a UI scope selection into the StudyScope the AI layer expects. */
export function buildStudyScope(
  inputs: ScopeInputs,
  currentPage: number,
): StudyScope {
  if (inputs.scope === "chapter" && inputs.pickedChapter) {
    const ch = inputs.pickedChapter;
    const sel = inputs.selectedSectionIds;
    // No sections, or every section ticked → whole chapter.
    const allSelected =
      ch.sections.length === 0 ||
      sel === null ||
      ch.sections.every((s) => sel.has(s.id));
    if (allSelected) {
      return {
        kind: "chapter",
        chapterTitle: ch.title,
        titles: ch.allTitles,
        maxPage: currentPage,
      };
    }
    const checkedSections = ch.sections.filter((s) => sel.has(s.id));
    const titles = [ch.title, ...checkedSections.map((s) => s.title)];
    const narrowedTo =
      checkedSections.length === 1
        ? checkedSections[0]!.title
        : `${checkedSections.length} sections`;
    return {
      kind: "chapter",
      chapterTitle: ch.title,
      titles,
      narrowedTo,
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

  // Body chapters at or before the current reading position. Front- and
  // back-matter are filtered out so the picker stays focused on study
  // material; spoiler-safe by index — we never expose later chapters.
  const readChapters = useMemo(() => {
    if (!activeChapter) return [];
    return tocStructure.bodyChapters.filter(
      (c) => c.chapterIndex <= activeChapter.chapterIndex,
    );
  }, [tocStructure, activeChapter]);

  // Default scope: chapter if the reader is in a body chapter; otherwise
  // fall back to "all" (front-matter, no chapter picker available).
  const inBodyChapter =
    !!activeChapter && readChapters.some((c) => c.id === activeChapter.id);

  const [scope, setScope] = useState<ScopeKind>(inBodyChapter ? "chapter" : "all");
  const [pickedChapterId, setPickedChapterId] = useState<string | null>(
    inBodyChapter ? (activeChapter?.id ?? null) : (readChapters[0]?.id ?? null),
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

  const pickedChapter: ChapterInfo | null = useMemo(() => {
    const fromPicker = readChapters.find((c) => c.id === pickedChapterId);
    if (fromPicker) return fromPicker;
    return inBodyChapter ? activeChapter : (readChapters[0] ?? null);
  }, [readChapters, pickedChapterId, activeChapter, inBodyChapter]);

  // Per-chapter section selection: full set selected by default. Switch
  // re-selects all sections when the picked chapter changes — otherwise
  // the user would silently inherit narrowing from a previous chapter.
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(
    () => new Set(pickedChapter?.sections.map((s) => s.id) ?? []),
  );
  useEffect(() => {
    setSelectedSectionIds(
      new Set(pickedChapter?.sections.map((s) => s.id) ?? []),
    );
  }, [pickedChapter]);

  const toggleSection = (id: string) => {
    setSelectedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllSections = () => {
    setSelectedSectionIds(
      new Set(pickedChapter?.sections.map((s) => s.id) ?? []),
    );
  };
  const clearSections = () => setSelectedSectionIds(new Set());

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
          scope,
          pickedChapter,
          selectedSectionIds: scope === "chapter" ? selectedSectionIds : null,
        },
        currentPage,
      );
      const result = await proposeFocusTopics(bookId, studyScope);
      if (!cancelled) setTopics(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, scope, pickedChapter, selectedSectionIds, currentPage]);

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
    selectedSectionIds,
    toggleSection,
    selectAllSections,
    clearSections,
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
 * "Everything I've read" + a chapter picker. Section narrowing is done
 * separately, via SectionsList.
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
    </div>
  );
}

/**
 * Section checkboxes shown when chapter scope is active. All sections
 * checked by default; user can narrow by un-ticking. Active section
 * (the one the reader is on) gets a "now" marker.
 */
export function SectionsList({
  setup,
}: {
  setup: ReturnType<typeof useStudySetup>;
}) {
  if (setup.scope !== "chapter" || !setup.pickedChapter) return null;
  const sections = setup.pickedChapter.sections;
  if (sections.length === 0) return null;

  const allOn = sections.every((s) => setup.selectedSectionIds.has(s.id));
  const noneOn = sections.every((s) => !setup.selectedSectionIds.has(s.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 10,
          marginBottom: 4,
        }}
      >
        <SubtleButton
          disabled={allOn}
          onClick={setup.selectAllSections}
          label="Select all"
        />
        <SubtleButton
          disabled={noneOn}
          onClick={setup.clearSections}
          label="Clear"
        />
      </div>
      {sections.map((section) => {
        const checked = setup.selectedSectionIds.has(section.id);
        const isCurrent = setup.activeSection?.id === section.id;
        return (
          <CheckboxRow
            key={section.id}
            label={section.title}
            checked={checked}
            badge={isCurrent ? "now" : undefined}
            onToggle={() => setup.toggleSection(section.id)}
          />
        );
      })}
    </div>
  );
}

function SubtleButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        background: "transparent",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        padding: "2px 4px",
        fontFamily: "var(--inter-stack)",
        fontSize: 11,
        fontWeight: 500,
        color: disabled ? "var(--ink-muted)" : "var(--accent, var(--ink))",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

function CheckboxRow({
  label,
  checked,
  badge,
  onToggle,
}: {
  label: string;
  checked: boolean;
  badge?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 8px",
        borderRadius: 6,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: "1.5px solid",
          borderColor: checked ? "var(--ink)" : "var(--rule)",
          background: checked ? "var(--ink)" : "transparent",
          color: "var(--paper)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {checked ? "✓" : ""}
      </span>
      <span
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 12.5,
          color: "var(--ink)",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      {badge && (
        <span
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: "var(--ink-muted)",
            border: "1px solid var(--rule)",
            borderRadius: 4,
            padding: "1px 6px",
          }}
        >
          {badge}
        </span>
      )}
    </button>
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
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    // Defer one frame so the popover has laid out before we scroll.
    const id = requestAnimationFrame(() => {
      selectedRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      cancelAnimationFrame(id);
    };
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
                ref={selected ? selectedRef : null}
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
