import { streamText, type ModelMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";

import { hybridRetrieve } from "../retrieval/hybrid";
import { getChatProvider } from "../providers/registry";
import { useAISettings } from "../providers/settings";
import { buildCompanionPrompt } from "../prompts/companion";
import { getProfile, profileToSnippet } from "../profile";
import type { ReadingFocus, RetrievedChunk } from "../types";
import { errorToString } from "../utils/str";
import {
  getConversationSummary,
  refreshConversationSummary,
} from "./memory";
import {
  appendTurnMessages,
  deleteConversation,
  getLatestConversation,
  getOrCreateLatestConversation,
  loadMessages,
} from "./conversations";
import {
  canSendChatMessage,
  createOptimisticTurn,
  rollbackOptimisticTurn,
  shouldHydrateConversation,
} from "./lifecycle";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Populated on assistant messages after retrieval. */
  sources?: RetrievedChunk[];
  /** True while tokens are still streaming in. */
  pending?: boolean;
};

export type UseBookChatInput = {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  currentPage: number;
  totalPages?: number;
  enabled?: boolean;
};

export type UseBookChatResult = {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  conversationId: string | null;
  send: (text: string, focus?: ReadingFocus) => Promise<boolean>;
  abort: () => void;
  reload: () => Promise<void>;
};

const RECENT_HISTORY_MESSAGES = 8;

/**
 * Streaming chat hook for one book. Owns conversation state, runs
 * retrieval per user message, calls streamText, and persists both turns
 * to libSQL.
 *
 * Concurrency: only one in-flight request at a time. Calling `send` while
 * streaming no-ops; call `abort` first.
 */
export function useBookChat(input: UseBookChatInput): UseBookChatResult {
  const {
    bookId,
    bookTitle,
    bookAuthor,
    currentPage,
    totalPages,
    enabled = true,
  } = input;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    if (!shouldHydrateConversation(enabled)) return;
    setError(null);
    try {
      const conv = await getLatestConversation(bookId);
      if (!conv) {
        setConversationId(null);
        setMessages([]);
        return;
      }
      setConversationId(conv.id);
      const rows = await loadMessages(conv.id);
      setMessages(
        rows
          .filter((r) => r.role === "user" || r.role === "assistant")
          .map((r) => ({
            id: r.id,
            role: r.role as "user" | "assistant",
            content: r.content,
          })),
      );
    } catch (err) {
      setError(errorToString(err));
    }
  }, [bookId, enabled]);

  useEffect(() => {
    if (!shouldHydrateConversation(enabled)) return;
    void reload();
  }, [enabled, reload]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const send = useCallback(
    async (text: string, focus?: ReadingFocus) => {
      const trimmed = text.trim();
      if (!canSendChatMessage({ enabled, loading, text: trimmed })) return false;

      const settings = useAISettings.getState();
      setError(null);
      setLoading(true);

      const optimisticIds = {
        userId: `local_${crypto.randomUUID()}`,
        assistantId: `local_${crypto.randomUUID()}`,
      };

      const controller = new AbortController();
      abortRef.current = controller;

      let activeConversationId = conversationId;
      let createdConversation = false;
      try {
        if (!activeConversationId) {
          const conversation = await getOrCreateLatestConversation(bookId);
          activeConversationId = conversation.id;
          createdConversation = true;
          setConversationId(conversation.id);
        }

        setMessages((prev) =>
          createOptimisticTurn(prev, optimisticIds, trimmed),
        );

        const [passages, profile, conversationSummary] = await Promise.all([
          hybridRetrieve({
            bookId,
            query: trimmed,
            focus,
            currentPage,
            topK: settings.maxContextChunks,
            maxPage: settings.spoilerProtection ? currentPage : undefined,
          }),
          getProfile(),
          getConversationSummary(activeConversationId),
        ]);

        const systemPrompt = buildCompanionPrompt({
          bookTitle,
          bookAuthor,
          question: trimmed,
          currentPage,
          totalPages,
          passages,
          spoilerProtection: settings.spoilerProtection,
          profile: profileToSnippet(profile),
          focus,
          conversationSummary: conversationSummary ?? undefined,
        });

        const history: ModelMessage[] = messages
          .filter((m) => !m.pending)
          .slice(-RECENT_HISTORY_MESSAGES)
          .map((m) => ({ role: m.role, content: m.content }));

        const result = streamText({
          model: getChatProvider(settings.chatModel),
          system: systemPrompt,
          messages: [...history, { role: "user", content: trimmed }],
          abortSignal: controller.signal,
        });

        let acc = "";
        for await (const delta of result.textStream) {
          acc += delta;
          setMessages((prev) => {
            const copy = [...prev];
            const idx = copy.findIndex(
              (m) => m.id === optimisticIds.assistantId,
            );
            if (idx >= 0) {
              copy[idx] = {
                ...copy[idx]!,
                content: acc,
                pending: true,
              };
            }
            return copy;
          });
        }

        setMessages((prev) => {
          const copy = [...prev];
          const idx = copy.findIndex(
            (m) => m.id === optimisticIds.assistantId,
          );
          if (idx >= 0) {
            copy[idx] = {
              ...copy[idx]!,
              content: acc,
              pending: false,
              sources: passages,
            };
          }
          return copy;
        });

        const persistedTurn = await appendTurnMessages(
          activeConversationId,
          trimmed,
          acc,
        );
        setMessages((prev) => {
          const copy = [...prev];
          const ui = copy.findIndex((m) => m.id === optimisticIds.userId);
          if (ui >= 0) copy[ui] = { ...copy[ui]!, id: persistedTurn.user.id };
          const ai = copy.findIndex((m) => m.id === optimisticIds.assistantId);
          if (ai >= 0) {
            copy[ai] = { ...copy[ai]!, id: persistedTurn.assistant.id };
          }
          return copy;
        });
        void refreshConversationSummary(
          activeConversationId,
          settings.chatModel,
        ).catch((summaryErr) => {
          console.warn("Failed to refresh conversation summary:", summaryErr);
        });
        return true;
      } catch (err) {
        const aborted =
          controller.signal.aborted ||
          (err instanceof Error && err.name === "AbortError");
        setMessages((prev) => rollbackOptimisticTurn(prev, optimisticIds));
        if (createdConversation && activeConversationId) {
          await deleteConversation(activeConversationId);
          setConversationId(null);
        }
        if (!aborted) {
          const msg = errorToString(err);
          setError(msg);
        }
        return false;
      } finally {
        abortRef.current = null;
        setLoading(false);
      }
    },
    [
      enabled,
      bookAuthor,
      bookId,
      bookTitle,
      conversationId,
      currentPage,
      loading,
      messages,
      totalPages,
    ],
  );

  return { messages, loading, error, conversationId, send, abort, reload };
}
