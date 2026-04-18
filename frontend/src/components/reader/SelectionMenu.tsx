"use client";

/**
 * SelectionMenu — the floating dark pill that appears above selected text.
 *
 * The reader owns the selection tracking (in ReaderClient) and renders this
 * menu when a selection is active inside the chapter area. Ask / Define /
 * Explain feed the AI panel via a seed. Highlight / Note are LATER — no
 * storage yet; buttons stay visible for parity with the design.
 */

import { Icon } from "@/components/Icons";

export type SelectionAction = "ask" | "define" | "explain" | "highlight" | "note";

const ITEMS: Array<{ id: SelectionAction; label: string; icon: keyof typeof Icon; later?: true }> = [
  { id: "ask", label: "Ask", icon: "sparkle" },
  { id: "define", label: "Define", icon: "define" },
  { id: "explain", label: "Explain", icon: "explain" },
  { id: "highlight", label: "Highlight", icon: "highlight", later: true },
  { id: "note", label: "Note", icon: "notes", later: true },
];

export function SelectionMenu({
  x,
  y,
  onAction,
}: {
  x: number;
  y: number;
  onAction: (id: SelectionAction) => void;
}) {
  return (
    <div
      className="sel-menu"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      {ITEMS.map((a, i) => {
        const I = Icon[a.icon];
        return (
          <span key={a.id} className="flex items-center">
            {i > 0 && <span className="sel-sep" />}
            <button
              type="button"
              className="sel-btn"
              onClick={() => onAction(a.id)}
              title={a.later ? `${a.label} (LATER)` : a.label}
              style={a.later ? { opacity: 0.55 } : undefined}
            >
              <I size={14} />
              <span>{a.label}</span>
            </button>
          </span>
        );
      })}
    </div>
  );
}
