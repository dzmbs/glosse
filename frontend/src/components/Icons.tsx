/**
 * Icon set — ported verbatim from glosse-design/src/icons.jsx.
 *
 * Stroke-based, follow currentColor. Props:
 *   <Icon.sparkle size={14} />
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
  bookmark: ({ size = 18, className, fill }: IconProps) => (
    <svg {...base(size, className)} fill={fill ? "currentColor" : "none"}>
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  ),
  highlight: ({ size = 18, className }: IconProps) => (
    <svg {...base(size, className)}>
      <path d="M15 3l6 6-10 10H5v-6z" />
      <path d="M13 5l6 6" />
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
  send: ({ size = 18, className }: IconProps) => (
    <svg {...base(size, className)} strokeWidth={1.8}>
      <path d="M5 12h14M13 6l6 6-6 6" />
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
  chevDown: ({ size = 14, className }: IconProps) => (
    <svg {...base(size, className)} strokeWidth={1.8}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  quiz: ({ size = 18, className }: IconProps) => (
    <svg {...base(size, className)}>
      <path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5" />
      <circle cx="12" cy="16" r="0.6" fill="currentColor" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  summary: ({ size = 18, className }: IconProps) => (
    <svg {...base(size, className)}>
      <path d="M6 4h12v16H6z" />
      <path d="M9 9h6M9 12h6M9 15h4" />
    </svg>
  ),
  explain: ({ size = 18, className }: IconProps) => (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16v0.5" />
    </svg>
  ),
  define: ({ size = 18, className }: IconProps) => (
    <svg {...base(size, className)}>
      <path d="M4 5h11a3 3 0 013 3v12M4 5v14a2 2 0 002 2h12" />
    </svg>
  ),
  notes: ({ size = 18, className }: IconProps) => (
    <svg {...base(size, className)}>
      <path d="M5 4h10l4 4v12H5z" />
      <path d="M15 4v4h4" />
    </svg>
  ),
  check: ({ size = 16, className }: IconProps) => (
    <svg {...base(size, className)} strokeWidth={2}>
      <path d="M5 12l5 5 9-11" />
    </svg>
  ),
  plus: ({ size = 16, className }: IconProps) => (
    <svg {...base(size, className)} strokeWidth={1.8} strokeLinejoin={undefined}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  refresh: ({ size = 16, className }: IconProps) => (
    <svg {...base(size, className)}>
      <path d="M4 12a8 8 0 0113.5-5.5L20 9M20 4v5h-5" />
      <path d="M20 12a8 8 0 01-13.5 5.5L4 15M4 20v-5h5" />
    </svg>
  ),
  pencil: ({ size = 16, className }: IconProps) => (
    <svg {...base(size, className)}>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M13 7l4 4" />
    </svg>
  ),
};

export type IconName = keyof typeof Icon;
