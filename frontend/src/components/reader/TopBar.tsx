"use client";

/**
 * ReaderTopBar — ports ReaderTopBar from glosse-design/src/reader.jsx.
 *
 *   [library] [toc]   <title> · <tocTitle> · %   [ModePill]  [pencil] [tweaks] [highlight] [Ask]
 *
 * The sub-line under the book title shows the chapter title resolved
 * from the TOC (e.g. "CHAPTER I · JONATHAN HARKER'S JOURNAL"), NOT the
 * spine index. Spine index != book chapter number — front matter pushes
 * them apart.
 */

import Link from "next/link";

import { Icon } from "@/components/Icons";
import { ModePill } from "@/components/reader/ModePill";
import { useTweaks } from "@/lib/tweaks";

export function ReaderTopBar({
  bookTitle,
  chapterLabel,
  progressPct,
  onOpenToc,
  onOpenHighlights,
  onOpenTweaks,
  onAskToggle,
  onPencil,
}: {
  bookTitle: string;
  /** TOC-derived title for the current section, already uppercased /
   *  truncated by the parent. Falls back to e.g. "Section 5". */
  chapterLabel: string;
  progressPct: number;
  onOpenToc: () => void;
  onOpenHighlights: () => void;
  onOpenTweaks: () => void;
  onAskToggle: () => void;
  onPencil?: () => void;
}) {
  const { tweaks, setTweaks } = useTweaks();

  return (
    <header
      className="flex items-center gap-[14px] px-[22px] py-[14px] border-b"
      style={{
        background: "var(--paper)",
        borderColor: "var(--rule-soft)",
        position: "relative",
        zIndex: 5,
      }}
    >
      <Link href="/" className="icon-btn" title="Library">
        <Icon.library size={18} />
      </Link>
      <button type="button" className="icon-btn" onClick={onOpenToc} title="Contents">
        <Icon.toc size={18} />
      </button>

      <div className="flex-1 flex flex-col items-center gap-[3px] min-w-0">
        <div
          className="truncate max-w-full"
          style={{
            fontFamily: "var(--heading-stack)",
            fontSize: 14,
            fontWeight: 500,
            color: "var(--ink)",
            letterSpacing: 0.2,
          }}
        >
          {bookTitle}
        </div>
        <div
          className="truncate max-w-full uppercase"
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 10,
            fontWeight: 500,
            color: "var(--ink-muted)",
            letterSpacing: 1.4,
          }}
          title={chapterLabel}
        >
          {chapterLabel} · {Math.round(progressPct * 100)}%
        </div>
      </div>

      <ModePill mode={tweaks.surface} onChange={(m) => setTweaks({ surface: m })} />

      {/* LATER: pencil opens a freeform annotation composer. */}
      <button type="button" className="icon-btn" onClick={onPencil} title="Note">
        <Icon.pencil size={16} />
      </button>

      <button type="button" className="icon-btn" onClick={onOpenTweaks} title="Display">
        <Icon.settings size={18} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={onOpenHighlights}
        title="Highlights"
      >
        <Icon.highlight size={18} />
      </button>

      <button type="button" className="ai-btn" onClick={onAskToggle} title="Ask AI">
        <Icon.sparkle size={15} />
        <span>Ask</span>
      </button>
    </header>
  );
}
