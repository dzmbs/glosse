"use client";

/**
 * BookPage — scrollable chapter surface. Ports the single-column form of
 * BookPage from glosse-design/src/reader.jsx.
 *
 *   [running head: book title ↔ section]   (novel/focus only)
 *   [injected EPUB HTML]                    (drop cap on novel/article/focus)
 *
 * We deliberately DO NOT synthesize a "Chapter N" head above the injected
 * HTML. The EPUB's own markup almost always includes the publisher's
 * chapter heading ("CHAPTER V", "§6.2 Gradient-Based Learning"); adding
 * our own would double up the label — and because spine index ≠ real
 * chapter number, the synthesized label was almost always wrong anyway.
 *
 * LATER: two-page spread (novel). LATER: margin AI notes. LATER: inline
 * annotations that open a popover.
 */

import { memo, useMemo } from "react";

import type { ModeSpec } from "@/lib/modes";

type Props = {
  html: string;
  sectionIndex: number;     // spine position, 0-based
  sectionsTotal: number;
  bookTitle: string;
  // Best-known title for this section — from TOC if available, otherwise
  // the spine fallback ("Section N"). Used in the running head.
  sectionTitle: string | null;
  mode: ModeSpec;
};

function BookPageImpl({
  html,
  sectionIndex,
  sectionsTotal,
  bookTitle,
  sectionTitle,
  mode,
}: Props) {
  // Stable reference so React's dangerouslySetInnerHTML diff can't trip on
  // a fresh object literal and re-apply innerHTML (which would clear any
  // active text selection inside the article).
  const htmlProps = useMemo(() => ({ __html: html }), [html]);
  const isNovelSpread = mode.id === "novel";

  return (
    <div
      className={"flex-1 min-w-0 overflow-auto reader-scroll" + (isNovelSpread ? " reader-scroll--novel" : "")}
      style={{ background: "var(--paper)" }}
    >
      <div
        className={"mx-auto reader-column" + (isNovelSpread ? " reader-column--spread" : "")}
        style={{
          width: "100%",
          maxWidth: isNovelSpread ? 1180 : 760,
          padding: isNovelSpread ? "56px var(--page-pad) 140px" : "64px var(--page-pad) 140px",
          boxSizing: "border-box",
          // Tag for the View Transitions API — lets globals.css slide the
          // chapter in/out when the parent calls startViewTransition().
          viewTransitionName: "chapter",
        }}
      >
        {/* Running head — novel/focus */}
        {mode.runningHead ? (
          <div
            className="flex justify-between italic uppercase"
            style={{
              fontFamily: "var(--serif-stack)",
              fontSize: 11.5,
              color: "var(--ink-muted)",
              letterSpacing: 1.2,
              marginBottom: 34,
              height: 14,
            }}
          >
            <span>{bookTitle}</span>
            <span
              style={{
                fontStyle: "normal",
                textTransform: "none",
                letterSpacing: 0,
                fontSize: 12,
              }}
            >
              {sectionIndex + 1}
            </span>
          </div>
        ) : (
          <div
            className="flex justify-between items-center uppercase mb-[22px]"
            style={{
              fontFamily: "var(--inter-stack)",
              fontSize: 10.5,
              letterSpacing: 1.2,
              color: "var(--ink-muted)",
              fontWeight: 500,
            }}
          >
            <span>
              {sectionTitle && !/^Section \d+$/i.test(sectionTitle)
                ? sectionTitle
                : `Section ${sectionIndex + 1} of ${sectionsTotal}`}
            </span>
            <span
              style={{
                fontFamily: "var(--mono-stack)",
                fontSize: 11,
                letterSpacing: 0.5,
                textTransform: "none",
              }}
            >
              {sectionIndex + 1}
            </span>
          </div>
        )}

        <article
          className={
            "chapter-html" +
            (mode.dropcap ? " dropcap" : "") +
            (isNovelSpread ? " chapter-html--spread" : "")
          }
          // eslint-disable-next-line react/no-danger -- HTML is sanitised at ingest time.
          dangerouslySetInnerHTML={htmlProps}
        />
      </div>
    </div>
  );
}

// Memoised so selection-state churn on the parent doesn't re-render the
// chapter HTML and blow away the user's live text selection.
export const BookPage = memo(BookPageImpl);
