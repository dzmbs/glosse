import { useEffect, useRef, useState } from "react";

import {
  generateQuizSession,
  type McqQuestion,
  type QuestionType,
  type QuizQuestion,
  type TfQuestion,
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

type Answer =
  | { kind: "mcq"; questionId: string; index: number; correct: boolean }
  | { kind: "tf"; questionId: string; value: boolean; correct: boolean };

type Phase =
  | { kind: "home" }
  | { kind: "setup" }
  | { kind: "generating"; message: string }
  | {
      kind: "session";
      questions: QuizQuestion[];
      index: number;
      answered: Answer | null;
      history: Answer[];
    }
  | { kind: "results"; questions: QuizQuestion[]; history: Answer[] }
  | { kind: "error"; message: string };

const QUESTION_TYPES: Array<{ id: QuestionType; label: string }> = [
  { id: "mcq", label: "Multiple Choice" },
  { id: "tf", label: "True / False" },
  { id: "mixed", label: "Mixed" },
];

export function QuizBody({
  active,
  bookId,
  bookTitle,
  bookAuthor,
  currentPage,
  tocStructure,
  activeChapter,
  activeSection,
}: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "home" });

  const prevActiveRef = useRef(active);
  useEffect(() => {
    if (prevActiveRef.current && !active && phase.kind === "results") {
      setPhase({ kind: "home" });
    }
    prevActiveRef.current = active;
  }, [active, phase.kind]);

  const handleGenerate = async (config: QuizConfig) => {
    setPhase({ kind: "generating", message: "Pulling passages…" });
    try {
      const scope = buildStudyScope(config, currentPage);
      setPhase({ kind: "generating", message: "Writing questions…" });
      const questions = await generateQuizSession({
        bookId,
        bookTitle,
        bookAuthor,
        scope,
        count: config.count,
        difficulty: config.difficulty,
        questionType: config.questionType,
        focusTopics: config.focusTopics,
        customFocus: config.customFocus || undefined,
      });
      if (questions.length === 0) {
        setPhase({
          kind: "error",
          message: "No questions generated. Try a different scope or focus.",
        });
        return;
      }
      setPhase({ kind: "session", questions, index: 0, answered: null, history: [] });
    } catch (err) {
      setPhase({
        kind: "error",
        message: errorToString(err),
      });
    }
  };

  const handleMcqAnswer = (i: number) => {
    if (phase.kind !== "session" || phase.answered) return;
    const q = phase.questions[phase.index]!;
    if (q.kind !== "mcq") return;
    const answer: Answer = {
      kind: "mcq",
      questionId: q.id,
      index: i,
      correct: i === q.correctIndex,
    };
    setPhase({ ...phase, answered: answer });
  };

  const handleTfAnswer = (v: boolean) => {
    if (phase.kind !== "session" || phase.answered) return;
    const q = phase.questions[phase.index]!;
    if (q.kind !== "tf") return;
    const answer: Answer = {
      kind: "tf",
      questionId: q.id,
      value: v,
      correct: v === q.answer,
    };
    setPhase({ ...phase, answered: answer });
  };

  const handleNext = () => {
    if (phase.kind !== "session" || !phase.answered) return;
    const nextHistory = [...phase.history, phase.answered];
    const nextIndex = phase.index + 1;
    if (nextIndex >= phase.questions.length) {
      setPhase({ kind: "results", questions: phase.questions, history: nextHistory });
    } else {
      setPhase({ ...phase, index: nextIndex, answered: null, history: nextHistory });
    }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {phase.kind === "home" && <Home onStart={() => setPhase({ kind: "setup" })} />}

      {phase.kind === "setup" && (
        <Setup
          bookId={bookId}
          tocStructure={tocStructure}
          activeChapter={activeChapter}
          activeSection={activeSection}
          currentPage={currentPage}
          onBack={() => setPhase({ kind: "home" })}
          onGenerate={(c) => void handleGenerate(c)}
        />
      )}

      {phase.kind === "generating" && <Status text={phase.message} />}

      {phase.kind === "session" && (
        <Session
          question={phase.questions[phase.index]!}
          index={phase.index}
          total={phase.questions.length}
          answered={phase.answered}
          onMcqAnswer={handleMcqAnswer}
          onTfAnswer={handleTfAnswer}
          onNext={handleNext}
        />
      )}

      {phase.kind === "results" && (
        <Results
          questions={phase.questions}
          history={phase.history}
          onAgain={() => setPhase({ kind: "setup" })}
          onHome={() => setPhase({ kind: "home" })}
        />
      )}

      {phase.kind === "error" && (
        <ErrorState
          message={phase.message}
          onRetry={() => setPhase({ kind: "home" })}
          retryLabel="Back"
        />
      )}
    </div>
  );
}

// -- Home ---------------------------------------------------------------

function Home({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ padding: "24px 22px" }}>
      <div
        style={{
          fontFamily: "var(--heading-stack)",
          fontSize: 17,
          fontWeight: 500,
          color: "var(--ink)",
          marginBottom: 8,
        }}
      >
        Quiz
      </div>
      <p
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 13.5,
          lineHeight: 1.55,
          color: "var(--ink-muted)",
          margin: 0,
          marginBottom: 16,
        }}
      >
        A one-shot check on what you&apos;ve read. Multiple choice or true/false,
        tap to answer, see the explanation. Nothing gets saved — it&apos;s just
        a pulse check.
      </p>

      <HowItWorks />

      <button
        type="button"
        className="filled-btn"
        style={{ width: "100%", marginTop: 14 }}
        onClick={onStart}
      >
        New quiz
      </button>
    </div>
  );
}

function HowItWorks() {
  const items = [
    { t: "Pick a scope", d: "Current chapter or everything you've read." },
    { t: "Pick difficulty + count", d: "5–20 questions, easy to hard." },
    { t: "Pick format", d: "Multiple choice, true/false, or mixed." },
    { t: "Answer with a tap", d: "See if you were right + an explanation." },
  ];
  return (
    <div
      style={{
        padding: "14px 16px",
        background: "rgba(127,127,127,0.05)",
        border: "1px solid var(--rule-soft)",
        borderRadius: 12,
      }}
    >
      {items.map((it, i) => (
        <div
          key={it.t}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "baseline",
            marginTop: i === 0 ? 0 : 8,
          }}
        >
          <div
            style={{
              fontFamily: "var(--mono-stack)",
              fontSize: 11,
              color: "var(--ink-muted)",
              width: 16,
              flexShrink: 0,
            }}
          >
            {i + 1}.
          </div>
          <div>
            <div
              style={{
                fontFamily: "var(--inter-stack)",
                fontSize: 12.5,
                fontWeight: 500,
                color: "var(--ink)",
              }}
            >
              {it.t}
            </div>
            <div
              style={{
                fontFamily: "var(--serif-stack)",
                fontSize: 12.5,
                color: "var(--ink-muted)",
                lineHeight: 1.5,
              }}
            >
              {it.d}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// -- Setup --------------------------------------------------------------

type QuizConfig = {
  scope: ScopeKind;
  pickedChapter: ChapterInfo | null;
  activeSection: SectionInfo | null;
  difficulty: (typeof DIFFICULTIES)[number];
  count: number;
  questionType: QuestionType;
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
  onGenerate: (config: QuizConfig) => void;
}) {
  const setup = useStudySetup({
    bookId,
    tocStructure,
    activeChapter,
    activeSection,
    currentPage,
  });
  const [questionType, setQuestionType] = useState<QuestionType>("mcq");

  return (
    <div style={{ padding: "18px 22px 24px" }}>
      <BackRow title="New quiz" onBack={onBack} />

      <Section title="Scope">
        <ScopeChipRow setup={setup} currentPage={currentPage} />
      </Section>

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

      <Section title="Number of questions">
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

      <Section title="Question type">
        <div style={{ display: "flex", gap: 6 }}>
          {QUESTION_TYPES.map((qt) => (
            <Chip
              key={qt.id}
              label={qt.label}
              active={questionType === qt.id}
              onClick={() => setQuestionType(qt.id)}
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
          placeholder="e.g. Chapter 3, key definitions…"
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
            activeSection: setup.activeSection,
            difficulty: setup.difficulty,
            count: setup.count,
            questionType,
            focusTopics: Array.from(setup.selectedTopics),
            customFocus: setup.customFocus.trim(),
          })
        }
      >
        Generate quiz
      </button>
    </div>
  );
}

// -- Session ------------------------------------------------------------

function Session({
  question,
  index,
  total,
  answered,
  onMcqAnswer,
  onTfAnswer,
  onNext,
}: {
  question: QuizQuestion;
  index: number;
  total: number;
  answered: Answer | null;
  onMcqAnswer: (i: number) => void;
  onTfAnswer: (v: boolean) => void;
  onNext: () => void;
}) {
  return (
    <div style={{ padding: "22px 22px 10px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        className="flex items-center justify-between"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 10,
          letterSpacing: 1.4,
          color: "var(--ink-muted)",
          textTransform: "uppercase",
        }}
      >
        <span>Question {index + 1} / {total}</span>
        <span>{question.kind === "mcq" ? "Multiple choice" : "True / false"}</span>
      </div>

      <ProgressBar current={index} total={total} />

      <div
        style={{
          padding: "18px",
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          borderRadius: 14,
        }}
      >
        <div
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: 16,
            lineHeight: 1.55,
            color: "var(--ink)",
            marginBottom: 14,
            whiteSpace: "pre-wrap",
          }}
        >
          {question.question}
        </div>

        {question.kind === "mcq" ? (
          <McqOptions q={question} answered={answered} onAnswer={onMcqAnswer} />
        ) : (
          <TfOptions q={question} answered={answered} onAnswer={onTfAnswer} />
        )}

        {answered && (
          <Explanation
            correct={answered.correct}
            explanation={question.explanation}
            sourcePage={question.sourcePage}
          />
        )}
      </div>

      {answered && (
        <button type="button" className="filled-btn" style={{ width: "100%" }} onClick={onNext}>
          {index + 1 >= total ? "See results" : "Next question"}
        </button>
      )}
    </div>
  );
}

function McqOptions({
  q,
  answered,
  onAnswer,
}: {
  q: McqQuestion;
  answered: Answer | null;
  onAnswer: (i: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {q.options.map((opt, i) => {
        const isSelected = answered?.kind === "mcq" && answered.index === i;
        const isCorrect = !!answered && i === q.correctIndex;
        const state: OptionState = !answered
          ? "idle"
          : isCorrect
            ? "correct"
            : isSelected
              ? "wrong"
              : "dimmed";
        return (
          <OptionButton
            key={i}
            state={state}
            disabled={!!answered}
            onClick={() => onAnswer(i)}
            label={opt}
            marker={String.fromCharCode(97 + i)}
          />
        );
      })}
    </div>
  );
}

function TfOptions({
  q,
  answered,
  onAnswer,
}: {
  q: TfQuestion;
  answered: Answer | null;
  onAnswer: (v: boolean) => void;
}) {
  const options: Array<{ v: boolean; label: string }> = [
    { v: true, label: "True" },
    { v: false, label: "False" },
  ];
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {options.map((o) => {
        const isSelected = answered?.kind === "tf" && answered.value === o.v;
        const isCorrect = !!answered && q.answer === o.v;
        const state: OptionState = !answered
          ? "idle"
          : isCorrect
            ? "correct"
            : isSelected
              ? "wrong"
              : "dimmed";
        return (
          <OptionButton
            key={o.label}
            state={state}
            disabled={!!answered}
            onClick={() => onAnswer(o.v)}
            label={o.label}
            block
          />
        );
      })}
    </div>
  );
}

type OptionState = "idle" | "correct" | "wrong" | "dimmed";

function OptionButton({
  state,
  label,
  marker,
  disabled,
  block,
  onClick,
}: {
  state: OptionState;
  label: string;
  marker?: string;
  disabled?: boolean;
  block?: boolean;
  onClick: () => void;
}) {
  const bg =
    state === "correct"
      ? "rgba(74,124,89,0.10)"
      : state === "wrong"
        ? "rgba(201,74,59,0.08)"
        : "var(--paper)";
  const border =
    state === "correct" ? "#4a7c59" : state === "wrong" ? "#c94a3b" : "var(--rule)";
  const color = state === "dimmed" ? "var(--ink-muted)" : "var(--ink)";

  const markerBg =
    state === "correct"
      ? "#4a7c59"
      : state === "wrong"
        ? "#c94a3b"
        : state === "dimmed"
          ? "transparent"
          : "transparent";
  const markerFg =
    state === "correct" || state === "wrong"
      ? "#fff"
      : state === "dimmed"
        ? "var(--ink-muted)"
        : "var(--ink-soft)";
  const markerBorder =
    state === "correct" || state === "wrong" ? "transparent" : "var(--rule)";

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        flex: block ? 1 : undefined,
        width: block ? undefined : "100%",
        textAlign: "left",
        padding: "11px 14px",
        borderRadius: 10,
        background: bg,
        border: `1px solid ${border}`,
        color,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "var(--serif-stack)",
        fontSize: 14,
        lineHeight: 1.45,
        display: "flex",
        alignItems: "center",
        gap: 12,
        transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
      }}
    >
      {marker && (
        <span
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            background: markerBg,
            color: markerFg,
            border: `1px solid ${markerBorder}`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--mono-stack)",
            fontSize: 11,
            fontWeight: 600,
            flexShrink: 0,
            transition: "background 0.15s ease, color 0.15s ease",
          }}
        >
          {marker}
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      {state === "correct" && <CheckIcon />}
      {state === "wrong" && <CrossIcon />}
    </button>
  );
}

function CheckIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#4a7c59"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M5 12l5 5L20 6" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#c94a3b"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function Explanation({
  correct,
  explanation,
  sourcePage,
}: {
  correct: boolean;
  explanation: string;
  sourcePage: number;
}) {
  const accent = correct ? "#4a7c59" : "#c94a3b";
  return (
    <div
      style={{
        marginTop: 14,
        padding: "12px 14px",
        borderRadius: 10,
        background: correct ? "rgba(74,124,89,0.06)" : "rgba(201,74,59,0.05)",
        border: `1px solid ${accent}33`,
      }}
    >
      <div
        className="uppercase"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1.3,
          color: accent,
          marginBottom: 6,
        }}
      >
        {correct ? "Correct" : "Not quite"} · p. {sourcePage}
      </div>
      <div
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 13.5,
          lineHeight: 1.55,
          color: "var(--ink)",
          whiteSpace: "pre-wrap",
        }}
      >
        {explanation}
      </div>
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total === 0 ? 0 : current / total;
  return (
    <div style={{ height: 2, background: "var(--rule)", borderRadius: 2 }}>
      <div
        style={{
          width: `${pct * 100}%`,
          height: "100%",
          background: "var(--ink-soft)",
          borderRadius: 2,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

// -- Results ------------------------------------------------------------

function Results({
  questions,
  history,
  onAgain,
  onHome,
}: {
  questions: QuizQuestion[];
  history: Answer[];
  onAgain: () => void;
  onHome: () => void;
}) {
  const correctCount = history.filter((h) => h.correct).length;
  const total = history.length;
  const pct = total === 0 ? 0 : Math.round((correctCount / total) * 100);

  return (
    <div style={{ padding: "22px 22px 24px" }}>
      <div
        style={{
          padding: "18px",
          borderRadius: 14,
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          marginBottom: 18,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "var(--mono-stack)",
            fontSize: 34,
            fontWeight: 600,
            color: "var(--ink)",
            lineHeight: 1,
          }}
        >
          {correctCount} / {total}
        </div>
        <div
          className="uppercase"
          style={{
            marginTop: 6,
            fontFamily: "var(--inter-stack)",
            fontSize: 10.5,
            letterSpacing: 1.4,
            color: "var(--ink-muted)",
          }}
        >
          {pct}% correct
        </div>
      </div>

      <div
        className="uppercase"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.4,
          color: "var(--ink-muted)",
          marginBottom: 8,
        }}
      >
        Review
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {questions.map((q, i) => {
          const h = history[i];
          if (!h) return null;
          return <ReviewItem key={q.id} question={q} answer={h} />;
        })}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="outline-btn" style={{ flex: 1 }} onClick={onHome}>
          Home
        </button>
        <button type="button" className="filled-btn" style={{ flex: 1 }} onClick={onAgain}>
          New quiz
        </button>
      </div>
    </div>
  );
}

function ReviewItem({ question, answer }: { question: QuizQuestion; answer: Answer }) {
  const accent = answer.correct ? "#4a7c59" : "#c94a3b";
  return (
    <div
      style={{
        padding: "10px 12px 10px 14px",
        borderRadius: 10,
        borderLeft: `3px solid ${accent}`,
        background: "rgba(127,127,127,0.04)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 13,
          color: "var(--ink)",
          lineHeight: 1.5,
          marginBottom: 4,
        }}
      >
        {question.question}
      </div>
      <div
        style={{
          fontFamily: "var(--mono-stack)",
          fontSize: 11,
          color: "var(--ink-muted)",
        }}
      >
        {answer.correct ? "Correct" : "Missed"} · p. {question.sourcePage}
      </div>
    </div>
  );
}
