import { useCallback, useEffect, useRef, useState } from "react";

import {
  countCards,
  generateFlashcards,
  listDueCards,
  recordReview,
  type Grade,
  type QuizCard,
} from "@/ai";
import { errorToString } from "@/ai/utils/str";
import type {
  ChapterInfo,
  SectionInfo,
  TocStructure,
} from "@/lib/tocStructure";

import {
  BackRow,
  Chip,
  COUNTS,
  DIFFICULTIES,
  ErrorState,
  ScopeChipRow,
  Section,
  SectionsList,
  Status,
  TopicsSkeleton,
  buildStudyScope,
  cap,
  useStudySetup,
  type ScopeKind,
} from "./studyShared";

type Props = {
  active: boolean;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  currentPage: number;
  tocStructure: TocStructure;
  activeChapter: ChapterInfo | null;
  activeSection: SectionInfo | null;
};

type Phase =
  | { kind: "home"; counts: { total: number; dueNow: number } | null }
  | { kind: "setup" }
  | { kind: "generating"; message: string }
  | { kind: "review"; cards: QuizCard[]; index: number; revealed: boolean }
  | { kind: "done"; reviewed: number }
  | { kind: "error"; message: string };

export function FlashcardsBody({
  active,
  bookId,
  bookTitle,
  bookAuthor,
  currentPage,
  tocStructure,
  activeChapter,
  activeSection,
}: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "home", counts: null });

  const loadCounts = useCallback(async () => {
    try {
      const counts = await countCards(bookId);
      setPhase({ kind: "home", counts });
    } catch (err) {
      setPhase({
        kind: "error",
        message: errorToString(err),
      });
    }
  }, [bookId]);

  const needsInitialLoad = phase.kind === "home" && phase.counts === null;

  useEffect(() => {
    if (!active || !needsInitialLoad) return;
    void loadCounts();
  }, [active, loadCounts, needsInitialLoad]);

  const startReview = useCallback(async () => {
    try {
      const due = await listDueCards(bookId, 30);
      if (due.length === 0) {
        setPhase({ kind: "done", reviewed: 0 });
        return;
      }
      setPhase({ kind: "review", cards: due, index: 0, revealed: false });
    } catch (err) {
      setPhase({
        kind: "error",
        message: errorToString(err),
      });
    }
  }, [bookId]);

  const handleGenerate = useCallback(
    async (config: SetupConfig) => {
      setPhase({ kind: "generating", message: "Pulling passages…" });
      try {
        const scope = buildStudyScope(config, currentPage);
        setPhase({ kind: "generating", message: "Generating flashcards…" });
        await generateFlashcards({
          bookId,
          bookTitle,
          bookAuthor,
          scope,
          count: config.count,
          difficulty: config.difficulty,
          focusTopics: config.focusTopics,
          customFocus: config.customFocus || undefined,
        });
        const counts = await countCards(bookId);
        setPhase({ kind: "home", counts });
      } catch (err) {
        setPhase({
          kind: "error",
          message: errorToString(err),
        });
      }
    },
    [bookAuthor, bookId, bookTitle, currentPage],
  );

  const grade = useCallback(
    async (g: Grade) => {
      if (phase.kind !== "review") return;
      const current = phase.cards[phase.index];
      if (!current) return;
      try {
        await recordReview(current.id, g);
      } catch (err) {
        setPhase({
          kind: "error",
          message: errorToString(err),
        });
        return;
      }
      const nextIndex = phase.index + 1;
      if (nextIndex >= phase.cards.length) {
        setPhase({ kind: "done", reviewed: phase.cards.length });
      } else {
        setPhase({ ...phase, index: nextIndex, revealed: false });
      }
    },
    [phase],
  );

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {phase.kind === "home" && (
        <Home
          counts={phase.counts}
          onStartReview={() => void startReview()}
          onNewSet={() => setPhase({ kind: "setup" })}
        />
      )}

      {phase.kind === "setup" && (
        <Setup
          bookId={bookId}
          tocStructure={tocStructure}
          activeChapter={activeChapter}
          activeSection={activeSection}
          currentPage={currentPage}
          onBack={() => void loadCounts()}
          onGenerate={(c) => void handleGenerate(c)}
        />
      )}

      {phase.kind === "generating" && <Status text={phase.message} />}

      {phase.kind === "review" && (
        <Review
          card={phase.cards[phase.index]!}
          index={phase.index}
          total={phase.cards.length}
          revealed={phase.revealed}
          onReveal={() => setPhase({ ...phase, revealed: true })}
          onGrade={(g) => void grade(g)}
        />
      )}

      {phase.kind === "done" && (
        <Done reviewed={phase.reviewed} onBack={() => void loadCounts()} />
      )}

      {phase.kind === "error" && (
        <ErrorState message={phase.message} onRetry={() => void loadCounts()} />
      )}
    </div>
  );
}

// -- Home ---------------------------------------------------------------

function Home({
  counts,
  onStartReview,
  onNewSet,
}: {
  counts: { total: number; dueNow: number } | null;
  onStartReview: () => void;
  onNewSet: () => void;
}) {
  const total = counts?.total ?? 0;
  const dueNow = counts?.dueNow ?? 0;
  const isEmpty = total === 0;

  return (
    <div style={{ padding: "22px 22px 10px" }}>
      {isEmpty ? (
        <EmptyIntro
          title="Flashcards"
          blurb="Q/A cards you keep seeing until they stick. Answers include an explanation. The scheduler (FSRS) picks when each card comes back."
        />
      ) : (
        <StatCard total={total} dueNow={dueNow} />
      )}

      {!isEmpty && dueNow > 0 && (
        <button
          type="button"
          className="filled-btn"
          style={{ width: "100%", marginBottom: 10 }}
          onClick={onStartReview}
        >
          Start review · {dueNow} due
        </button>
      )}

      <button
        type="button"
        className={isEmpty ? "filled-btn" : "outline-btn"}
        style={{ width: "100%" }}
        onClick={onNewSet}
      >
        New flashcard set
      </button>

      {!isEmpty && dueNow === 0 && (
        <div
          className="italic"
          style={{
            marginTop: 16,
            fontFamily: "var(--serif-stack)",
            fontSize: 13,
            color: "var(--ink-muted)",
          }}
        >
          Nothing&apos;s due right now. FSRS scheduled your next reviews —
          generate a new set if you want more.
        </div>
      )}
    </div>
  );
}

// -- Setup --------------------------------------------------------------

type SetupConfig = {
  scope: ScopeKind;
  pickedChapter: ChapterInfo | null;
  selectedSectionIds: Set<string>;
  difficulty: (typeof DIFFICULTIES)[number];
  count: number;
  focusTopics: string[];
  customFocus: string;
};

function Setup({
  bookId,
  tocStructure,
  activeChapter,
  activeSection,
  currentPage,
  onBack,
  onGenerate,
}: {
  bookId: string;
  tocStructure: TocStructure;
  activeChapter: ChapterInfo | null;
  activeSection: SectionInfo | null;
  currentPage: number;
  onBack: () => void;
  onGenerate: (config: SetupConfig) => void;
}) {
  const setup = useStudySetup({
    bookId,
    tocStructure,
    activeChapter,
    activeSection,
    currentPage,
  });

  return (
    <div style={{ padding: "18px 22px 24px" }}>
      <BackRow title="New flashcard set" onBack={onBack} />

      <Section title="Scope">
        <ScopeChipRow setup={setup} currentPage={currentPage} />
      </Section>

      {setup.scope === "chapter" &&
        setup.pickedChapter &&
        setup.pickedChapter.sections.length > 0 && (
          <Section title="Sections">
            <SectionsList setup={setup} />
          </Section>
        )}

      <Section title="Difficulty">
        <div style={{ display: "flex", gap: 6 }}>
          {DIFFICULTIES.map((d) => (
            <Chip
              key={d}
              label={cap(d)}
              active={setup.difficulty === d}
              onClick={() => setup.setDifficulty(d)}
              compact
            />
          ))}
        </div>
      </Section>

      <Section title="Number of cards">
        <div style={{ display: "flex", gap: 6 }}>
          {COUNTS.map((n) => (
            <Chip
              key={n}
              label={String(n)}
              active={setup.count === n}
              onClick={() => setup.setCount(n)}
              compact
            />
          ))}
        </div>
      </Section>

      <Section
        title="Focus (optional)"
        hint={setup.topics === null ? "Analyzing content…" : undefined}
      >
        {setup.topics === null && <TopicsSkeleton />}
        {setup.topics !== null && setup.topics.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {setup.topics.map((t) => (
              <Chip
                key={t}
                label={t}
                active={setup.selectedTopics.has(t)}
                onClick={() => setup.toggleTopic(t)}
                compact
              />
            ))}
          </div>
        )}
        <input
          type="text"
          value={setup.customFocus}
          onChange={(e) => setup.setCustomFocus(e.target.value)}
          placeholder="e.g. Proofs, specific examples…"
          style={{
            marginTop: 10,
            width: "100%",
            padding: "9px 12px",
            fontFamily: "var(--serif-stack)",
            fontSize: 13.5,
            borderRadius: 8,
            border: "1px solid var(--rule)",
            background: "var(--paper)",
            color: "var(--ink)",
            outline: "none",
          }}
        />
      </Section>

      <button
        type="button"
        className="filled-btn"
        style={{ width: "100%", marginTop: 8 }}
        onClick={() =>
          onGenerate({
            scope: setup.scope,
            pickedChapter: setup.pickedChapter,
            selectedSectionIds: setup.selectedSectionIds,
            difficulty: setup.difficulty,
            count: setup.count,
            focusTopics: Array.from(setup.selectedTopics),
            customFocus: setup.customFocus.trim(),
          })
        }
      >
        Generate flashcard set
      </button>
    </div>
  );
}

// -- Review -------------------------------------------------------------

const GRADE_LABELS: Array<{ g: Grade; label: string; hint: string }> = [
  { g: "again", label: "Again", hint: "< 1m" },
  { g: "hard", label: "Hard", hint: "harder" },
  { g: "good", label: "Good", hint: "correct" },
  { g: "easy", label: "Easy", hint: "trivial" },
];

function Review({
  card,
  index,
  total,
  revealed,
  onReveal,
  onGrade,
}: {
  card: QuizCard;
  index: number;
  total: number;
  revealed: boolean;
  onReveal: () => void;
  onGrade: (g: Grade) => void;
}) {
  const onGradeRef = useRef(onGrade);
  const onRevealRef = useRef(onReveal);
  onGradeRef.current = onGrade;
  onRevealRef.current = onReveal;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (!revealed) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onRevealRef.current();
        }
        return;
      }
      if (e.key === "1") onGradeRef.current("again");
      else if (e.key === "2") onGradeRef.current("hard");
      else if (e.key === "3") onGradeRef.current("good");
      else if (e.key === "4") onGradeRef.current("easy");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [revealed]);

  return (
    <div style={{ padding: "22px 22px 10px", display: "flex", flexDirection: "column", gap: 14 }}>
      <ReviewProgressStrip index={index} total={total} />

      <div
        style={{
          position: "relative",
          padding: "24px 22px 22px",
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          borderRadius: 14,
          minHeight: 180,
          boxShadow:
            "0 1px 0 rgba(26,26,26,0.02), 0 6px 22px rgba(26,26,26,0.06), 0 1px 3px rgba(26,26,26,0.04)",
        }}
      >
        {/* Oversized serif glyph as a watermark — quiet bookplate feel. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 4,
            right: 14,
            fontFamily: "var(--heading-stack)",
            fontSize: 72,
            fontWeight: 500,
            fontStyle: "italic",
            color: "var(--rule-soft)",
            lineHeight: 1,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {revealed ? "A" : "Q"}
        </div>

        <div
          style={{
            position: "relative",
            fontFamily: "var(--serif-stack)",
            fontSize: 16.5,
            lineHeight: 1.55,
            color: "var(--ink)",
            marginBottom: revealed ? 14 : 0,
            whiteSpace: "pre-wrap",
          }}
        >
          {card.front}
        </div>
        {revealed ? (
          <>
            <div style={{ height: 1, background: "var(--rule-soft)", margin: "4px 0 14px" }} />
            <div
              style={{
                fontFamily: "var(--serif-stack)",
                fontSize: 15,
                lineHeight: 1.6,
                color: "var(--ink)",
                whiteSpace: "pre-wrap",
                marginBottom: card.explanation ? 12 : 0,
              }}
            >
              {card.back}
            </div>
            {card.explanation && (
              <div
                style={{
                  fontFamily: "var(--serif-stack)",
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: "var(--ink-soft)",
                  fontStyle: "italic",
                  whiteSpace: "pre-wrap",
                  paddingTop: 10,
                  borderTop: "1px dashed var(--rule-soft)",
                }}
              >
                {card.explanation}
              </div>
            )}
          </>
        ) : (
          <button type="button" className="outline-btn" style={{ marginTop: 16 }} onClick={onReveal}>
            Reveal (Space)
          </button>
        )}
      </div>

      {revealed && (
        <div className="flex gap-1" style={{ marginTop: 6 }}>
          {GRADE_LABELS.map((g, i) => (
            <GradeButton key={g.g} {...g} keyNum={i + 1} onClick={() => onGrade(g.g)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewProgressStrip({ index, total }: { index: number; total: number }) {
  return (
    <div
      className="flex items-center"
      style={{ gap: 10, justifyContent: "space-between" }}
    >
      <div
        className="uppercase"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 10,
          letterSpacing: 1.4,
          color: "var(--ink-muted)",
        }}
      >
        Card {index + 1} / {total}
      </div>
      <div className="flex items-center" style={{ gap: 3 }}>
        {Array.from({ length: Math.min(total, 14) }).map((_, i) => {
          const active = i <= index;
          return (
            <span
              key={i}
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: active ? "var(--ink)" : "var(--rule)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function GradeButton({
  g,
  label,
  hint,
  keyNum,
  onClick,
}: {
  g: Grade;
  label: string;
  hint: string;
  keyNum: number;
  onClick: () => void;
}) {
  const accent =
    g === "again" ? "#c94a3b" : g === "hard" ? "#c9802b" : g === "good" ? "#4a7c59" : "#3a5a8c";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 4px",
        borderRadius: 10,
        background: "var(--paper)",
        border: `1px solid ${accent}55`,
        color: "var(--ink)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      <span style={{ fontFamily: "var(--inter-stack)", fontSize: 13, fontWeight: 600, color: accent }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--mono-stack)", fontSize: 10, color: "var(--ink-muted)" }}>
        {keyNum} · {hint}
      </span>
    </button>
  );
}

// -- Stats + intro ------------------------------------------------------

function StatCard({ total, dueNow }: { total: number; dueNow: number }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: "14px 16px",
        background: "rgba(127,127,127,0.05)",
        border: "1px solid var(--rule-soft)",
        borderRadius: 12,
        marginBottom: 14,
      }}
    >
      <Stat value={total} label="Cards" />
      <div style={{ width: 1, height: 28, background: "var(--rule-soft)" }} />
      <Stat value={dueNow} label="Due now" accent={dueNow > 0} />
    </div>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center" style={{ flex: 1 }}>
      <div
        style={{
          fontFamily: "var(--mono-stack)",
          fontSize: 22,
          fontWeight: 600,
          color: accent ? "var(--accent)" : "var(--ink)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        className="uppercase"
        style={{
          marginTop: 4,
          fontFamily: "var(--inter-stack)",
          fontSize: 10,
          letterSpacing: 1.2,
          color: "var(--ink-muted)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function EmptyIntro({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontFamily: "var(--heading-stack)",
          fontSize: 17,
          fontWeight: 500,
          color: "var(--ink)",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 13.5,
          lineHeight: 1.55,
          color: "var(--ink-muted)",
          margin: 0,
        }}
      >
        {blurb}
      </p>
    </div>
  );
}

function Done({ reviewed, onBack }: { reviewed: number; onBack: () => void }) {
  return (
    <div style={{ padding: "36px 24px" }}>
      <div
        style={{
          fontFamily: "var(--heading-stack)",
          fontSize: 18,
          color: "var(--ink)",
          marginBottom: 4,
        }}
      >
        {reviewed > 0
          ? `Reviewed ${reviewed} card${reviewed === 1 ? "" : "s"}.`
          : "Nothing due right now."}
      </div>
      <div
        className="italic"
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 13.5,
          color: "var(--ink-muted)",
          marginBottom: 16,
        }}
      >
        FSRS picked when each one comes back — based on how easy it felt.
      </div>
      <button type="button" className="outline-btn" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
