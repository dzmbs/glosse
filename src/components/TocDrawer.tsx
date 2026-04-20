import { useEffect, useState } from "react";

import { Icon } from "@/components/Icons";
import type { TocItem } from "@/components/BookViewport";

type Props = {
  open: boolean;
  onClose: () => void;
  toc: TocItem[];
  activeId: string | null;
  ancestorIds: string[];
  bookTitle: string;
  bookAuthor: string;
  onJump: (href: string) => void;
};

export function TocDrawer({
  open,
  onClose,
  toc,
  activeId,
  ancestorIds,
  bookTitle,
  bookAuthor,
  onJump,
}: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (ancestorIds.length === 0) return;
    setExpanded((prev) => {
      const next = { ...prev };
      for (const id of ancestorIds) next[id] = true;
      return next;
    });
  }, [ancestorIds]);

  // Caller passes the resolved current state so the first click doesn't
  // waste itself setting `undefined` → `true` (the rendered-as-expanded
  // fallback for depth-0 items).
  const toggle = (id: string, currentlyExpanded: boolean) =>
    setExpanded((prev) => ({ ...prev, [id]: !currentlyExpanded }));

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.25)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s ease",
          zIndex: 20,
        }}
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          bottom: 0,
          left: 0,
          width: 340,
          background: "var(--panel-bg)",
          borderRight: "1px solid var(--rule-soft)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.3s cubic-bezier(0.32,0.72,0.24,1)",
          zIndex: 21,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid var(--rule-soft)",
          }}
        >
          <div
            className="uppercase"
            style={{
              fontFamily: "var(--inter-stack)",
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 1.6,
              color: "var(--ink-muted)",
            }}
          >
            Contents
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Close">
            <Icon.close size={16} />
          </button>
        </div>

        {(bookTitle || bookAuthor) && (
          <div
            style={{
              padding: "14px 18px 12px",
              borderBottom: "1px solid var(--rule-soft)",
            }}
          >
            {bookTitle && (
              <div
                className="line-clamp-2"
                style={{
                  fontFamily: "var(--heading-stack)",
                  fontSize: 15,
                  fontWeight: 500,
                  color: "var(--ink)",
                  lineHeight: 1.3,
                }}
              >
                {bookTitle}
              </div>
            )}
            {bookAuthor && (
              <div
                className="mt-0.5 italic"
                style={{
                  fontFamily: "var(--serif-stack)",
                  fontSize: 12.5,
                  color: "var(--ink-muted)",
                }}
              >
                {bookAuthor}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto" style={{ padding: "8px 4px" }}>
          {toc.length === 0 ? (
            <div
              className="italic"
              style={{
                padding: "24px 14px",
                fontFamily: "var(--serif-stack)",
                color: "var(--ink-muted)",
                fontSize: 14,
              }}
            >
              This book doesn&apos;t declare a table of contents.
            </div>
          ) : (
            toc.map((item) => (
              <TocNode
                key={item.id}
                item={item}
                depth={0}
                activeId={activeId}
                ancestorIds={ancestorIds}
                expanded={expanded}
                onToggle={toggle}
                onJump={(href) => {
                  onJump(href);
                  onClose();
                }}
              />
            ))
          )}
        </div>
      </aside>
    </>
  );
}

function TocNode({
  item,
  depth,
  activeId,
  ancestorIds,
  expanded,
  onToggle,
  onJump,
}: {
  item: TocItem;
  depth: number;
  activeId: string | null;
  ancestorIds: string[];
  expanded: Record<string, boolean>;
  onToggle: (id: string, currentlyExpanded: boolean) => void;
  onJump: (href: string) => void;
}) {
  const hasChildren = !!item.subitems && item.subitems.length > 0;
  const isExpanded = expanded[item.id] ?? depth === 0;
  const isActive = activeId === item.id;
  const isOnActivePath = ancestorIds.includes(item.id);

  return (
    <div>
      <div
        className="group relative flex items-center"
        style={{
          paddingLeft: 12 + depth * 16,
          paddingRight: 10,
          borderRadius: 6,
          background: isActive ? "rgba(184,74,43,0.09)" : "transparent",
          margin: "1px 4px",
          transition: "background 0.15s ease",
        }}
      >
        {isActive && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 4,
              top: 6,
              bottom: 6,
              width: 3,
              borderRadius: 2,
              background: "var(--accent)",
            }}
          />
        )}
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(item.id, isExpanded)}
            aria-label={isExpanded ? "Collapse" : "Expand"}
            style={{
              width: 20,
              height: 28,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              color: "var(--ink-muted)",
              cursor: "pointer",
              flexShrink: 0,
              transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform 0.15s ease",
            }}
          >
            <Caret />
          </button>
        ) : (
          <span style={{ width: 20, flexShrink: 0 }} />
        )}

        <button
          type="button"
          onClick={() => onJump(item.href)}
          className="flex-1 text-left"
          style={{
            padding: "8px 0",
            background: "transparent",
            border: "none",
            fontFamily: "var(--serif-stack)",
            fontSize: depth === 0 ? 13.5 : 13,
            fontWeight: isActive
              ? 600
              : isOnActivePath
                ? 500
                : depth === 0
                  ? 500
                  : 400,
            color: isActive
              ? "var(--accent)"
              : isOnActivePath
                ? "var(--ink)"
                : "var(--ink-soft)",
            cursor: "pointer",
            lineHeight: 1.4,
          }}
          title={item.label}
        >
          {item.label}
        </button>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {item.subitems!.map((child) => (
            <TocNode
              key={child.id}
              item={child}
              depth={depth + 1}
              activeId={activeId}
              ancestorIds={ancestorIds}
              expanded={expanded}
              onToggle={onToggle}
              onJump={onJump}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Caret() {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

