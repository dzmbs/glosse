import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/Icons";
import { indexBook, isBookIndexed } from "@/ai/indexing/indexer";
import {
  getBookIndexConfig,
  providerLabel,
  sameEmbeddingConfig,
  type BookIndexConfig,
} from "@/ai/indexing/bookIndex";
import { extractSections } from "@/ai/indexing/extract";
import {
  useBookChat,
  type ChatMessage,
  type ChatPhase,
} from "@/ai/chat/useBookChat";
import { useAISettings } from "@/ai/providers/settings";
import type { IndexingProgress, ReadingFocus } from "@/ai/types";
import {
  hasEmbeddingKeyForBook,
  hasEmbeddingKeyForConfig,
  hasRequiredKeyForBook,
  type GateIndexStatus,
} from "@/components/ai/askGate";
import { errorToString, truncate } from "@/ai/utils/str";

type Props = {
  active: boolean;
  onOpenSettings: () => void;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  currentPage: number;
  totalPages?: number;
  foliateBook: unknown | null;
  seedFocus?: ReadingFocus | null;
  onSeedConsumed?: () => void;
};

type IndexState =
  | { status: "checking" }
  | { status: "needed" }
  | { status: "indexing"; progress: IndexingProgress }
  | { status: "ready"; config: BookIndexConfig | null }
  | { status: "error"; message: string };

export function AskBody({
  active,
  onOpenSettings,
  bookId,
  bookTitle,
  bookAuthor,
  currentPage,
  totalPages,
  foliateBook,
  seedFocus,
  onSeedConsumed,
}: Props) {
  const settings = useAISettings();
  const [indexState, setIndexState] = useState<IndexState>({ status: "checking" });

  const chat = useBookChat({
    bookId,
    bookTitle,
    bookAuthor,
    currentPage,
    totalPages,
    enabled: active,
  });

  const [input, setInput] = useState("");
  const [focus, setFocus] = useState<ReadingFocus | null>(seedFocus ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!seedFocus) return;
    setFocus(seedFocus);
    onSeedConsumed?.();
  }, [seedFocus, onSeedConsumed]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.messages]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      setIndexState({ status: "checking" });
      try {
        const indexed = await isBookIndexed(bookId);
        if (cancelled) return;
        if (!indexed) {
          setIndexState({ status: "needed" });
          return;
        }
        const config = await getBookIndexConfig(bookId);
        if (cancelled) return;
        setIndexState({ status: "ready", config });
      } catch (err) {
        if (cancelled) return;
        setIndexState({
          status: "error",
          message: errorToString(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, active]);

  const startIndexing = useCallback(async () => {
    if (!foliateBook) {
      setIndexState({
        status: "error",
        message: "Book not loaded yet. Wait for the reader to finish opening.",
      });
      return;
    }
    try {
      setIndexState({
        status: "indexing",
        progress: { phase: "chunking", current: 0, total: 1 },
      });
      const sections = await extractSections(
        foliateBook as Parameters<typeof extractSections>[0],
      );
      await indexBook(
        {
          bookId,
          title: bookTitle,
          author: bookAuthor,
          sections,
        },
        {
          embedding: settings.embeddingModel,
          contextualize: settings.useContextualRetrieval,
          onProgress: (p) => setIndexState({ status: "indexing", progress: p }),
        },
      );
      const config = await getBookIndexConfig(bookId);
      setIndexState({ status: "ready", config });
    } catch (err) {
      setIndexState({
        status: "error",
        message: errorToString(err),
      });
    }
  }, [
    bookAuthor,
    bookId,
    bookTitle,
    foliateBook,
    settings.embeddingModel,
    settings.useContextualRetrieval,
  ]);

  // Gate uses the BOOK's saved embedding config once it's indexed. A
  // user who switched their default embedding provider mid-session must
  // still be able to ask questions against books indexed with the old
  // provider, so we can't key off `settings.embeddingModel` here.
  const gateStatus: GateIndexStatus = indexStateToGate(indexState);
  const canAsk =
    indexState.status === "ready" &&
    settings.enabled &&
    hasRequiredKeyForBook(gateStatus, settings);

  const handleSend = useCallback(async () => {
    const text = input.trim() || (focus ? "Explain this passage." : "");
    if (!text) return;
    const nextFocus = focus ?? undefined;
    // Clear the composer as soon as we dispatch. chat.send() awaits the
    // full stream (~20-30s with local models), so clearing on success
    // leaves the user's question sitting in the box the whole time.
    setInput("");
    setFocus(null);
    const sent = await chat.send(text, nextFocus);
    if (!sent) {
      setInput(text);
      if (nextFocus) setFocus(nextFocus);
    }
  }, [chat, focus, input]);

  return (
    <>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        {indexState.status === "checking" && <CenterMessage text="Checking index…" />}

        {indexState.status === "needed" && (
          <IndexCTA
            bookTitle={bookTitle}
            hasKey={hasEmbeddingKeyForConfig(settings.embeddingModel, settings)}
            onStart={startIndexing}
            onOpenSettings={onOpenSettings}
          />
        )}

        {indexState.status === "indexing" && (
          <IndexingBar progress={indexState.progress} />
        )}

        {indexState.status === "error" && (
          <ErrorBox
            title="Something broke"
            detail={indexState.message}
            onRetry={() => void startIndexing()}
          />
        )}

        {indexState.status === "ready" && (
          <>
            <IndexStatusBar
              config={indexState.config}
              currentDefault={settings.embeddingModel}
              defaultReady={hasEmbeddingKeyForConfig(
                settings.embeddingModel,
                settings,
              )}
              onReindex={() => void startIndexing()}
              onOpenSettings={onOpenSettings}
            />
            <MessageList
              messages={chat.messages}
              loading={chat.loading}
              phase={chat.phase}
              error={chat.error}
              bookTitle={bookTitle}
              needsKey={!hasRequiredKeyForBook(gateStatus, settings)}
              needsEmbeddingKey={!hasEmbeddingKeyForBook(gateStatus, settings)}
              activeEmbeddingProvider={
                indexState.status === "ready" && indexState.config
                  ? indexState.config.embedding.provider
                  : settings.embeddingModel.provider
              }
              onOpenSettings={onOpenSettings}
            />
          </>
        )}
      </div>

      <Composer
        value={input}
        onChange={setInput}
        onSend={() => void handleSend()}
        onAbort={chat.abort}
        focus={focus}
        onClearFocus={() => setFocus(null)}
        disabled={!canAsk}
        loading={chat.loading}
        bookTitle={bookTitle}
      />
    </>
  );
}

// -- Message list ---------------------------------------------------------

function MessageList({
  messages,
  loading,
  phase,
  error,
  bookTitle,
  needsKey,
  needsEmbeddingKey,
  activeEmbeddingProvider,
  onOpenSettings,
}: {
  messages: ChatMessage[];
  loading: boolean;
  phase: ChatPhase;
  error: string | null;
  bookTitle: string;
  needsKey: boolean;
  needsEmbeddingKey: boolean;
  activeEmbeddingProvider: string;
  onOpenSettings: () => void;
}) {
  if (needsKey) {
    const msg = needsEmbeddingKey
      ? `This book is indexed with ${activeEmbeddingProvider}. Add the ${activeEmbeddingProvider} API key to ask questions, or re-index with a provider you have a key for.`
      : `Add an API key to start asking about ${bookTitle}. Keys stay on this device.`;
    return (
      <div style={{ padding: "28px 22px" }}>
        <p
          className="italic"
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: 15,
            color: "var(--ink-soft)",
            lineHeight: 1.55,
          }}
        >
          {msg}
        </p>
        <button
          type="button"
          className="filled-btn"
          style={{ marginTop: 14 }}
          onClick={onOpenSettings}
        >
          Open AI settings
        </button>
      </div>
    );
  }

  // An error on the first hydration (reload/retrieval/bootstrap) must
  // beat the empty-state copy — otherwise the Ask tab looks idle while
  // it's actually broken.
  if (error && messages.length === 0 && !loading) {
    return (
      <div style={{ padding: "22px" }}>
        <ErrorInline detail={error} />
      </div>
    );
  }

  if (messages.length === 0 && !loading) {
    return (
      <div style={{ padding: "28px 22px" }}>
        <p
          className="italic"
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: 15,
            color: "var(--ink-soft)",
            lineHeight: 1.6,
          }}
        >
          Ready when you are. Ask about what we&apos;ve read so far — I stay
          within your current page so you won&apos;t get spoiled.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "18px 18px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} phase={phase} />
      ))}
      {error && <ErrorInline detail={error} />}
    </div>
  );
}

function MessageBubble({
  message,
  phase,
}: {
  message: ChatMessage;
  phase: ChatPhase;
}) {
  const isUser = message.role === "user";
  const showStageText =
    !isUser &&
    message.pending &&
    message.content.length === 0 &&
    (phase === "retrieving" || phase === "thinking");
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "92%",
        padding: "10px 14px",
        background: isUser ? "var(--ink)" : "rgba(127,127,127,0.06)",
        color: isUser ? "var(--paper)" : "var(--ink)",
        borderRadius: 14,
        border: isUser ? "none" : "1px solid var(--rule-soft)",
        fontFamily: "var(--serif-stack)",
        fontSize: 14.5,
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {showStageText ? (
        <PhaseIndicator phase={phase} />
      ) : (
        <>
          {message.content}
          {message.pending && (
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 14,
                marginLeft: 3,
                verticalAlign: "-2px",
                background: "currentColor",
                opacity: 0.5,
                animation: "glosse-caret 1s steps(2) infinite",
              }}
            />
          )}
        </>
      )}
      {message.sources && message.sources.length > 0 && (
        <Sources sources={message.sources} />
      )}
      {message.timings && !message.pending && (
        <Timings timings={message.timings} />
      )}
      <style>{`
        @keyframes glosse-caret { 50% { opacity: 0; } }
        @keyframes glosse-dots {
          0%, 20%  { opacity: 0.2; }
          50%      { opacity: 1; }
          80%, 100%{ opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}

function PhaseIndicator({ phase }: { phase: ChatPhase }) {
  const label =
    phase === "retrieving"
      ? "Searching your book"
      : phase === "thinking"
        ? "Thinking"
        : "";
  return (
    <span
      style={{
        fontStyle: "italic",
        color: "var(--ink-muted)",
        display: "inline-flex",
        alignItems: "baseline",
        gap: 2,
      }}
    >
      {label}
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          gap: 2,
          marginLeft: 4,
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 3,
              height: 3,
              borderRadius: 999,
              background: "currentColor",
              animation: `glosse-dots 1.2s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </span>
    </span>
  );
}

function Timings({ timings }: { timings: NonNullable<ChatMessage["timings"]> }) {
  const { embedMs, searchMs, ttftMs, streamMs, totalMs, chars } = timings;
  const tokPerSec =
    streamMs > 0 ? Math.round((chars / 4) / (streamMs / 1000)) : 0;
  const parts = [
    `embed ${embedMs}ms`,
    `search ${searchMs}ms`,
    `ttft ${(ttftMs / 1000).toFixed(2)}s`,
    `stream ${(streamMs / 1000).toFixed(2)}s`,
    `≈${tokPerSec} tok/s`,
    `total ${(totalMs / 1000).toFixed(2)}s`,
  ];
  return (
    <div
      style={{
        marginTop: 8,
        paddingTop: 6,
        borderTop: "1px dashed var(--rule-soft)",
        fontFamily: "var(--mono-stack)",
        fontSize: 10.5,
        color: "var(--ink-muted)",
        opacity: 0.75,
      }}
      title="embed: query vectorisation · search: vector+FTS fusion · ttft: time to first token from LLM · stream: total generation · tok/s is approximate (chars/4)"
    >
      {parts.join(" · ")}
    </div>
  );
}

function Sources({ sources }: { sources: ChatMessage["sources"] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <details
      style={{
        marginTop: 10,
        fontFamily: "var(--inter-stack)",
        fontSize: 11.5,
        color: "var(--ink-muted)",
      }}
    >
      <summary style={{ cursor: "pointer", opacity: 0.8 }}>
        {sources.length} source{sources.length === 1 ? "" : "s"}
      </summary>
      <ul
        style={{
          marginTop: 6,
          paddingLeft: 14,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {sources.slice(0, 5).map((s) => (
          <li key={s.chunkId} style={{ listStyle: "disc" }}>
            {s.chapterTitle || `Section ${s.sectionIndex + 1}`} · p. {s.pageNumber}
          </li>
        ))}
      </ul>
    </details>
  );
}

// -- Composer --------------------------------------------------------------

function Composer({
  value,
  onChange,
  onSend,
  onAbort,
  focus,
  onClearFocus,
  disabled,
  loading,
  bookTitle,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onAbort: () => void;
  focus: ReadingFocus | null;
  onClearFocus: () => void;
  disabled: boolean;
  loading: boolean;
  bookTitle: string;
}) {
  const canSend =
    (value.trim().length > 0 || !!focus?.selectedText) && !disabled && !loading;
  const selectedFocus = focus?.selectedText
    ? { ...focus, selectedText: focus.selectedText }
    : null;
  return (
    <div
      style={{
        padding: "12px 16px 16px",
        borderTop: "1px solid var(--rule-soft)",
        background: "var(--panel-bg)",
      }}
    >
      {selectedFocus && <FocusCard focus={selectedFocus} onClear={onClearFocus} />}
      <div
        className="flex items-end gap-[10px]"
        style={{
          marginTop: selectedFocus ? 10 : 0,
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          borderRadius: 14,
          padding: "8px 8px 8px 12px",
        }}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={disabled ? "Set up AI first" : `Ask about ${bookTitle}…`}
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent outline-none border-none resize-none"
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 13.5,
            lineHeight: 1.45,
            color: "var(--ink)",
            maxHeight: 120,
            padding: "4px 0",
          }}
        />
        {loading ? (
          <button
            type="button"
            onClick={onAbort}
            className="flex items-center justify-center rounded-[10px]"
            style={{
              width: 30,
              height: 30,
              border: "none",
              background: "var(--rule)",
              color: "var(--ink)",
              cursor: "pointer",
            }}
            title="Stop"
          >
            <span
              style={{
                width: 10,
                height: 10,
                background: "currentColor",
                borderRadius: 2,
              }}
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            className="flex items-center justify-center rounded-[10px]"
            style={{
              width: 30,
              height: 30,
              border: "none",
              background: canSend ? "var(--ink)" : "var(--rule)",
              color: canSend ? "var(--paper)" : "var(--ink-muted)",
              cursor: canSend ? "pointer" : "default",
            }}
          >
            <ArrowUp />
          </button>
        )}
      </div>
    </div>
  );
}

function ArrowUp() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function FocusCard({
  focus,
  onClear,
}: {
  focus: ReadingFocus & { selectedText: string };
  onClear: () => void;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid var(--rule-soft)",
        background: "rgba(127,127,127,0.05)",
      }}
    >
      <div
        className="flex items-center justify-between gap-[10px]"
        style={{ marginBottom: 6 }}
      >
        <div
          className="uppercase"
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 10,
            letterSpacing: 1.2,
            color: "var(--ink-muted)",
          }}
        >
          Focused passage
          {focus.pageNumber != null ? ` · p. ${focus.pageNumber}` : ""}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="icon-btn"
          aria-label="Clear focused passage"
          style={{ width: 24, height: 24 }}
        >
          <Icon.close size={12} />
        </button>
      </div>
      <div
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--ink)",
          whiteSpace: "pre-wrap",
        }}
      >
        {truncate(focus.selectedText, 280)}
      </div>
    </div>
  );
}

// -- Indexing states ------------------------------------------------------

function IndexCTA({
  bookTitle,
  hasKey,
  onStart,
  onOpenSettings,
}: {
  bookTitle: string;
  hasKey: boolean;
  onStart: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div style={{ padding: "28px 22px" }}>
      <p
        className="italic"
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 15,
          color: "var(--ink-soft)",
          lineHeight: 1.55,
        }}
      >
        We need to read <b>{bookTitle}</b> first. Indexing chunks the book,
        embeds each chunk, and stores them locally so retrieval can stay
        spoiler-safe and on-device.
      </p>
      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        {hasKey ? (
          <button type="button" className="filled-btn" onClick={onStart}>
            Index book
          </button>
        ) : (
          <button type="button" className="filled-btn" onClick={onOpenSettings}>
            Add API key
          </button>
        )}
      </div>
    </div>
  );
}

function IndexingBar({ progress }: { progress: IndexingProgress }) {
  const phaseLabel =
    progress.phase === "chunking"
      ? "Chunking"
      : progress.phase === "embedding"
        ? "Embedding"
        : progress.phase === "persisting"
          ? "Persisting"
          : "Done";

  const pct =
    progress.phase === "done"
      ? 1
      : progress.total === 0
        ? 0
        : progress.current / progress.total;

  return (
    <div style={{ padding: "28px 22px" }}>
      <div
        className="uppercase"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 10.5,
          letterSpacing: 1.4,
          color: "var(--ink-muted)",
          marginBottom: 6,
        }}
      >
        {phaseLabel}
        {progress.phase !== "done" &&
          ` · ${progress.current} / ${progress.total}`}
      </div>
      <div
        style={{
          height: 4,
          background: "var(--rule-soft)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.round(pct * 100)}%`,
            background: "var(--accent)",
            transition: "width 0.2s ease",
          }}
        />
      </div>
      <div
        className="italic"
        style={{
          marginTop: 12,
          fontFamily: "var(--serif-stack)",
          fontSize: 12.5,
          color: "var(--ink-muted)",
        }}
      >
        Runs in your browser. Don&apos;t close this tab until it&apos;s done.
      </div>
    </div>
  );
}

function IndexStatusBar({
  config,
  currentDefault,
  defaultReady,
  onReindex,
  onOpenSettings,
}: {
  config: BookIndexConfig | null;
  currentDefault: ReturnType<typeof useAISettings.getState>["embeddingModel"];
  /** Whether the current default embedding provider is actually usable
   *  right now (key present, or Ollama). Controls whether we offer the
   *  "Re-index now" action directly or redirect to settings first. */
  defaultReady: boolean;
  onReindex: () => void;
  onOpenSettings: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!config) return null;
  const drift = !sameEmbeddingConfig(config.embedding, currentDefault);
  const indexedLabel = `${providerLabel(config.embedding.provider)} · ${config.embedding.model} · ${config.embedding.dimensions}d`;
  const defaultLabel = `${providerLabel(currentDefault.provider)} · ${currentDefault.model} · ${currentDefault.dimensions}d`;

  return (
    <div
      style={{
        borderBottom: "1px solid var(--rule-soft)",
        background: drift ? "rgba(201,128,43,0.06)" : "transparent",
      }}
    >
      <div
        className="flex items-center"
        style={{ gap: 10, padding: "8px 16px" }}
      >
        <div
          className="uppercase"
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 10,
            letterSpacing: 1.3,
            color: "var(--ink-muted)",
            flexShrink: 0,
          }}
        >
          Index
        </div>
        <div
          className="truncate"
          style={{
            flex: 1,
            fontFamily: "var(--mono-stack)",
            fontSize: 11,
            color: "var(--ink-soft)",
          }}
          title={`${indexedLabel} · ${config.totalChunks} chunks · indexed ${formatIndexedAt(config.indexedAt)}`}
        >
          {indexedLabel} · {config.totalChunks} chunks
        </div>
        {drift && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            style={reindexButtonStyle()}
          >
            Re-index
          </button>
        )}
      </div>

      {drift && confirming && (
        <div
          style={{
            padding: "8px 16px 12px",
            borderTop: "1px dashed var(--rule-soft)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--serif-stack)",
              fontSize: 12.5,
              lineHeight: 1.55,
              color: "var(--ink)",
            }}
          >
            This book was indexed with <b>{indexedLabel}</b>.
            <br />
            Your current default is <b>{defaultLabel}</b>.
            <br />
            {defaultReady ? (
              <>Re-index to switch this book to the current default.</>
            ) : (
              <>
                The current default needs a {providerLabel(currentDefault.provider)} key before it can be used for re-indexing.
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {defaultReady ? (
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  onReindex();
                }}
                style={reindexButtonStyle(true)}
              >
                Re-index now
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  onOpenSettings();
                }}
                style={reindexButtonStyle(true)}
              >
                Open settings to add {providerLabel(currentDefault.provider)} key
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirming(false)}
              style={reindexButtonStyle()}
            >
              Keep current
            </button>
            {defaultReady && (
              <button
                type="button"
                onClick={onOpenSettings}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "3px 0",
                  cursor: "pointer",
                  fontFamily: "var(--inter-stack)",
                  fontSize: 11,
                  color: "var(--ink-muted)",
                  textDecoration: "underline dotted",
                  textUnderlineOffset: 2,
                  marginLeft: "auto",
                }}
              >
                change default
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function reindexButtonStyle(primary = false): React.CSSProperties {
  return {
    background: primary ? "var(--ink)" : "var(--paper)",
    border: "1px solid var(--rule)",
    borderRadius: 6,
    padding: "4px 10px",
    cursor: "pointer",
    fontFamily: "var(--inter-stack)",
    fontSize: 11,
    color: primary ? "var(--paper)" : "var(--ink)",
    flexShrink: 0,
  };
}

function formatIndexedAt(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return "recently";
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function CenterMessage({ text }: { text: string }) {
  return (
    <div
      className="italic"
      style={{
        padding: "48px 22px",
        textAlign: "center",
        fontFamily: "var(--serif-stack)",
        fontSize: 13.5,
        color: "var(--ink-muted)",
      }}
    >
      {text}
    </div>
  );
}

function ErrorBox({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail: string;
  onRetry?: () => void;
}) {
  return (
    <div style={{ padding: "22px 22px" }}>
      <div
        style={{
          fontFamily: "var(--heading-stack)",
          fontSize: 15,
          fontWeight: 500,
          color: "var(--ink)",
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: "var(--mono-stack)",
          fontSize: 11.5,
          color: "var(--ink-muted)",
          marginBottom: 10,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {detail}
      </div>
      {onRetry && (
        <button type="button" className="outline-btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

function ErrorInline({ detail }: { detail: string }) {
  return (
    <div
      style={{
        alignSelf: "flex-start",
        padding: "8px 12px",
        borderRadius: 10,
        background: "rgba(184,74,43,0.08)",
        border: "1px solid var(--accent)",
        fontFamily: "var(--mono-stack)",
        fontSize: 11.5,
        color: "var(--ink)",
        maxWidth: "92%",
      }}
    >
      {detail}
    </div>
  );
}

// -- Helpers --------------------------------------------------------------

/** Narrow the React IndexState down to just what askGate needs. */
function indexStateToGate(state: IndexState): GateIndexStatus {
  switch (state.status) {
    case "ready":
      return { status: "ready", config: state.config };
    case "checking":
      return { status: "checking" };
    case "needed":
      return { status: "needed" };
    case "indexing":
      return { status: "indexing" };
    case "error":
      return { status: "error" };
  }
}
