import { useCallback, useState } from "react";

import { deleteHighlight, type Highlight } from "@/ai/highlights";
import { Icon } from "@/components/Icons";

type Props = {
  /** Live highlight list owned by the reader. Lifting state here keeps
   *  the Saved tab in sync immediately when the user creates one — no
   *  tab-switch dance, no version-counter ping-pong. */
  highlights: Highlight[];
  onJump: (cfi: string) => void;
  onRemoved?: (id: string) => void;
};

export function HighlightsBody({ highlights, onJump, onRemoved }: Props) {
  const items = highlights;
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteHighlight(id);
        onRemoved?.(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [onRemoved],
  );

  if (error && items.length === 0) {
    return (
      <div style={{ padding: "22px" }}>
        <div
          className="uppercase"
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 10.5,
            letterSpacing: 1.4,
            color: "var(--ink-muted)",
            marginBottom: 6,
          }}
        >
          Couldn&apos;t load
        </div>
        <div
          style={{
            fontFamily: "var(--mono-stack)",
            fontSize: 11.5,
            color: "var(--ink-muted)",
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: "28px 22px" }}>
        <p
          className="italic"
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: 15,
            color: "var(--ink-soft)",
            lineHeight: 1.55,
          }}
        >
          Nothing highlighted yet. Select text in the reader and tap
          <b> Highlight</b> to save it here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 20px" }}>
      {items.map((h) => (
        <HighlightRow
          key={h.id}
          highlight={h}
          onJump={() => onJump(h.cfi)}
          onDelete={() => void remove(h.id)}
        />
      ))}
    </div>
  );
}

function HighlightRow({
  highlight,
  onJump,
  onDelete,
}: {
  highlight: Highlight;
  onJump: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="group relative"
      style={{
        padding: "12px 14px 12px 16px",
        borderRadius: 10,
        borderLeft: "3px solid rgba(255,214,90,0.8)",
        background: "rgba(255,214,90,0.08)",
        marginBottom: 8,
      }}
    >
      <button
        type="button"
        onClick={onJump}
        className="text-left w-full"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "var(--ink)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: 13.5,
            lineHeight: 1.55,
            color: "var(--ink)",
          }}
        >
          {highlight.text}
        </div>
        <div
          className="uppercase"
          style={{
            marginTop: 6,
            fontFamily: "var(--inter-stack)",
            fontSize: 10,
            letterSpacing: 1.1,
            color: "var(--ink-muted)",
          }}
        >
          {highlight.pageNumber ? `p. ${highlight.pageNumber}` : "saved"} ·
          {" "}
          {new Date(highlight.createdAt * 1000).toLocaleDateString()}
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="icon-btn absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remove highlight"
        style={{ width: 26, height: 26 }}
      >
        <Icon.close size={12} />
      </button>
    </div>
  );
}

