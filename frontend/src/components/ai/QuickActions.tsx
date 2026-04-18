"use client";

import { Icon } from "@/components/Icons";

export type QuickActionId = "summarize" | "quiz" | "explain" | "characters" | "check";

const TILES: Array<{
  id: QuickActionId;
  label: string;
  sub: string;
  icon: keyof typeof Icon;
}> = [
  { id: "summarize", label: "Summarize", sub: "this chapter", icon: "summary" },
  { id: "quiz", label: "Quiz me", sub: "4 questions", icon: "quiz" },
  { id: "explain", label: "Explain", sub: "this page", icon: "explain" },
  { id: "characters", label: "Who is who", sub: "so far", icon: "define" },
];

export function QuickActions({ onPick }: { onPick: (id: QuickActionId) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-[18px]">
      {TILES.map((t) => {
        const I = Icon[t.icon];
        return (
          <button
            key={t.id}
            type="button"
            className="quick-tile"
            onClick={() => onPick(t.id)}
          >
            <span style={{ color: "var(--accent)" }}>
              <I size={15} />
            </span>
            <span className="flex flex-col gap-[1px]">
              <span
                style={{
                  fontFamily: "var(--inter-stack)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ink)",
                  whiteSpace: "nowrap",
                }}
              >
                {t.label}
              </span>
              <span
                style={{
                  fontFamily: "var(--inter-stack)",
                  fontSize: 11,
                  color: "var(--ink-muted)",
                }}
              >
                {t.sub}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
