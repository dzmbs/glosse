/**
 * ChapterHead — three variants matching glosse-design/src/reader.jsx.
 *
 *   roman   (novel/focus) — centered "CHAPTER" kicker over giant Roman numeral
 *   number  (study)       — §N monotype kicker + serif title, thin rule below
 *   banner  (article)     — small-caps kicker + huge title + italic sub + accent bar
 *
 * The variant is chosen by the surface mode. Title and subtitle come from the
 * book's TOC — we display them when available and fall back to just the number.
 */

export type ChapterHeadVariant = "roman" | "number" | "banner";

type Props = {
  variant: ChapterHeadVariant;
  index: number;                    // 0-based spine index
  kicker?: string | null;           // e.g. "CHAPTER I — THE DEEPENING PAGE"
  title?: string | null;            // the chapter title
  sub?: string | null;              // italic subtitle (banner variant)
};

function toRoman(n: number): string {
  if (n <= 0) return String(n);
  const map: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [v, s] of map) {
    while (n >= v) { out += s; n -= v; }
  }
  return out;
}

export function ChapterHead({ variant, index, kicker, title, sub }: Props) {
  const n = index + 1;

  if (variant === "banner") {
    return (
      <div className="mb-9" style={{ textAlign: "left" }}>
        <div
          className="mb-[14px] font-bold uppercase"
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 10.5,
            letterSpacing: 2,
            color: "var(--accent)",
          }}
        >
          {kicker ?? `Chapter ${n}`}
        </div>
        <div
          className="mb-[10px]"
          style={{
            fontFamily: "var(--heading-stack)",
            fontSize: 42,
            fontWeight: 600,
            color: "var(--ink)",
            lineHeight: 1.05,
            letterSpacing: -0.5,
          }}
        >
          {title ?? `Chapter ${n}`}
        </div>
        {sub && (
          <div
            className="italic mb-[14px]"
            style={{
              fontFamily: "var(--heading-stack)",
              fontSize: 19,
              lineHeight: 1.4,
              color: "var(--ink-soft)",
            }}
          >
            {sub}
          </div>
        )}
        <div style={{ width: 40, height: 2, background: "var(--accent)" }} />
      </div>
    );
  }

  if (variant === "number") {
    return (
      <div className="mb-7">
        <div
          className="mb-2 font-semibold"
          style={{
            fontFamily: "var(--mono-stack)",
            fontSize: 11,
            letterSpacing: 1.5,
            color: "var(--accent)",
          }}
        >
          §{n}
        </div>
        <div
          style={{
            fontFamily: "var(--heading-stack)",
            fontSize: 28,
            fontWeight: 600,
            color: "var(--ink)",
            lineHeight: 1.2,
            letterSpacing: -0.3,
          }}
        >
          {title ?? `Chapter ${n}`}
        </div>
        <div className="mt-[14px]" style={{ borderTop: "1px solid var(--rule)" }} />
      </div>
    );
  }

  // roman (default)
  return (
    <div className="text-center" style={{ margin: "6px 0 40px" }}>
      <div
        className="italic uppercase mb-[14px]"
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 12,
          letterSpacing: 4,
          color: "var(--ink-muted)",
        }}
      >
        Chapter
      </div>
      <div
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 52,
          fontWeight: 400,
          color: "var(--ink)",
          lineHeight: 1,
        }}
      >
        {toRoman(n)}
      </div>
      <div
        className="mx-auto mt-[22px]"
        style={{
          width: 24,
          height: 1,
          background: "var(--ink-muted)",
          opacity: 0.5,
        }}
      />
      {title && !/^(Section \d+|Cover|Title|Copyright|Preface)$/i.test(title) && (
        <div
          className="mt-5 italic"
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: 15,
            color: "var(--ink-soft)",
          }}
        >
          {title}
        </div>
      )}
    </div>
  );
}
