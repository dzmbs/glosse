"use client";

/**
 * QuizView — stub with a working composer.
 *
 * The full MCQ / free-response / flashcard flow in glosse-design requires
 * structured quiz data from the backend. Until the Codex agent starts
 * emitting a quiz payload (see glosse/codex/agent.py `run_guide`), this
 * screen kicks off a single round-trip with `action: "quiz"` and displays
 * the plain-text response.
 *
 * LATER: render real MCQ / free / flashcard cards as in
 * glosse-design/src/ai-panel.jsx `QuizView`.
 */

import { useEffect, useState } from "react";

import { Icon } from "@/components/Icons";
import { api } from "@/lib/api";
import { useTweaks } from "@/lib/tweaks";

export function QuizView({
  onBack,
  bookId,
  chapterIndex,
}: {
  onBack: () => void;
  bookId: string;
  chapterIndex: number;
}) {
  const { mode } = useTweaks();
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Refetching is keyed to the active book/chapter/mode.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    api
      .guide({
        book_id: bookId,
        chapter_index: chapterIndex,
        mode: mode.pedagogy,
        action: "quiz",
      })
      .then((r) => {
        if (!cancelled) setText(r.text);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, chapterIndex, mode.pedagogy]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto" style={{ padding: "20px 20px 10px" }}>
        <div
          className="uppercase font-semibold mb-2 flex items-center gap-[6px]"
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 10.5,
            letterSpacing: 1.4,
            color: "var(--accent)",
          }}
        >
          <Icon.quiz size={11} /> <span>Quiz</span>
        </div>
        <div
          className="mb-[18px]"
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: 20,
            lineHeight: 1.35,
            color: "var(--ink)",
            fontWeight: 500,
          }}
        >
          {loading
            ? "Generating a quiz from what you've read…"
            : error
            ? "Couldn't load a quiz."
            : "Quiz from what you've read so far"}
        </div>
        {!loading && !error && (
          <div
            className="whitespace-pre-wrap"
            style={{
              fontFamily: "var(--serif-stack)",
              fontSize: 14.5,
              lineHeight: 1.55,
              color: "var(--ink)",
            }}
          >
            {text}
          </div>
        )}
        {error && (
          <div
            className="whitespace-pre-wrap"
            style={{
              fontFamily: "var(--mono-stack)",
              fontSize: 12,
              color: "var(--accent)",
            }}
          >
            {error}
          </div>
        )}
        <div
          className="mt-6 italic"
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: 13,
            color: "var(--ink-muted)",
          }}
        >
          Full MCQ / free-response / flashcard flow lands once the Codex
          agent emits structured quiz payloads. See
          <code
            className="mx-1"
            style={{ fontFamily: "var(--mono-stack)", fontSize: 12 }}
          >
            glosse/codex/agent.py
          </code>
          .
        </div>
      </div>

      <div
        className="flex gap-[10px]"
        style={{
          padding: "14px 18px 18px",
          borderTop: "1px solid var(--rule-soft)",
        }}
      >
        <button className="outline-btn flex-1" type="button" onClick={onBack}>
          ← Back
        </button>
      </div>
    </div>
  );
}
