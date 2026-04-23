"use client";

/**
 * AIPanel — ports AIPanel from glosse-design/src/ai-panel.jsx.
 *
 * Modes internal to the panel: `chat` (default), `quiz`, `summary`. The
 * chat mode has a welcome line, quick actions, message history, and
 * composer. quiz replaces the whole surface with a QuizView.
 *
 * Every message comes from POST /api/guide. Because the backend agent is
 * still a stub (see glosse/codex/agent.py `run_guide`) the text it returns
 * is a placeholder — the shape of the panel is production-ready so the
 * engine dev just needs to replace the stub response with real output.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/Icons";
import {
  api,
  type GuideAction,
  type GuideRequest,
  type GuideResponse,
  type PedagogyMode,
} from "@/lib/api";
import { useTweaks } from "@/lib/tweaks";

import { AIComposer } from "./AIComposer";
import { AIHeader } from "./AIHeader";
import { AnswerCard, DefineCard, SummaryCard, WelcomeLine } from "./Cards";
import { QuickActions, type QuickActionId } from "./QuickActions";
import { QuizView } from "./QuizView";

type Msg =
  | { id: string; from: "ai"; kind: "welcome"; text: string }
  | { id: string; from: "ai"; kind: "answer"; data: GuideResponse; label: string }
  | { id: string; from: "user"; text: string };

type PanelMode = "chat" | "quiz";

export type AISeed = QuickActionId | "selection-ask" | null;

export function AIPanel({
  bookId,
  chapterIndex,
  bookTitle,
  chapterLabel,
  activeSelection,
  onClearSelection,
  seed,
  seedPayload,
  onSeedConsumed,
  onClose,
}: {
  bookId: string;
  chapterIndex: number;
  bookTitle: string;
  chapterLabel: string;
  activeSelection?: string | null;
  onClearSelection?: () => void;
  seed: AISeed;
  seedPayload?: string | null;
  onSeedConsumed: () => void;
  onClose: () => void;
}) {
  const { mode } = useTweaks();
  const pedagogy: PedagogyMode = mode.pedagogy;

  const welcomeText = useMemo(
    () =>
      `I've read along with you through ${chapterLabel}. Ask anything — or try a quiz on what you've read so far.`,
    [chapterLabel],
  );

  const [panelMode, setPanelMode] = useState<PanelMode>("chat");
  const msgCounter = useRef(0);
  const nextId = useCallback(() => String(++msgCounter.current), []);

  const [messages, setMessages] = useState<Msg[]>([
    { id: "0", from: "ai", kind: "welcome", text: welcomeText },
  ]);
  const selectionContext = activeSelection?.trim() || null;
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset on chapter swap — previous context no longer applies.
  useEffect(() => {
    msgCounter.current = 0;
    // State mirrors the active chapter; resetting here prevents stale chat context.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([{ id: "0", from: "ai", kind: "welcome", text: welcomeText }]);
    setPanelMode("chat");
  }, [bookId, chapterIndex, welcomeText]);

  // Auto-scroll when messages change.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, panelMode]);

  const send = useCallback(
    async (req: { action: GuideAction; user_message?: string | null; label: string; selection?: string | null }) => {
      setLoading(true);
      const userMsgId = nextId();
      const aiMsgId = nextId();
      if (req.user_message) {
        setMessages((m) => [...m, { id: userMsgId, from: "user", text: req.user_message as string }]);
      }
      try {
        const payload: GuideRequest = {
          book_id: bookId,
          chapter_index: chapterIndex,
          mode: pedagogy,
          action: req.action,
          user_message: req.user_message ?? null,
          selection: req.selection ?? selectionContext ?? null,
        };
        const res = await api.guide(payload);
        setMessages((m) => [
          ...m,
          { id: aiMsgId, from: "ai", kind: "answer", data: res, label: req.label },
        ]);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setMessages((m) => [
          ...m,
          {
            id: aiMsgId,
            from: "ai",
            kind: "answer",
            label: "Error",
            data: { text: `Error: ${message}`, citations: [], suggested: [] },
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [bookId, chapterIndex, nextId, pedagogy, selectionContext],
  );

  const handleQuickAction = useCallback(
    (id: QuickActionId) => {
      if (id === "quiz") {
        setPanelMode("quiz");
        return;
      }
      const action: GuideAction = id === "summarize" ? "summarize" : "explain";
      const label =
        id === "summarize" ? "Summary"
          : id === "characters" ? "Who's who"
          : id === "check" ? "Check my understanding"
          : "Explanation";
      const userText =
        id === "summarize"
          ? "Summarize this chapter."
          : id === "characters"
          ? "Who's who so far?"
          : id === "check"
          ? "Check my understanding."
          : "Explain this page.";
      void send({ action, user_message: userText, label });
    },
    [send],
  );

  // Respond to seeds from the reader (selection menu, margin-note click).
  useEffect(() => {
    if (!seed) return;
    if (seed === "selection-ask") {
      const text = (seedPayload ?? "").trim();
      if (text.length > 0) {
        // Seed is an external event from the reader selection flow.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void send({
          action: "ask",
          user_message: `Help me with this passage:\n\n${text.slice(0, 400)}`,
          label: "Answer",
          selection: text,
        });
      }
    } else {
      handleQuickAction(seed);
    }
    onSeedConsumed();
  }, [seed, seedPayload, handleQuickAction, onSeedConsumed, send]);

  const onSubmitInput = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    void send({ action: "ask", user_message: text, label: "Answer" });
  }, [input, loading, send]);

  return (
    <aside
      className="flex flex-col h-full"
      style={{
        width: "100%",
        background: "var(--panel-bg)",
        borderLeft: "1px solid var(--rule)",
        transition: "background 0.4s ease",
      }}
    >
      <AIHeader
        mode={panelMode}
        onBack={() => setPanelMode("chat")}
        onClose={onClose}
        chapterLabel={chapterLabel}
      />

      {panelMode === "chat" && (
        <>
          <div ref={scrollRef} className="flex-1 overflow-auto" style={{ padding: "18px 20px 10px" }}>
            <QuickActions onPick={handleQuickAction} />

            {messages.map((m) => {
              if (m.from === "user") {
                return <UserBubble key={m.id}>{m.text}</UserBubble>;
              }
              if (m.kind === "welcome") {
                return <WelcomeLine key={m.id} text={m.text} />;
              }
              return (
                <MessageFromAgent
                  key={m.id}
                  label={m.label}
                  data={m.data}
                  onFollowupClick={(q) => setInput(q)}
                />
              );
            })}

            {loading && (
              <div
                className="mt-2 italic"
                style={{
                  fontFamily: "var(--inter-stack)",
                  fontSize: 12,
                  color: "var(--ink-muted)",
                }}
              >
                thinking…
              </div>
            )}
          </div>

          <AIComposer
            value={input}
            onChange={setInput}
            onSend={onSubmitInput}
            disabled={loading}
            contextLabel={selectionContext ? "selected passage" : chapterLabel}
            selectionPreview={selectionContext}
            onClearSelection={onClearSelection}
            bookTitle={bookTitle}
          />
        </>
      )}

      {panelMode === "quiz" && (
        <QuizView
          onBack={() => setPanelMode("chat")}
          bookId={bookId}
          chapterIndex={chapterIndex}
        />
      )}
    </aside>
  );
}

// -- Helper subcomponents -------------------------------------------------

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end mb-[14px]">
      <div
        className="max-w-[82%]"
        style={{
          background: "var(--ink)",
          color: "var(--paper)",
          borderRadius: "16px 16px 4px 16px",
          padding: "10px 14px",
          fontFamily: "var(--inter-stack)",
          fontSize: 14,
          lineHeight: 1.45,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function MessageFromAgent({
  data,
  label,
  onFollowupClick,
}: {
  data: GuideResponse;
  label: string;
  onFollowupClick: (q: string) => void;
}) {
  // The backend stub returns plain text. Real responses will hint at kind:
  // "summary" via newline-bulleted content, "define" via dictionary shape,
  // etc. For now we always render AnswerCard and show suggested followups.
  const looksLikeDefine = data.citations.length === 0 && /^\w+:\s*\/.*?\//i.test(data.text);
  const looksLikeSummary = /\n\s*[-*•]|\n\d+[.)]/.test(data.text);

  if (looksLikeDefine) {
    // LATER: once the backend returns structured define payloads, parse
    // them instead of heuristically.
    return <DefineCard word={label} body={data.text} />;
  }
  if (looksLikeSummary) {
    const bullets = data.text
      .split(/\n+/)
      .map((s) => s.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter(Boolean);
    return (
      <>
        <SummaryCard title={label} bullets={bullets} />
        {data.suggested.length > 0 && (
          <Followups items={data.suggested} onPick={onFollowupClick} />
        )}
      </>
    );
  }

  return (
    <>
      <AnswerCard label={label} body={data.text} citations={data.citations} />
      {data.suggested.length > 0 && (
        <Followups items={data.suggested} onPick={onFollowupClick} />
      )}
    </>
  );
}

function Followups({
  items,
  onPick,
}: {
  items: string[];
  onPick: (q: string) => void;
}) {
  return (
    <div className="flex flex-col gap-[6px] mb-[18px]">
      <div
        className="uppercase mb-[2px]"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 10,
          letterSpacing: 1.2,
          color: "var(--ink-muted)",
          fontWeight: 500,
        }}
      >
        Follow-ups
      </div>
      {items.map((q) => (
        <button key={q} type="button" className="followup" onClick={() => onPick(q)}>
          <span>{q}</span>
          <Icon.chevR size={12} />
        </button>
      ))}
    </div>
  );
}
