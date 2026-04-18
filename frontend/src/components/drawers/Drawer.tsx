"use client";

/**
 * Base Drawer — left-sliding panel with a scrim. Ports the Drawer helper
 * from glosse-design/src/drawers.jsx.
 */

import { useEffect } from "react";

import { Icon } from "@/components/Icons";

export function Drawer({
  open,
  onClose,
  title,
  width = 420,
  children,
  side = "left",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  width?: number;
  children: React.ReactNode;
  side?: "left" | "right";
}) {
  // Close on Escape for a cheap keyboard affordance.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const originOffset = side === "left" ? -width - 10 : width + 10;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0"
        style={{
          background: "rgba(26,22,18,0.35)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.25s ease",
          zIndex: 40,
        }}
      />
      <aside
        className="fixed top-0 bottom-0 flex flex-col"
        style={{
          [side]: 0,
          width,
          background: "var(--paper)",
          boxShadow:
            side === "left"
              ? "8px 0 40px rgba(26,22,18,0.18)"
              : "-8px 0 40px rgba(26,22,18,0.18)",
          transform: open ? "translateX(0)" : `translateX(${originOffset}px)`,
          transition: "transform 0.32s cubic-bezier(0.32, 0.72, 0.24, 1)",
          zIndex: 41,
        }}
      >
        <div
          className="flex items-center gap-[10px]"
          style={{
            padding: "22px 22px 16px",
            borderBottom: "1px solid var(--rule-soft)",
          }}
        >
          <div
            className="flex-1"
            style={{
              fontFamily: "var(--serif-stack)",
              fontSize: 22,
              fontWeight: 500,
              color: "var(--ink)",
            }}
          >
            {title}
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            <Icon.close size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </aside>
    </>
  );
}
