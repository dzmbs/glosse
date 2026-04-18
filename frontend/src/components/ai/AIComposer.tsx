"use client";

import { useRef } from "react";

import { Icon } from "@/components/Icons";

export function AIComposer({
  value,
  onChange,
  onSend,
  disabled,
  contextLabel,
  selectionPreview,
  onClearSelection,
  bookTitle,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  contextLabel: string;
  selectionPreview?: string | null;
  onClearSelection?: () => void;
  bookTitle: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div
      style={{
        padding: "14px 18px 18px",
        borderTop: "1px solid var(--rule-soft)",
        background: "var(--panel-bg)",
      }}
    >
      {selectionPreview && (
        <div
          style={{
            marginBottom: 10,
            padding: "10px 12px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.45)",
            border: "1px solid var(--rule-soft)",
            position: "relative",
          }}
        >
          <div
            className="flex items-start justify-between gap-2"
            style={{ marginBottom: 4 }}
          >
            <div
              className="uppercase"
              style={{
                fontFamily: "var(--inter-stack)",
                fontSize: 10,
                letterSpacing: 1.2,
                color: "var(--accent)",
                fontWeight: 600,
              }}
            >
              Using selected passage
            </div>
            {onClearSelection && (
              <button
                type="button"
                onClick={onClearSelection}
                title="Remove selection from context"
                className="flex items-center justify-center"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 6,
                  border: "none",
                  background: "transparent",
                  color: "var(--ink-muted)",
                  cursor: "pointer",
                  padding: 0,
                  marginTop: -2,
                  marginRight: -4,
                }}
              >
                <Icon.close size={12} />
              </button>
            )}
          </div>
          <div
            className="line-clamp-2"
            style={{
              fontFamily: "var(--serif-stack)",
              fontSize: 13.5,
              lineHeight: 1.45,
              color: "var(--ink-soft)",
            }}
          >
            “{selectionPreview}”
          </div>
        </div>
      )}
      <div
        className="flex items-end gap-[10px]"
        style={{
          background: "rgba(255,255,255,0.55)",
          border: "1px solid var(--rule)",
          borderRadius: 16,
          padding: "10px 10px 10px 14px",
        }}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={`Ask about ${bookTitle}…`}
          rows={1}
          className="flex-1 bg-transparent outline-none border-none resize-none"
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 14,
            lineHeight: 1.45,
            color: "var(--ink)",
            maxHeight: 120,
            padding: "4px 0",
          }}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="flex items-center justify-center rounded-[10px] transition-all"
          style={{
            width: 32,
            height: 32,
            border: "none",
            background: canSend ? "var(--ink)" : "var(--rule)",
            color: canSend ? "var(--paper)" : "var(--ink-muted)",
            cursor: canSend ? "pointer" : "default",
          }}
        >
          <Icon.send size={15} />
        </button>
      </div>
      <div
        className="flex justify-between items-center mt-2"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 10.5,
          color: "var(--ink-muted)",
        }}
      >
        <span>Context: {contextLabel}</span>
        <span>⌘K</span>
      </div>
    </div>
  );
}
