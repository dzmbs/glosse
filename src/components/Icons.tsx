/**
 * Icon set — ported from the sibling glosse frontend.
 * Stroke-based, follow currentColor.
 */

type IconProps = { size?: number; className?: string; fill?: boolean };

const base = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
});

export const Icon = {
  library: ({ size = 18, className }: IconProps) => (
    <svg {...base(size, className)}>
      <path d="M4 4h3v16H4zM9 4h3v16H9zM15 5l3 1-4 14-3-1z" />
    </svg>
  ),
  toc: ({ size = 18, className }: IconProps) => (
    <svg {...base(size, className)} strokeLinejoin={undefined}>
      <path d="M4 6h13M4 12h13M4 18h9" />
      <circle cx="20" cy="6" r="1" fill="currentColor" />
      <circle cx="20" cy="12" r="1" fill="currentColor" />
      <circle cx="20" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  settings: ({ size = 18, className }: IconProps) => (
    <svg {...base(size, className)}>
      <path d="M4 7h8M16 7h4M4 17h4M12 17h8" />
      <circle cx="14" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  ),
  sparkle: ({ size = 18, className }: IconProps) => (
    <svg {...base(size, className)}>
      <path d="M12 3l1.8 4.8L18 9.5l-4.2 1.7L12 16l-1.8-4.8L6 9.5l4.2-1.7z" />
      <path d="M19 16l.6 1.6 1.6.6-1.6.6L19 20.4l-.6-1.6-1.6-.6 1.6-.6z" />
    </svg>
  ),
  close: ({ size = 18, className }: IconProps) => (
    <svg {...base(size, className)} strokeLinejoin={undefined}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  chevL: ({ size = 16, className }: IconProps) => (
    <svg {...base(size, className)} strokeWidth={1.8}>
      <path d="M14 6l-6 6 6 6" />
    </svg>
  ),
  chevR: ({ size = 16, className }: IconProps) => (
    <svg {...base(size, className)} strokeWidth={1.8}>
      <path d="M10 6l6 6-6 6" />
    </svg>
  ),
  plus: ({ size = 16, className }: IconProps) => (
    <svg {...base(size, className)} strokeWidth={1.8} strokeLinejoin={undefined}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  trash: ({ size = 16, className }: IconProps) => (
    <svg {...base(size, className)}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  ),
};
