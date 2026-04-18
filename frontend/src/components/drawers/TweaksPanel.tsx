"use client";

/**
 * TweaksPanel — floating panel in the top-right that drives every user-
 * adjustable knob: surface mode, accent, serif, font size, margins, AI
 * panel style, and margin-note visibility.
 *
 * Differs from glosse-design/src/tweaks.jsx in that it talks to our tweaks
 * context (lib/tweaks.tsx) instead of a local copy of the state.
 */

import { Icon } from "@/components/Icons";
import {
  ACCENT_OPTIONS,
  AI_STYLE_OPTIONS,
  MARGIN_OPTIONS,
  MODES,
  SERIF_OPTIONS,
  useTweaks,
} from "@/lib/tweaks";
import { SURFACE_IDS } from "@/lib/modes";

export function TweaksPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { tweaks, setTweaks } = useTweaks();
  if (!open) return null;

  const currentMode = MODES[tweaks.surface];

  return (
    <div
      className="absolute"
      style={{
        right: 20,
        top: 82,
        width: 320,
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        borderRadius: 18,
        boxShadow: "0 18px 50px rgba(26,22,18,0.18), 0 4px 14px rgba(26,22,18,0.08)",
        overflow: "hidden",
        fontFamily: "var(--inter-stack)",
        animation: "tweakIn 0.2s ease",
        zIndex: 60,
      }}
    >
      <div
        className="flex items-center gap-2"
        style={{
          padding: "16px 18px 12px",
          borderBottom: "1px solid var(--rule-soft)",
        }}
      >
        <div className="flex-1 flex flex-col">
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Tweaks</div>
          <div style={{ fontSize: 10.5, color: "var(--ink-muted)", letterSpacing: 0.3 }}>
            Try a variation
          </div>
        </div>
        <button className="icon-btn" type="button" onClick={onClose}>
          <Icon.close size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-4" style={{ padding: "14px 18px 18px" }}>
        <Section label="Mode">
          <div className="grid grid-cols-2 gap-[6px]">
            {SURFACE_IDS.map((m) => {
              const active = tweaks.surface === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTweaks({ surface: m })}
                  className="cursor-pointer"
                  style={{
                    padding: "8px 10px",
                    textAlign: "left",
                    background: active ? "var(--ink)" : "transparent",
                    color: active ? "var(--paper)" : "var(--ink)",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    fontFamily: "var(--inter-stack)",
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: "capitalize",
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </Section>

        <Section label="Accent">
          <div className="flex gap-2">
            {ACCENT_OPTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setTweaks({ accent: a.id })}
                title={a.name}
                className="cursor-pointer"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: a.hex,
                  border:
                    tweaks.accent === a.id
                      ? "2px solid var(--ink)"
                      : "2px solid transparent",
                  outline: "1px solid var(--rule)",
                  outlineOffset: -3,
                  padding: 0,
                }}
              />
            ))}
          </div>
        </Section>

        <Section label="Serif">
          <div className="flex flex-col gap-1">
            {SERIF_OPTIONS.map((s) => {
              const active = tweaks.serif === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setTweaks({ serif: s.id })}
                  className="cursor-pointer flex items-center justify-between"
                  style={{
                    padding: "8px 10px",
                    textAlign: "left",
                    background: active ? "rgba(42,36,28,0.06)" : "transparent",
                    border: "1px solid var(--rule-soft)",
                    borderRadius: 8,
                    color: "var(--ink)",
                  }}
                >
                  <span style={{ fontFamily: s.stack, fontSize: 15 }}>
                    {s.name}{" "}
                    <span className="italic" style={{ color: "var(--ink-muted)" }}>
                      — specimen
                    </span>
                  </span>
                  {active && <Icon.check size={13} />}
                </button>
              );
            })}
          </div>
        </Section>

        <Section
          label={`Font size · ${tweaks.fontSize ?? "auto"}${tweaks.fontSize ? "px" : ""}`}
        >
          <input
            type="range"
            min={16}
            max={26}
            step={1}
            value={tweaks.fontSize ?? currentMode.bodySize}
            onChange={(e) => setTweaks({ fontSize: Number(e.target.value) })}
            style={{ width: "100%", accentColor: "var(--accent)" }}
          />
        </Section>

        <Section label="Margins">
          <div className="flex gap-[6px]">
            {MARGIN_OPTIONS.map((m) => {
              const active = tweaks.margin === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setTweaks({ margin: m.id })}
                  className="cursor-pointer"
                  style={{
                    flex: 1,
                    padding: "8px 4px",
                    background: active ? "var(--ink)" : "transparent",
                    color: active ? "var(--paper)" : "var(--ink)",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </Section>

        <Section label="AI panel style">
          <div className="flex gap-[6px]">
            {AI_STYLE_OPTIONS.map((o) => {
              const active = tweaks.aiStyle === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setTweaks({ aiStyle: o.id })}
                  className="cursor-pointer"
                  style={{
                    flex: 1,
                    padding: "8px 4px",
                    background: active ? "var(--ink)" : "transparent",
                    color: active ? "var(--paper)" : "var(--ink)",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {o.name}
                </button>
              );
            })}
          </div>
        </Section>

        <Section label="Margin AI notes">
          <label className="flex items-center gap-[10px] cursor-pointer">
            <div
              onClick={() => setTweaks({ showMarginNotes: !tweaks.showMarginNotes })}
              className="relative"
              style={{
                width: 36,
                height: 20,
                borderRadius: 99,
                background: tweaks.showMarginNotes ? "var(--accent)" : "var(--rule)",
                transition: "background 0.2s",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  left: tweaks.showMarginNotes ? 18 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "white",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  transition: "left 0.2s",
                }}
              />
            </div>
            <span style={{ fontSize: 13, color: "var(--ink)" }}>
              {tweaks.showMarginNotes ? "Showing" : "Hidden"}{" "}
              <span style={{ color: "var(--ink-muted)", fontSize: 11, marginLeft: 6 }}>
                (LATER)
              </span>
            </span>
          </label>
        </Section>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="uppercase font-semibold"
        style={{
          fontSize: 10.5,
          letterSpacing: 1.2,
          color: "var(--ink-muted)",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
