"use client";

import { Icon } from "@/components/Icons";
import type { GuideResponse } from "@/lib/api";

export function WelcomeLine({ text }: { text: string }) {
  return (
    <div className="mb-[18px]">
      <div
        className="italic"
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 17,
          lineHeight: 1.45,
          color: "var(--ink)",
        }}
      >
        “{text}”
      </div>
    </div>
  );
}

export function AnswerCard({
  label,
  body,
  citations,
}: {
  label: string;
  body: string;
  citations: GuideResponse["citations"];
}) {
  return (
    <div className="mb-[18px]">
      <div
        className="uppercase font-semibold mb-2 flex items-center gap-[6px]"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 10.5,
          letterSpacing: 1.4,
          color: "var(--accent)",
        }}
      >
        <Icon.sparkle size={11} /> <span>{label}</span>
      </div>
      <div
        className="whitespace-pre-wrap"
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 15,
          lineHeight: 1.6,
          color: "var(--ink)",
          marginBottom: 10,
        }}
      >
        {body}
      </div>
      {citations.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {citations.map((c, i) => (
            <div
              key={c.chunk_id ?? i}
              className="italic"
              style={{
                fontFamily: "var(--serif-stack)",
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--ink-soft)",
                padding: "8px 12px",
                borderLeft: "2px solid var(--accent-soft)",
                background: "rgba(255,255,255,0.35)",
                borderRadius: "0 6px 6px 0",
              }}
            >
              {c.section_path && (
                <div
                  className="uppercase mb-1"
                  style={{
                    fontFamily: "var(--inter-stack)",
                    fontSize: 9.5,
                    letterSpacing: 1.1,
                    color: "var(--ink-muted)",
                    fontStyle: "normal",
                  }}
                >
                  {c.section_path}
                </div>
              )}
              {c.text?.slice(0, 220)}
              {c.text && c.text.length > 220 ? "…" : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SummaryCard({
  title,
  bullets,
}: {
  title: string;
  bullets: string[];
}) {
  return (
    <div className="mb-[18px]">
      <div
        className="uppercase font-semibold mb-2 flex items-center gap-[6px]"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 10.5,
          letterSpacing: 1.4,
          color: "var(--accent)",
        }}
      >
        <Icon.summary size={11} /> <span>Summary</span>
      </div>
      <div
        className="mb-[10px]"
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 18,
          fontWeight: 500,
          color: "var(--ink)",
        }}
      >
        {title}
      </div>
      <ul className="list-none p-0 m-0 flex flex-col gap-[10px]">
        {bullets.map((b, i) => (
          <li
            key={i}
            className="flex gap-[10px] items-start"
            style={{
              fontFamily: "var(--serif-stack)",
              fontSize: 14.5,
              lineHeight: 1.5,
              color: "var(--ink)",
            }}
          >
            <span
              className="flex-shrink-0"
              style={{
                width: 18,
                fontFamily: "var(--mono-stack)",
                fontSize: 11,
                color: "var(--accent)",
                marginTop: 3,
                fontWeight: 500,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DefineCard({
  word,
  pron,
  body,
}: {
  word: string;
  pron?: string;
  body: string;
}) {
  return (
    <div
      className="mb-[18px]"
      style={{
        background: "rgba(255,255,255,0.5)",
        border: "1px solid var(--rule-soft)",
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div className="flex items-baseline gap-[10px] mb-[6px]">
        <div
          className="italic"
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: 22,
            fontWeight: 500,
            color: "var(--ink)",
          }}
        >
          {word}
        </div>
        {pron && (
          <div
            style={{
              fontFamily: "var(--mono-stack)",
              fontSize: 12,
              color: "var(--ink-muted)",
            }}
          >
            /{pron}/
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--ink)",
        }}
      >
        {body}
      </div>
    </div>
  );
}
