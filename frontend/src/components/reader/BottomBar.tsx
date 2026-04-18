"use client";

/**
 * ReaderBottomBar — ports ReaderBottomBar from glosse-design/src/reader.jsx.
 *
 *   ch. X / Y    [<]  [----||------------------]  [>]    N min left in chapter
 *
 * Prev/next are buttons — the parent owns the chapter state and animates the
 * swap client-side. We no longer use `<a href>` here because full-page
 * navigation would kill the View Transitions animation.
 */

import { Icon } from "@/components/Icons";

export function ReaderBottomBar({
  chapterIndex,
  chaptersTotal,
  canPrev,
  canNext,
  onPrev,
  onNext,
  minutesLeft,
}: {
  chapterIndex: number;
  chaptersTotal: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  minutesLeft: number | null;
}) {
  const pct = Math.min(1, Math.max(0, (chapterIndex + 1) / chaptersTotal));

  // LATER: TOC ticks from real section breakpoints. For now spread marks
  // evenly so the rail has some rhythm.
  const ticks = [0.08, 0.17, 0.31, 0.48, 0.67, 0.82];

  return (
    <footer
      className="flex items-center gap-5 border-t"
      style={{
        padding: "12px 24px 16px",
        background: "var(--paper)",
        borderColor: "var(--rule-soft)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono-stack)",
          fontSize: 11,
          color: "var(--ink-muted)",
          letterSpacing: 0.5,
          minWidth: 90,
        }}
      >
        ch. {chapterIndex + 1} / {chaptersTotal}
      </div>

      <div className="flex-1 flex items-center gap-[14px]">
        <NavBtn disabled={!canPrev} onClick={onPrev} ariaLabel="Previous chapter">
          <Icon.chevL />
        </NavBtn>
        <div
          className="flex-1 relative"
          style={{ height: 2, background: "var(--rule)", borderRadius: 2 }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 rounded-[2px]"
            style={{ width: `${pct * 100}%`, background: "var(--ink-soft)" }}
          />
          {ticks.map((t, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${t * 100}%`,
                top: -3,
                bottom: -3,
                width: 1,
                background: "var(--rule)",
              }}
            />
          ))}
        </div>
        <NavBtn disabled={!canNext} onClick={onNext} ariaLabel="Next chapter">
          <Icon.chevR />
        </NavBtn>
      </div>

      <div
        style={{
          fontFamily: "var(--mono-stack)",
          fontSize: 11,
          color: "var(--ink-muted)",
          letterSpacing: 0.5,
          minWidth: 140,
          textAlign: "right",
        }}
      >
        {minutesLeft !== null ? `${minutesLeft} min left in chapter` : "\u00A0"}
      </div>
    </footer>
  );
}

function NavBtn({
  disabled,
  onClick,
  ariaLabel,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="icon-btn"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      style={disabled ? { opacity: 0.4, cursor: "default" } : undefined}
    >
      {children}
    </button>
  );
}
