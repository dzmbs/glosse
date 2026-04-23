import { Icon } from "@/components/Icons";

type Props = {
  open: boolean;
  onClose: () => void;
  fontSize: number;
  onFontSize: (n: number) => void;
  spread: "auto" | "none";
  onSpread: (s: "auto" | "none") => void;
};

export function TweaksPanel({
  open,
  onClose,
  fontSize,
  onFontSize,
  spread,
  onSpread,
}: Props) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.2)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s ease",
          zIndex: 20,
        }}
      />
      <aside
        style={{
          position: "fixed",
          top: 60,
          right: 18,
          width: 280,
          background: "var(--panel-bg)",
          border: "1px solid var(--rule-soft)",
          borderRadius: 14,
          transform: open ? "translateY(0)" : "translateY(-8px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "transform 0.2s ease, opacity 0.2s ease",
          zIndex: 21,
          boxShadow: "0 20px 60px rgba(26,22,18,0.15)",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{
            padding: "13px 16px",
            borderBottom: "1px solid var(--rule-soft)",
          }}
        >
          <div
            className="uppercase"
            style={{
              fontFamily: "var(--inter-stack)",
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 1.5,
              color: "var(--ink-muted)",
            }}
          >
            Display
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Close">
            <Icon.close size={14} />
          </button>
        </div>

        <div style={{ padding: 14 }}>
          <SectionLabel>Font size</SectionLabel>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="icon-btn"
              style={{ width: 30, height: 30 }}
              onClick={() => onFontSize(Math.max(13, fontSize - 1))}
            >
              –
            </button>
            <div
              className="flex-1 text-center"
              style={{
                fontFamily: "var(--mono-stack)",
                fontSize: 12,
                color: "var(--ink)",
              }}
            >
              {fontSize}px
            </div>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 30, height: 30 }}
              onClick={() => onFontSize(Math.min(28, fontSize + 1))}
            >
              +
            </button>
          </div>

          <SectionLabel>Layout</SectionLabel>
          <div
            className="flex rounded-[10px] p-[3px]"
            style={{ border: "1px solid var(--rule-soft)" }}
          >
            <LayoutToggle
              active={spread === "auto"}
              onClick={() => onSpread("auto")}
              label="2-page"
            />
            <LayoutToggle
              active={spread === "none"}
              onClick={() => onSpread("none")}
              label="1-page"
            />
          </div>
        </div>
      </aside>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="uppercase"
      style={{
        fontFamily: "var(--inter-stack)",
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: 1.4,
        color: "var(--ink-muted)",
        margin: "0 2px 8px",
      }}
    >
      {children}
    </div>
  );
}

function LayoutToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "6px 8px",
        borderRadius: 7,
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--paper)" : "var(--ink-muted)",
        border: "none",
        fontFamily: "var(--inter-stack)",
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: 0.2,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
