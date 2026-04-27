import { Icon } from "@/components/Icons";

export type SelectionAction =
  | "highlight"
  | "ask"
  | "flashcard"
  | "quiz"
  | "copy";

type Props = {
  x: number;
  y: number;
  onAction: (action: SelectionAction) => void;
};

/** Floating dark pill that appears above a text selection. The parent owns
 *  position; we render fixed at (x, y) relative to viewport. */
export function SelectionMenu({ x, y, onAction }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        transform: "translate(-50%, calc(-100% - 10px))",
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        background: "var(--ink)",
        color: "var(--paper)",
        borderRadius: 12,
        padding: 4,
        boxShadow: "0 12px 30px rgba(0,0,0,0.3), 0 4px 10px rgba(0,0,0,0.2)",
      }}
    >
      <Button icon={<HighlightIcon />} label="Highlight" onClick={() => onAction("highlight")} />
      <Sep />
      <Button icon={<Icon.sparkle size={13} />} label="Ask" onClick={() => onAction("ask")} />
      <Sep />
      <Button
        icon={<FlashcardIcon />}
        label="Flashcard"
        onClick={() => onAction("flashcard")}
      />
      <Sep />
      <Button icon={<QuizIcon />} label="Quiz" onClick={() => onAction("quiz")} />
      <Sep />
      <Button icon={<CopyIcon />} label="Copy" onClick={() => onAction("copy")} />
    </div>
  );
}

function Button({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "6px 10px",
        background: "transparent",
        border: "none",
        color: "var(--paper)",
        fontFamily: "var(--inter-stack)",
        fontSize: 12,
        fontWeight: 500,
        borderRadius: 7,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Sep() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        height: 16,
        background: "rgba(255,255,255,0.12)",
        margin: "0 1px",
      }}
    />
  );
}

function HighlightIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3l6 6-10 10H5v-6z" />
      <path d="M13 5l6 6" />
    </svg>
  );
}

function QuizIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx={12} cy={12} r={9} />
      <path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5" />
      <circle cx={12} cy={16} r={0.6} fill="currentColor" />
    </svg>
  );
}

function FlashcardIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x={3} y={5} width={18} height={14} rx={2} />
      <path d="M7 10h10M7 14h6" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x={9} y={9} width={11} height={11} rx={2} />
      <path d="M5 15V5a2 2 0 012-2h10" />
    </svg>
  );
}
