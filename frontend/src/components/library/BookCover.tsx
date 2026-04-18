/**
 * BookCover — color-blocked cover in the style of the design.
 *
 * Renders a 3:4 rectangle with the book's accent color, the author set in
 * small caps at the top, and the title in large serif at the middle. The
 * colors come from lib/covers.ts which hashes the book id.
 *
 * LATER: use real cover images pulled from the EPUB package once ingest
 * extracts them.
 */

import { coverForBook } from "@/lib/covers";

type Props = {
  bookId: string;
  title: string;
  author: string;
  progress?: number | null;   // 0..1; renders a progress bar at the bottom
  size?: "large" | "small";
  markRead?: boolean;
};

export function BookCover({
  bookId,
  title,
  author,
  progress,
  size = "large",
  markRead = false,
}: Props) {
  const { cover, accent } = coverForBook(bookId);
  const large = size === "large";

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        aspectRatio: "3 / 4",
        background: cover,
        borderRadius: large ? 4 : 3,
        boxShadow: large
          ? "0 10px 30px rgba(26,22,18,0.25), inset 0 0 0 1px rgba(255,255,255,0.06)"
          : "0 6px 16px rgba(26,22,18,0.2)",
        opacity: markRead ? 0.7 : 1,
      }}
    >
      {/* Subtle sheen */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(115deg, ${accent}22 0%, transparent 45%)`,
        }}
      />
      {/* Spine shadow */}
      <div
        className="absolute left-[6px] top-0 bottom-0"
        style={{ width: large ? 3 : 2, background: "rgba(0,0,0,0.25)" }}
      />

      {large && (
        <div
          className="absolute left-[22px] right-[22px] top-[30px] text-center"
          style={{
            fontFamily: "var(--serif-stack)",
            color: accent,
            fontSize: 11,
            letterSpacing: 3,
            textTransform: "uppercase",
            opacity: 0.75,
          }}
        >
          {author}
        </div>
      )}

      <div
        className={large ? "absolute text-center" : "absolute text-center"}
        style={{
          fontFamily: "var(--serif-stack)",
          color: "#f5eddc",
          fontSize: large ? 28 : 17,
          fontWeight: 500,
          lineHeight: 1.1,
          left: large ? 22 : 14,
          right: large ? 22 : 14,
          top: large ? "36%" : "40%",
        }}
      >
        {title}
      </div>

      {large && (
        <div
          className="absolute left-[22px] right-[22px] bottom-[30px]"
          style={{ height: 1, background: accent, opacity: 0.4 }}
        />
      )}

      {markRead && (
        <div
          className="absolute top-2 right-2"
          style={{
            fontFamily: "var(--mono-stack)",
            fontSize: 9,
            color: "#f5eddc",
            opacity: 0.7,
            letterSpacing: 0.8,
          }}
        >
          READ
        </div>
      )}

      {/* Progress strip */}
      {typeof progress === "number" && progress > 0 && (
        <div
          className="absolute left-0 right-0 bottom-0"
          style={{ height: 3, background: "rgba(0,0,0,0.35)" }}
        >
          <div
            className="h-full"
            style={{
              width: `${Math.min(100, progress * 100)}%`,
              background: accent,
            }}
          />
        </div>
      )}
    </div>
  );
}
