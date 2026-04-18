"use client";

/**
 * ReaderBottomBar — ports ReaderBottomBar from glosse-design/src/reader.jsx.
 *
 *   p.X / Y    [<]  [----||------------------]  [>]    N min left in chapter
 *
 * The design uses pages. We have chapters, and estimate reading time from
 * the chapter's word count assuming 240 wpm.
 */

import { Icon } from "@/components/Icons";

export function ReaderBottomBar({
  chapterIndex,
  chaptersTotal,
  prevHref,
  nextHref,
  onPrev,
  onNext,
  minutesLeft,
}: {
  chapterIndex: number;
  chaptersTotal: number;
  prevHref: string | null;
  nextHref: string | null;
  onPrev?: () => void;
  onNext?: () => void;
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
        <NavBtn href={prevHref} onClick={onPrev} ariaLabel="Previous chapter">
          <Icon.chevL />
        </NavBtn>
        <div
          className="flex-1 relative"
          style={{
            height: 2,
            background: "var(--rule)",
            borderRadius: 2,
          }}
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
        <NavBtn href={nextHref} onClick={onNext} ariaLabel="Next chapter">
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
  href,
  onClick,
  ariaLabel,
  children,
}: {
  href: string | null;
  onClick?: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <span className="icon-btn opacity-40" aria-disabled="true" aria-label={ariaLabel}>
        {children}
      </span>
    );
  }
  // Use anchor for prefetching; onClick lets the parent bump local state.
  return (
    <a className="icon-btn" href={href} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </a>
  );
}
