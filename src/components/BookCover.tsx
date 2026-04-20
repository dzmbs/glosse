import { useEffect, useState } from "react";

import { coverForBook } from "@/lib/covers";

type Props = {
  bookId: string;
  title: string;
  author: string;
  coverBlob?: Blob | null;
  progress?: number | null;
};

export function BookCover({ bookId, title, author, coverBlob, progress }: Props) {
  const { cover, accent } = coverForBook(bookId);
  const imageUrl = useBlobUrl(coverBlob);

  if (imageUrl) {
    return (
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: "3 / 4",
          borderRadius: 4,
          boxShadow:
            "0 10px 30px rgba(26,22,18,0.25), inset 0 0 0 1px rgba(255,255,255,0.06)",
          background: "#fff",
        }}
      >
        <img
          src={imageUrl}
          alt={title}
          className="h-full w-full object-cover"
          draggable={false}
        />
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

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        aspectRatio: "3 / 4",
        background: cover,
        borderRadius: 4,
        boxShadow:
          "0 10px 30px rgba(26,22,18,0.25), inset 0 0 0 1px rgba(255,255,255,0.06)",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(115deg, ${accent}22 0%, transparent 45%)`,
        }}
      />
      <div
        className="absolute left-[6px] top-0 bottom-0"
        style={{ width: 3, background: "rgba(0,0,0,0.25)" }}
      />
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
      <div
        className="absolute text-center"
        style={{
          fontFamily: "var(--serif-stack)",
          color: "#f5eddc",
          fontSize: 24,
          fontWeight: 500,
          lineHeight: 1.15,
          left: 22,
          right: 22,
          top: "36%",
        }}
      >
        {title}
      </div>
      <div
        className="absolute left-[22px] right-[22px] bottom-[30px]"
        style={{ height: 1, background: accent, opacity: 0.4 }}
      />
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

// Blob → object URL, auto-revoked on blob change / unmount.
function useBlobUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
