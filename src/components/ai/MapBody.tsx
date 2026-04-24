import { useCallback, useEffect, useRef, useState } from "react";

import {
  ensureSummariesUpToPage,
  generateChapterSummary,
  generateMindMap,
  getMindMap,
  listChapterSummaries,
  type ChapterSummary,
  type MindMap,
  type MindMapNode,
} from "@/ai";
import { downloadExport, importFromFile, type ImportSummary } from "@/lib/export";
import { errorToString } from "@/ai/utils/str";

import { Status } from "./studyShared";

type Props = {
  active: boolean;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  currentPage: number;
};

type SummariesState =
  | { kind: "idle"; list: ChapterSummary[] }
  | { kind: "loading" }
  | { kind: "generating"; done: number; total: number }
  | { kind: "error"; message: string };

type MapState =
  | { kind: "idle"; map: MindMap | null }
  | { kind: "loading" }
  | { kind: "generating" }
  | { kind: "error"; message: string };

type ExportState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done" }
  | { kind: "error"; message: string };

type ImportState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; summary: ImportSummary }
  | { kind: "error"; message: string };

export function MapBody({ active, bookId, bookTitle, bookAuthor, currentPage }: Props) {
  const [summaries, setSummaries] = useState<SummariesState>({ kind: "loading" });
  const [map, setMap] = useState<MapState>({ kind: "loading" });
  const [exp, setExp] = useState<ExportState>({ kind: "idle" });
  const [imp, setImp] = useState<ImportState>({ kind: "idle" });

  const loadSummaries = useCallback(async () => {
    try {
      const list = await listChapterSummaries(bookId, currentPage);
      setSummaries({ kind: "idle", list });
    } catch (err) {
      setSummaries({
        kind: "error",
        message: errorToString(err),
      });
    }
  }, [bookId, currentPage]);

  const loadMap = useCallback(async () => {
    try {
      const existing = await getMindMap(bookId);
      setMap({ kind: "idle", map: existing });
    } catch (err) {
      setMap({
        kind: "error",
        message: errorToString(err),
      });
    }
  }, [bookId]);

  useEffect(() => {
    if (!active) return;
    void loadSummaries();
    void loadMap();
  }, [active, loadSummaries, loadMap]);

  const generateMissingSummaries = async () => {
    setSummaries({ kind: "generating", done: 0, total: 0 });
    try {
      await ensureSummariesUpToPage({
        bookId,
        bookTitle,
        bookAuthor,
        maxPage: currentPage,
        onProgress: (done, total) =>
          setSummaries({ kind: "generating", done, total }),
      });
      await loadSummaries();
    } catch (err) {
      setSummaries({
        kind: "error",
        message: errorToString(err),
      });
    }
  };

  const regenerateSummary = async (sectionIndex: number) => {
    try {
      await generateChapterSummary({
        bookId,
        bookTitle,
        bookAuthor,
        sectionIndex,
        maxPage: currentPage,
        force: true,
      });
      await loadSummaries();
    } catch (err) {
      setSummaries({
        kind: "error",
        message: errorToString(err),
      });
    }
  };

  const buildMap = async () => {
    setMap({ kind: "generating" });
    try {
      const m = await generateMindMap({
        bookId,
        bookTitle,
        bookAuthor,
        maxPage: currentPage,
      });
      setMap({ kind: "idle", map: m });
    } catch (err) {
      setMap({
        kind: "error",
        message: errorToString(err),
      });
    }
  };

  const runExport = async () => {
    setExp({ kind: "working" });
    try {
      await downloadExport();
      setExp({ kind: "done" });
      setTimeout(() => setExp({ kind: "idle" }), 2500);
    } catch (err) {
      setExp({
        kind: "error",
        message: errorToString(err),
      });
    }
  };

  const runImport = async (file: File) => {
    setImp({ kind: "working" });
    try {
      const summary = await importFromFile(file);
      setImp({ kind: "done", summary });
    } catch (err) {
      setImp({
        kind: "error",
        message: errorToString(err),
      });
    }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px 28px" }}>
      <SummariesSection
        state={summaries}
        onGenerate={() => void generateMissingSummaries()}
        onRegenerate={(i) => void regenerateSummary(i)}
      />

      <MapSection
        state={map}
        currentPage={currentPage}
        onBuild={() => void buildMap()}
      />

      <ExportSection
        exportState={exp}
        importState={imp}
        onExport={() => void runExport()}
        onImport={(file) => void runImport(file)}
      />
    </div>
  );
}

// -- Summaries ----------------------------------------------------------

function SummariesSection({
  state,
  onGenerate,
  onRegenerate,
}: {
  state: SummariesState;
  onGenerate: () => void;
  onRegenerate: (sectionIndex: number) => void;
}) {
  if (state.kind === "loading") {
    return (
      <SectionShell
        title="Chapter notes"
        hint="Loading…"
      >
        <SkeletonBlock />
      </SectionShell>
    );
  }

  if (state.kind === "error") {
    return (
      <SectionShell title="Chapter notes">
        <ErrorLine message={state.message} />
      </SectionShell>
    );
  }

  if (state.kind === "generating") {
    const pct = state.total === 0 ? 0 : Math.round((state.done / state.total) * 100);
    return (
      <SectionShell
        title="Chapter notes"
        hint={
          state.total === 0
            ? "Finding unread chapters…"
            : `Writing ${state.done + 1} / ${state.total}`
        }
      >
        <ProgressBar pct={pct / 100} />
      </SectionShell>
    );
  }

  const list = state.list;

  return (
    <SectionShell
      title="Chapter notes"
      action={
        <button
          type="button"
          className="outline-btn"
          onClick={onGenerate}
          style={{ padding: "5px 10px", fontSize: 11.5 }}
        >
          {list.length === 0 ? "Summarize" : "Summarize more"}
        </button>
      }
    >
      {list.length === 0 ? (
        <EmptyLine text="No chapter notes yet. The assistant will write a 120–180 word recap for each chapter you've finished." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {list.map((s) => (
            <SummaryCard
              key={`${s.bookId}:${s.sectionIndex}`}
              summary={s}
              onRegenerate={() => onRegenerate(s.sectionIndex)}
            />
          ))}
        </div>
      )}
    </SectionShell>
  );
}

function SummaryCard({
  summary,
  onRegenerate,
}: {
  summary: ChapterSummary;
  onRegenerate: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        border: "1px solid var(--rule-soft)",
        background: "var(--paper)",
      }}
    >
      <div
        className="flex items-start justify-between"
        style={{ gap: 10, marginBottom: open ? 10 : 0 }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            flex: 1,
            textAlign: "left",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: "var(--ink)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--heading-stack)",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink)",
              lineHeight: 1.3,
            }}
          >
            {summary.chapterTitle || `Section ${summary.sectionIndex + 1}`}
          </div>
          <div
            className="uppercase"
            style={{
              marginTop: 3,
              fontFamily: "var(--inter-stack)",
              fontSize: 9.5,
              letterSpacing: 1.2,
              color: "var(--ink-muted)",
            }}
          >
            Section {summary.sectionIndex + 1} · {open ? "collapse" : "expand"}
          </div>
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          title="Rewrite this summary"
          aria-label="Rewrite this summary"
          style={{
            background: "transparent",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            padding: "4px 7px",
            cursor: "pointer",
            color: "var(--ink-muted)",
          }}
        >
          <RefreshIcon />
        </button>
      </div>

      {open && (
        <p
          style={{
            margin: 0,
            fontFamily: "var(--serif-stack)",
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "var(--ink)",
            whiteSpace: "pre-wrap",
          }}
        >
          {summary.summary}
        </p>
      )}
    </div>
  );
}

// -- Mind map -----------------------------------------------------------

function MapSection({
  state,
  currentPage,
  onBuild,
}: {
  state: MapState;
  currentPage: number;
  onBuild: () => void;
}) {
  if (state.kind === "loading") {
    return (
      <SectionShell title="Mind map" hint="Loading…">
        <SkeletonBlock />
      </SectionShell>
    );
  }

  if (state.kind === "generating") {
    return (
      <SectionShell title="Mind map" hint="Analyzing chapters…">
        <Status text="Drafting the concept map — this reads your chapters end-to-end." />
      </SectionShell>
    );
  }

  if (state.kind === "error") {
    return (
      <SectionShell title="Mind map">
        <ErrorLine message={state.message} />
        <button
          type="button"
          className="outline-btn"
          style={{ marginTop: 10 }}
          onClick={onBuild}
        >
          Try again
        </button>
      </SectionShell>
    );
  }

  const map = state.map;
  const staleMap = map && map.maxPage < currentPage - 8;

  return (
    <SectionShell
      title="Mind map"
      action={
        map ? (
          <button
            type="button"
            className="outline-btn"
            onClick={onBuild}
            style={{ padding: "5px 10px", fontSize: 11.5 }}
          >
            Rebuild
          </button>
        ) : null
      }
      hint={map ? `drawn at p. ${map.maxPage}` : undefined}
    >
      {!map ? (
        <div>
          <EmptyLine text="A concept map of what you've read so far — chapter → key ideas. Useful when you want to see the shape of the book." />
          <button
            type="button"
            className="filled-btn"
            style={{ marginTop: 10 }}
            onClick={onBuild}
          >
            Draw the map
          </button>
        </div>
      ) : (
        <>
          {staleMap && (
            <div
              className="italic"
              style={{
                marginBottom: 10,
                fontFamily: "var(--serif-stack)",
                fontSize: 12,
                color: "var(--ink-muted)",
              }}
            >
              You&apos;ve read past where this was drawn (p. {map.maxPage}). Rebuild to include the newer chapters.
            </div>
          )}
          <MindMapTree map={map} />
        </>
      )}
    </SectionShell>
  );
}

function MindMapTree({ map }: { map: MindMap }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        border: "1px solid var(--rule-soft)",
        background: "var(--paper)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--heading-stack)",
          fontSize: 15,
          fontWeight: 600,
          color: "var(--ink)",
          marginBottom: 10,
          letterSpacing: -0.1,
        }}
      >
        {map.title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {map.branches.map((b, i) => (
          <Branch key={`${b.sectionIndex}-${i}`} branch={b} />
        ))}
      </div>
    </div>
  );
}

function Branch({
  branch,
}: {
  branch: MindMap["branches"][number];
}) {
  return (
    <div>
      <div
        className="uppercase"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 9.5,
          letterSpacing: 1.3,
          color: "var(--ink-muted)",
          marginBottom: 3,
        }}
      >
        Ch. {branch.sectionIndex + 1}
      </div>
      <div
        style={{
          fontFamily: "var(--heading-stack)",
          fontSize: 13.5,
          fontWeight: 600,
          color: "var(--ink)",
          marginBottom: 8,
        }}
      >
        {branch.chapterTitle}
      </div>
      <div
        style={{
          marginLeft: 2,
          borderLeft: "1px dotted var(--rule)",
          paddingLeft: 14,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {branch.nodes.map((n, i) => (
          <NodeRow key={i} node={n} depth={0} />
        ))}
      </div>
    </div>
  );
}

function NodeRow({ node, depth }: { node: MindMapNode; depth: number }) {
  const hasChildren = !!node.children && node.children.length > 0;
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "2px 0",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: depth === 0 ? "var(--ink)" : "var(--ink-muted)",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: depth === 0 ? 13.5 : 12.5,
            color: depth === 0 ? "var(--ink)" : "var(--ink-soft)",
            lineHeight: 1.45,
          }}
        >
          {node.label}
        </span>
      </div>
      {hasChildren && (
        <div
          style={{
            marginLeft: 3,
            borderLeft: "1px dotted var(--rule-soft)",
            paddingLeft: 14,
          }}
        >
          {node.children!.map((c, i) => (
            <NodeRow key={i} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// -- Export -------------------------------------------------------------

function ExportSection({
  exportState,
  importState,
  onExport,
  onImport,
}: {
  exportState: ExportState;
  importState: ImportState;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <SectionShell title="Backup">
      <p
        style={{
          margin: 0,
          marginBottom: 12,
          fontFamily: "var(--serif-stack)",
          fontSize: 13,
          lineHeight: 1.55,
          color: "var(--ink-muted)",
        }}
      >
        Download a JSON with your books, progress, highlights, cards, chats,
        and notes. API keys stay in the browser — they aren&apos;t included.
        After import, re-index each book from the Library to rebuild search.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="outline-btn"
          onClick={onExport}
          disabled={exportState.kind === "working"}
          style={{ flex: 1 }}
        >
          {exportState.kind === "working"
            ? "Packaging…"
            : exportState.kind === "done"
              ? "Saved"
              : exportState.kind === "error"
                ? "Retry export"
                : "Download"}
        </button>
        <button
          type="button"
          className="outline-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={importState.kind === "working"}
          style={{ flex: 1 }}
        >
          {importState.kind === "working"
            ? "Restoring…"
            : importState.kind === "done"
              ? "Restored"
              : importState.kind === "error"
                ? "Retry import"
                : "Restore…"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            // Let the same file be chosen again next time.
            e.target.value = "";
          }}
        />
      </div>

      {exportState.kind === "error" && (
        <ErrorLine message={exportState.message} />
      )}
      {importState.kind === "error" && (
        <ErrorLine message={importState.message} />
      )}
      {importState.kind === "done" && (
        <ImportSummaryLine summary={importState.summary} />
      )}
    </SectionShell>
  );
}

function ImportSummaryLine({ summary }: { summary: ImportSummary }) {
  const bits: string[] = [];
  if (summary.books) bits.push(`${summary.books} book${summary.books === 1 ? "" : "s"}`);
  if (summary.progress) bits.push(`${summary.progress} progress`);
  if (summary.highlights) bits.push(`${summary.highlights} highlights`);
  if (summary.cards) bits.push(`${summary.cards} cards`);
  if (summary.chapterSummaries)
    bits.push(`${summary.chapterSummaries} chapter notes`);
  if (summary.conversations) bits.push(`${summary.conversations} chats`);
  if (summary.bookIndex) bits.push(`${summary.bookIndex} index records`);
  const text = bits.length > 0 ? `Restored: ${bits.join(" · ")}.` : "Nothing found to restore.";
  return (
    <div
      style={{
        marginTop: 10,
        padding: "10px 12px",
        borderRadius: 10,
        background: "rgba(74,124,89,0.06)",
        border: "1px solid rgba(74,124,89,0.25)",
        fontFamily: "var(--serif-stack)",
        fontSize: 13,
        lineHeight: 1.5,
        color: "var(--ink)",
      }}
    >
      {text}
      {summary.skippedTables.length > 0 && (
        <div
          style={{
            marginTop: 6,
            fontFamily: "var(--mono-stack)",
            fontSize: 11,
            color: "var(--ink-muted)",
          }}
        >
          AI tables skipped — enable AI first, then re-import.
        </div>
      )}
    </div>
  );
}

// -- Primitives ---------------------------------------------------------

function SectionShell({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 26 }}>
      <div
        className="flex items-baseline justify-between"
        style={{ marginBottom: 10, gap: 10 }}
      >
        <div className="flex items-baseline" style={{ gap: 10 }}>
          <div
            className="uppercase"
            style={{
              fontFamily: "var(--inter-stack)",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1.4,
              color: "var(--ink-muted)",
            }}
          >
            {title}
          </div>
          {hint && (
            <div
              className="italic"
              style={{
                fontFamily: "var(--serif-stack)",
                fontSize: 11.5,
                color: "var(--ink-muted)",
              }}
            >
              {hint}
            </div>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SkeletonBlock() {
  return (
    <div
      style={{
        height: 68,
        borderRadius: 10,
        background: "rgba(127,127,127,0.05)",
        border: "1px solid var(--rule-soft)",
      }}
    />
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p
      className="italic"
      style={{
        margin: 0,
        fontFamily: "var(--serif-stack)",
        fontSize: 13,
        lineHeight: 1.55,
        color: "var(--ink-muted)",
      }}
    >
      {text}
    </p>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div
      style={{
        fontFamily: "var(--mono-stack)",
        fontSize: 11,
        color: "#c94a3b",
        whiteSpace: "pre-wrap",
      }}
    >
      {message}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      style={{
        height: 3,
        borderRadius: 2,
        background: "var(--rule)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.min(100, Math.max(0, pct * 100))}%`,
          height: "100%",
          background: "var(--ink-soft)",
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

