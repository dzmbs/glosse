"use client";

/**
 * BookPage — scrollable chapter surface. Ports the single-column form of
 * BookPage from glosse-design/src/reader.jsx.
 *
 *   [running head: book title ↔ chapter]   (novel/focus only)
 *   [chapter head]                           (variant per surface mode)
 *   [injected EPUB HTML]                     (drop cap on novel/article/focus)
 *
 * LATER: two-page spread (novel). LATER: margin AI notes. LATER: inline
 * annotations that open a popover.
 */

import { ChapterHead } from "@/components/reader/ChapterHead";
import type { ModeSpec } from "@/lib/modes";

type Props = {
  html: string;
  chapterIndex: number;
  chaptersTotal: number;
  bookTitle: string;
  chapterTitle: string;
  mode: ModeSpec;
};

export function BookPage({
  html,
  chapterIndex,
  chaptersTotal,
  bookTitle,
  chapterTitle,
  mode,
}: Props) {
  return (
    <div
      className="flex-1 min-w-0 overflow-auto reader-scroll"
      style={{ background: "var(--paper)" }}
    >
      <div
        className="mx-auto reader-column"
        style={{
          width: "100%",
          maxWidth: 760,
          padding: "64px var(--page-pad) 140px",
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
              {chapterIndex + 1}
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
            <span>Ch. {chapterIndex + 1} of {chaptersTotal}</span>
            <span
              style={{
                fontFamily: "var(--mono-stack)",
                fontSize: 11,
                letterSpacing: 0.5,
                textTransform: "none",
              }}
            >
              {chapterIndex + 1}
            </span>
          </div>
        )}

        <ChapterHead
          variant={mode.chapterHead}
          index={chapterIndex}
          title={chapterTitle}
          // LATER: once the ingest pipeline surfaces TOC subtitles as
          // separate fields we can pass `sub` in for the banner variant.
          sub={null}
          kicker={null}
        />

        <article
          className={"chapter-html" + (mode.dropcap ? " dropcap" : "")}
          // eslint-disable-next-line react/no-danger -- HTML is sanitised at ingest time.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
