"use client";

/**
 * ModePill — the segmented Novel / Study / Article / Focus control in the
 * reader top bar.
 */

import { SURFACE_IDS, type SurfaceId } from "@/lib/modes";

export function ModePill({
  mode,
  onChange,
}: {
  mode: SurfaceId;
  onChange: (m: SurfaceId) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-[2px]"
      style={{
        background: "var(--paper-deep)",
        border: "1px solid var(--rule-soft)",
        borderRadius: 99,
        padding: 3,
      }}
    >
      {SURFACE_IDS.map((m) => {
        const active = m === mode;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className="cursor-pointer transition-all"
            style={{
              padding: "5px 12px",
              borderRadius: 99,
              border: "none",
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--paper)" : "var(--ink-soft)",
              fontFamily: "var(--inter-stack)",
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: "capitalize",
            }}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}
