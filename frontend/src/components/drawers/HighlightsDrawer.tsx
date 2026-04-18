"use client";

/**
 * HighlightsDrawer — polished shell, stubbed content.
 *
 * LATER: once the backend has a highlights storage model
 * (glosse/engine/highlights.py — not yet created), fetch real highlights
 * and notes, render them with chapter/page, color chip, and user note,
 * and wire filter pills (All / Highlights / Notes / AI asked).
 */

import { Drawer } from "@/components/drawers/Drawer";

export function HighlightsDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Highlights & Notes" width={460}>
      <div
        className="flex gap-2 border-b"
        style={{
          padding: "14px 22px 8px",
          borderColor: "var(--rule-soft)",
        }}
      >
        {["All", "Highlights", "Notes", "AI asked"].map((t, i) => (
          <button
            key={t}
            type="button"
            className="cursor-pointer"
            style={{
              padding: "5px 12px",
              borderRadius: 99,
              background: i === 0 ? "var(--ink)" : "transparent",
              color: i === 0 ? "var(--paper)" : "var(--ink-soft)",
              border: i === 0 ? "none" : "1px solid var(--rule)",
              fontFamily: "var(--inter-stack)",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-8">
        <div
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: 16,
            color: "var(--ink)",
            lineHeight: 1.6,
            marginBottom: 14,
          }}
        >
          No highlights yet.
        </div>
        <div
          className="italic"
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: 13.5,
            color: "var(--ink-muted)",
            lineHeight: 1.6,
          }}
        >
          Select a passage in the reader to save a highlight or attach a
          note. A dedicated highlights store is on the roadmap —
          <code
            className="mx-1"
            style={{ fontFamily: "var(--mono-stack)", fontSize: 12 }}
          >
            glosse/engine/highlights.py
          </code>
          — until it lands this list is empty.
        </div>
      </div>
    </Drawer>
  );
}
