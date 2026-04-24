import { useEffect, useState } from "react";

import { proposeFocusTopics, type StudyDifficulty } from "@/ai";

export const DIFFICULTIES: StudyDifficulty[] = ["easy", "medium", "hard"];
export const COUNTS = [5, 10, 15, 20] as const;

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function useStudySetup(opts: {
  bookId: string;
  currentChapterTitle: string | null;
  currentPage: number;
}) {
  const { bookId, currentChapterTitle, currentPage } = opts;

  const [scope, setScope] = useState<"all" | "chapter">(
    currentChapterTitle ? "chapter" : "all",
  );
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
      const result = await proposeFocusTopics(
        bookId,
        scope === "chapter" && currentChapterTitle
          ? { kind: "chapter", chapterTitle: currentChapterTitle }
          : { kind: "all", maxPage: currentPage },
      );
      if (!cancelled) setTopics(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, scope, currentChapterTitle, currentPage]);

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
