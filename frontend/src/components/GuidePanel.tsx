"use client";

/**
 * GuidePanel — client component talking to POST /api/guide.
 *
 * This is a MINIMUM shell so the backend round-trip is already wired. The
 * frontend dev replaces this body with the full design from
 * `glosse-design/src/ai-panel.jsx`:
 *   - header with sparkle icon + "Glosse" + chapter badge + close
 *   - welcome italic message
 *   - quick-action grid: Summarize / Quiz me / Explain / Who's who
 *   - user bubbles + AIAnswerCard / AISummaryCard / AIDefineCard
 *   - quiz view (MCQ / free / flashcard)
 *   - composer textarea with send button and ⌘K footer
 *
 * Keep the `api.guide` call shape as-is — the backend agent already
 * accepts it (see glosse/codex/agent.py).
 */

import { useState } from "react";
import { api, type GuideAction, type GuideResponse } from "@/lib/api";

export function GuidePanel({
  bookId,
  chapterIndex,
}: {
  bookId: string;
  chapterIndex: number;
}) {
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<GuideResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: GuideAction, user_message?: string) {
    setLoading(true);
    setError(null);
    try {
      const selection = window.getSelection()?.toString() || null;
      const res = await api.guide({
        book_id: bookId,
        chapter_index: chapterIndex,
        // LATER: map surface mode -> pedagogy mode (novel→story, study→
        // technical, article→discussion, focus→learning). For now, leave
        // the backend default ("learning").
        action,
        selection,
        user_message: user_message ?? null,
      });
      setResponse(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header
        className="flex items-center gap-3 border-b px-5 py-4"
        style={{ borderColor: "var(--color-rule-soft)" }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-md text-xs"
          style={{
            background: "var(--color-ink)",
            color: "var(--color-paper)",
            fontFamily: "var(--font-sans)",
          }}
        >
          ✦
        </div>
        <div className="flex flex-1 flex-col leading-tight">
          <div
            className="text-base font-medium"
            style={{
              fontFamily: "var(--font-serif)",
              color: "var(--color-ink)",
            }}
          >
            Glosse
          </div>
          <div
            className="text-[10px] font-medium uppercase tracking-widest"
            style={{
              fontFamily: "var(--font-sans)",
              color: "var(--color-ink-muted)",
            }}
          >
            Reading with you
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div
          className="mb-4 text-base italic"
          style={{
            fontFamily: "var(--font-serif)",
            color: "var(--color-ink)",
          }}
        >
          &ldquo;I&rsquo;ve read along with you through chapter {chapterIndex + 1}.
          Ask me anything — or try a quiz on what you&rsquo;ve read so far.&rdquo;
        </div>

        <QuickActions onRun={run} disabled={loading} />

        {loading && (
          <div
            className="mt-4 text-sm italic"
            style={{ color: "var(--color-ink-muted)" }}
          >
            thinking…
          </div>
        )}

        {error && (
          <div
            className="mt-4 rounded border p-3 text-xs"
            style={{
              borderColor: "var(--color-accent)",
              color: "var(--color-accent)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {error}
          </div>
        )}

        {response && (
          <div className="mt-4">
            <div
              className="text-sm whitespace-pre-wrap"
              style={{
                fontFamily: "var(--font-serif)",
                color: "var(--color-ink)",
              }}
            >
              {response.text}
            </div>
            {response.suggested?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {response.suggested.map((s) => (
                  <button
                    key={s}
                    onClick={() => void run("ask", s)}
                    className="rounded border px-2 py-1 text-xs italic"
                    style={{
                      borderColor: "var(--color-rule)",
                      color: "var(--color-ink-soft)",
                      fontFamily: "var(--font-serif)",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        className="border-t p-3"
        style={{ borderColor: "var(--color-rule-soft)" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || loading) return;
          const msg = input.trim();
          setInput("");
          void run("ask", msg);
        }}
      >
        <div
          className="flex items-end gap-2 rounded-2xl border px-3 py-2"
          style={{
            borderColor: "var(--color-rule)",
            background: "rgba(255,255,255,0.55)",
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this page…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{
              fontFamily: "var(--font-sans)",
              color: "var(--color-ink)",
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="rounded-md px-3 py-1 text-xs font-medium transition-opacity disabled:opacity-40"
            style={{
              background: "var(--color-ink)",
              color: "var(--color-paper)",
              fontFamily: "var(--font-sans)",
            }}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function QuickActions({
  onRun,
  disabled,
}: {
  onRun: (a: GuideAction) => void;
  disabled: boolean;
}) {
  const tiles: Array<{ id: GuideAction; label: string; sub: string }> = [
    { id: "summarize", label: "Summarize", sub: "this chapter" },
    { id: "quiz", label: "Quiz me", sub: "on what you've read" },
    { id: "explain", label: "Explain", sub: "this page" },
    //{ id: "ask", label: "Who's who", sub: "so far" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {tiles.map((t, i) => (
        <button
          key={i}
          onClick={() => onRun(t.id)}
          disabled={disabled}
          className="flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors disabled:opacity-50"
          style={{
            borderColor: "var(--color-rule-soft)",
            background: "rgba(255,255,255,0.35)",
          }}
        >
          <span
            className="text-[13px] font-semibold"
            style={{
              fontFamily: "var(--font-sans)",
              color: "var(--color-ink)",
            }}
          >
            {t.label}
          </span>
          <span
            className="text-[11px]"
            style={{
              fontFamily: "var(--font-sans)",
              color: "var(--color-ink-muted)",
            }}
          >
            {t.sub}
          </span>
        </button>
      ))}
    </div>
  );
}
