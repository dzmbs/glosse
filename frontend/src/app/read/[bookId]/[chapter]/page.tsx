/**
 * /read/[bookId]/[chapter] — reader page.
 *
 * Server Component fetches both the book detail (for TOC) and the chapter
 * content. The interactive chrome (AI panel, selection menu, surface-mode
 * switcher) lives in client components under ../../../components.
 *
 * Minimal scaffold: top bar, scrollable chapter, bottom bar, stubbed AI
 * panel on the right. The frontend dev builds out from here — see
 * glosse-design/src for the full target design.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { GuidePanel } from "@/components/GuidePanel";

export const dynamic = "force-dynamic";

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ bookId: string; chapter: string }>;
}) {
  const { bookId, chapter } = await params;
  const chapterIndex = Number.parseInt(chapter, 10);
  if (!Number.isFinite(chapterIndex)) notFound();

  const [book, ch] = await Promise.all([
    api.book(bookId),
    api.chapter(bookId, chapterIndex),
  ]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TopBar
        bookId={bookId}
        title={book.title}
        chapterIndex={chapterIndex}
        chaptersTotal={ch.chapters_total}
      />

      <div className="flex flex-1 overflow-hidden">
        <main
          className="flex-1 overflow-y-auto"
          style={{ background: "var(--color-paper)" }}
        >
          <article
            className="mx-auto max-w-[640px] px-16 py-16 pb-32"
            style={{ color: "var(--color-ink)" }}
          >
            <ChapterHead title={ch.title} index={ch.index} />
            <div
              className="chapter-html"
              // eslint-disable-next-line react/no-danger -- HTML is sanitised at ingest time.
              dangerouslySetInnerHTML={{ __html: ch.html }}
            />
          </article>
        </main>

        {/*
          AI panel. Right drawer, 440px. Currently a client-component shell
          that POSTs to /api/guide with the current bookId + chapterIndex.
          LATER: port the full AIPanel from glosse-design (quick-action
          tiles, answer/summary/define cards, quiz view, composer).
        */}
        <aside
          className="w-[440px] flex-shrink-0 overflow-y-auto border-l"
          style={{
            background: "var(--color-panel)",
            borderColor: "var(--color-rule-soft)",
          }}
        >
          <GuidePanel bookId={bookId} chapterIndex={chapterIndex} />
        </aside>
      </div>

      <BottomBar
        bookId={bookId}
        chapterIndex={chapterIndex}
        prev={ch.prev_index}
        next={ch.next_index}
        chaptersTotal={ch.chapters_total}
      />
    </div>
  );
}

function ChapterHead({ title, index }: { title: string; index: number }) {
  return (
    <header className="mb-10 text-center">
      <div
        className="mb-3 text-xs uppercase italic tracking-[0.35em]"
        style={{ color: "var(--color-ink-muted)" }}
      >
        Chapter
      </div>
      <div
        className="text-6xl font-normal"
        style={{ color: "var(--color-ink)", fontFamily: "var(--font-serif)" }}
      >
        {index + 1}
      </div>
      <div
        className="mx-auto mt-5 h-px w-8 opacity-50"
        style={{ background: "var(--color-ink-muted)" }}
      />
      {/* Title is the chapter's best-guess title from ingest; often a
          generic "Section N". LATER: resolve the real TOC title here. */}
      {title && !/^Section \d+$/.test(title) && (
        <div
          className="mt-4 text-sm italic"
          style={{ color: "var(--color-ink-soft)" }}
        >
          {title}
        </div>
      )}
    </header>
  );
}

function TopBar({
  bookId,
  title,
  chapterIndex,
  chaptersTotal,
}: {
  bookId: string;
  title: string;
  chapterIndex: number;
  chaptersTotal: number;
}) {
  const pct = Math.round(((chapterIndex + 1) / chaptersTotal) * 100);
  return (
    <header
      className="flex items-center gap-4 border-b px-6 py-3"
      style={{
        background: "var(--color-paper)",
        borderColor: "var(--color-rule-soft)",
      }}
    >
      <Link
        href="/"
        className="text-sm underline-offset-4 hover:underline"
        style={{
          fontFamily: "var(--font-sans)",
          color: "var(--color-ink-soft)",
        }}
      >
        ← Library
      </Link>
      <div className="flex flex-1 flex-col items-center">
        <div
          className="text-sm font-medium"
          style={{ fontFamily: "var(--font-serif)", color: "var(--color-ink)" }}
        >
          {title}
        </div>
        <div
          className="text-[10px] font-medium uppercase tracking-widest"
          style={{
            fontFamily: "var(--font-sans)",
            color: "var(--color-ink-muted)",
          }}
        >
          Chapter {chapterIndex + 1} · {pct}%
        </div>
      </div>
      {/*
        LATER: surface-mode pill (novel/study/article/focus), highlights
        icon, display-settings icon, Ask pill (toggles the AI panel).
        See glosse-design/src/reader.jsx ReaderTopBar.
      */}
      <div
        className="text-xs"
        style={{
          fontFamily: "var(--font-sans)",
          color: "var(--color-ink-muted)",
        }}
      >
        {/* placeholder for mode / tool strip */}
        {bookId}
      </div>
    </header>
  );
}

function BottomBar({
  bookId,
  chapterIndex,
  prev,
  next,
  chaptersTotal,
}: {
  bookId: string;
  chapterIndex: number;
  prev: number | null;
  next: number | null;
  chaptersTotal: number;
}) {
  return (
    <footer
      className="flex items-center gap-6 border-t px-6 py-3"
      style={{
        background: "var(--color-paper)",
        borderColor: "var(--color-rule-soft)",
      }}
    >
      <div
        className="min-w-24 text-xs"
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--color-ink-muted)",
        }}
      >
        {chapterIndex + 1} / {chaptersTotal}
      </div>
      <div className="flex flex-1 items-center gap-3">
        <NavButton href={prev === null ? null : `/read/${bookId}/${prev}`}>
          ← Previous
        </NavButton>
        <div
          className="relative h-0.5 flex-1 rounded-full"
          style={{ background: "var(--color-rule)" }}
        >
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{
              width: `${((chapterIndex + 1) / chaptersTotal) * 100}%`,
              background: "var(--color-ink-soft)",
            }}
          />
        </div>
        <NavButton href={next === null ? null : `/read/${bookId}/${next}`}>
          Next →
        </NavButton>
      </div>
      {/* LATER: reading-time-left estimate ("14 min left in chapter"). */}
      <div className="min-w-28 text-right text-xs" style={{ color: "transparent" }}>
        &nbsp;
      </div>
    </footer>
  );
}

function NavButton({
  href,
  children,
}: {
  href: string | null;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <span
        className="cursor-default rounded border px-3 py-1.5 text-xs opacity-40"
        style={{
          fontFamily: "var(--font-sans)",
          borderColor: "var(--color-rule)",
          color: "var(--color-ink-muted)",
        }}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded border px-3 py-1.5 text-xs transition-colors hover:opacity-80"
      style={{
        fontFamily: "var(--font-sans)",
        borderColor: "var(--color-rule)",
        color: "var(--color-ink)",
      }}
    >
      {children}
    </Link>
  );
}
