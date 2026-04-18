"use client";

/**
 * TOCDrawer — flattens the book's TOC tree into a single vertical list with
 * chapter numbers, subtitles, read-marks, and a "READING" badge on the
 * current chapter. Jump-to-chapter navigates via the reader router.
 *
 * The backend returns:
 *   - book.spine[]  — linear reading order (our chapter_index is the index here)
 *   - book.toc[]    — tree of TOCEntry nodes; each .file_href matches a spine href
 *
 * For each TOC entry we find the spine index whose `href` starts with the
 * entry's `file_href` (the TOC often encodes anchors that differ from the
 * spine filename). If no match, we skip.
 */

import Link from "next/link";

import { Drawer } from "@/components/drawers/Drawer";
import { Icon } from "@/components/Icons";
import type { BookDetail, TOCNode } from "@/lib/api";

type FlatEntry = {
  title: string;
  sub?: string | null;
  spineIndex: number;
  depth: number;
};

function flattenToc(
  toc: TOCNode[],
  hrefToSpine: Map<string, number>,
  depth = 0,
): FlatEntry[] {
  const out: FlatEntry[] = [];
  for (const n of toc) {
    const idx = hrefToSpine.get(n.file_href);
    if (typeof idx === "number") {
      out.push({ title: n.title, sub: null, spineIndex: idx, depth });
    }
    if (n.children?.length) {
      out.push(...flattenToc(n.children, hrefToSpine, depth + 1));
    }
  }
  return out;
}

export function TOCDrawer({
  open,
  onClose,
  book,
  currentIndex,
}: {
  open: boolean;
  onClose: () => void;
  book: BookDetail;
  currentIndex: number;
}) {
  // Build href -> spine index once.
  const hrefToSpine = new Map<string, number>();
  for (const s of book.spine) {
    hrefToSpine.set(s.href, s.index);
  }

  let entries = flattenToc(book.toc, hrefToSpine);

  // Fall back to spine if the TOC is empty or failed to map.
  if (entries.length === 0) {
    entries = book.spine.map((s) => ({
      title: s.title,
      spineIndex: s.index,
      depth: 0,
    }));
  }

  return (
    <Drawer open={open} onClose={onClose} title="Contents" width={440}>
      <div style={{ padding: "8px 10px 40px" }}>
        {entries.map((e, i) => {
          const active = e.spineIndex === currentIndex;
          const read = e.spineIndex < currentIndex;
          return (
            <Link
              key={`${e.spineIndex}-${i}`}
              href={`/read/${book.id}/${e.spineIndex}`}
              onClick={onClose}
              className="flex items-start gap-[14px] rounded-[10px] transition-colors"
              style={{
                width: "100%",
                padding: "12px 14px",
                paddingLeft: 14 + e.depth * 16,
                background: active ? "rgba(184,74,43,0.08)" : "transparent",
                color: "var(--ink)",
                textDecoration: "none",
              }}
              onMouseEnter={(ev) => {
                if (!active) ev.currentTarget.style.background = "rgba(42,36,28,0.04)";
              }}
              onMouseLeave={(ev) => {
                if (!active) ev.currentTarget.style.background = "transparent";
              }}
            >
              <div
                className="flex-shrink-0"
                style={{
                  width: 22,
                  paddingTop: 3,
                  color: read ? "var(--ink-muted)" : "var(--ink-soft)",
                }}
              >
                {read ? <Icon.check size={12} /> : null}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="flex items-center gap-2"
                  style={{
                    fontFamily: "var(--serif-stack)",
                    fontSize: 16,
                    fontWeight: active ? 600 : 500,
                    color: "var(--ink)",
                    marginBottom: 3,
                  }}
                >
                  <span className="truncate">{e.title || `Section ${e.spineIndex + 1}`}</span>
                  {active && (
                    <span
                      className="uppercase rounded-[4px]"
                      style={{
                        fontFamily: "var(--inter-stack)",
                        fontSize: 9.5,
                        letterSpacing: 1.2,
                        color: "var(--accent)",
                        fontWeight: 600,
                        padding: "2px 6px",
                        background: "rgba(184,74,43,0.10)",
                      }}
                    >
                      Reading
                    </span>
                  )}
                </div>
                {e.sub && (
                  <div
                    className="italic"
                    style={{
                      fontFamily: "var(--serif-stack)",
                      fontSize: 13.5,
                      color: read ? "var(--ink-muted)" : "var(--ink-soft)",
                      lineHeight: 1.35,
                    }}
                  >
                    {e.sub}
                  </div>
                )}
              </div>
              <div
                className="flex-shrink-0"
                style={{
                  fontFamily: "var(--mono-stack)",
                  fontSize: 11,
                  color: "var(--ink-muted)",
                  paddingTop: 4,
                }}
              >
                ch. {e.spineIndex + 1}
              </div>
            </Link>
          );
        })}
      </div>
    </Drawer>
  );
}
