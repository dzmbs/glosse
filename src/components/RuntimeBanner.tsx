import { useState } from "react";

import {
  describeRuntimeConcerns,
  getRuntimeReport,
} from "@/lib/runtimeCheck";

const DISMISS_KEY = "glosse.runtimeBanner.dismissed";

export function RuntimeBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [hidden, setHidden] = useState(false);

  const [description] = useState(() => describeRuntimeConcerns(getRuntimeReport()));

  if (!description || dismissed || hidden) return null;

  const accent = description.severity === "error" ? "#c94a3b" : "#c9802b";
  const bg =
    description.severity === "error"
      ? "rgba(201,74,59,0.06)"
      : "rgba(201,128,43,0.08)";

  const dismiss = () => {
    setHidden(true);
    if (description.severity === "warning") {
      try {
        localStorage.setItem(DISMISS_KEY, "1");
        setDismissed(true);
      } catch {
        // Local storage may be unavailable — fine, banner just won't persist its dismissal.
      }
    }
  };

  return (
    <div
      role={description.severity === "error" ? "alert" : "status"}
      style={{
        padding: "10px 16px",
        background: bg,
        borderBottom: `1px solid ${accent}33`,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        fontFamily: "var(--serif-stack)",
      }}
    >
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5, color: "var(--ink)" }}>
        <div
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 1.1,
            textTransform: "uppercase",
            color: accent,
            marginBottom: 3,
          }}
        >
          {description.title}
        </div>
        <div style={{ color: "var(--ink-soft)" }}>{description.detail}</div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        style={{
          border: "1px solid var(--rule)",
          background: "var(--paper)",
          borderRadius: 6,
          padding: "3px 10px",
          fontFamily: "var(--inter-stack)",
          fontSize: 11,
          color: "var(--ink)",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        {description.severity === "error" ? "Dismiss" : "Got it"}
      </button>
    </div>
  );
}

