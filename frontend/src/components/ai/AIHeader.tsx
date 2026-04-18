"use client";

import { Icon } from "@/components/Icons";

export function AIHeader({
  mode,
  chapterLabel,
  onBack,
  onClose,
}: {
  mode: "chat" | "quiz";
  chapterLabel: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const isRoot = mode === "chat";
  const title = isRoot ? "Lamp" : mode === "quiz" ? "Quiz" : "Ask";
  const sub = isRoot ? `Reading with you · ${chapterLabel}` : "Lamp";

  return (
    <div
      className="flex items-center gap-[10px]"
      style={{
        padding: "18px 18px 14px",
        borderBottom: "1px solid var(--rule-soft)",
      }}
    >
      {isRoot ? (
        <div
          className="flex items-center justify-center"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "var(--ink)",
            color: "var(--paper)",
          }}
        >
          <Icon.sparkle size={15} />
        </div>
      ) : (
        <button
          type="button"
          className="icon-btn"
          onClick={onBack}
          aria-label="Back"
          style={{ marginRight: 2 }}
        >
          <Icon.chevL size={16} />
        </button>
      )}

      <div className="flex-1 flex flex-col leading-[1.15]">
        <div
          style={{
            fontFamily: "var(--heading-stack)",
            fontSize: 16,
            fontWeight: 500,
            color: "var(--ink)",
          }}
        >
          {title}
        </div>
        <div
          className="uppercase"
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 10.5,
            color: "var(--ink-muted)",
            letterSpacing: 1.2,
            fontWeight: 500,
          }}
        >
          {sub}
        </div>
      </div>

      <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel">
        <Icon.close size={16} />
      </button>
    </div>
  );
}
