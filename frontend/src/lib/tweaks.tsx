"use client";

/**
 * Tweaks — user-level reading preferences.
 *
 * Persisted in localStorage, applied via CSS custom properties on <html>.
 * Because this is client-only state we hydrate on mount; the initial SSR
 * render uses the `novel` defaults baked into globals.css.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ACCENT_OPTIONS,
  AI_STYLE_OPTIONS,
  MARGIN_OPTIONS,
  MODES,
  SERIF_OPTIONS,
  type AIStyleId,
  type AccentId,
  type MarginId,
  type ModeSpec,
  type SerifId,
  type SurfaceId,
  lightenHex,
} from "@/lib/modes";

export type Tweaks = {
  surface: SurfaceId;
  accent: AccentId;
  serif: SerifId;
  fontSize: number | null; // null = use mode default
  margin: MarginId;
  aiStyle: AIStyleId;
  showMarginNotes: boolean;
};

const DEFAULTS: Tweaks = {
  surface: "novel",
  accent: "terracotta",
  serif: "newsreader",
  fontSize: null,
  margin: "normal",
  aiStyle: "panel",
  showMarginNotes: true,
};

const STORAGE_KEY = "glosse.tweaks.v1";

type TweaksContextValue = {
  tweaks: Tweaks;
  mode: ModeSpec;
  setTweaks: (next: Partial<Tweaks>) => void;
  reset: () => void;
};

const TweaksContext = createContext<TweaksContextValue | null>(null);

export function TweaksProvider({ children }: { children: React.ReactNode }) {
  const [tweaks, setTweaksState] = useState<Tweaks>(DEFAULTS);
  const hydrated = useRef(false);

  // Hydrate from localStorage once.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Tweaks>;
        setTweaksState({ ...DEFAULTS, ...parsed });
      }
    } catch {
      // Invalid JSON — fall back to defaults.
    }
  }, []);

  // Persist + apply every change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tweaks));
    } catch {
      // Private-mode / quota exceeded — non-fatal.
    }
    applyTweaksToDOM(tweaks);
  }, [tweaks]);

  const setTweaks = useCallback((next: Partial<Tweaks>) => {
    setTweaksState((prev) => ({ ...prev, ...next }));
  }, []);

  const reset = useCallback(() => setTweaksState(DEFAULTS), []);

  const value = useMemo<TweaksContextValue>(
    () => ({
      tweaks,
      mode: MODES[tweaks.surface],
      setTweaks,
      reset,
    }),
    [tweaks, setTweaks, reset],
  );

  return <TweaksContext.Provider value={value}>{children}</TweaksContext.Provider>;
}

export function useTweaks(): TweaksContextValue {
  const ctx = useContext(TweaksContext);
  if (!ctx) {
    throw new Error("useTweaks must be used inside <TweaksProvider>");
  }
  return ctx;
}

// -- DOM application ------------------------------------------------------

function applyTweaksToDOM(t: Tweaks): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const body = document.body;

  // Surface mode drives the :root[data-surface] block in globals.css.
  if (body) body.dataset.surface = t.surface;

  // Accent / serif / size / margin are overlaid on top of whatever the
  // surface mode set.
  const accent = ACCENT_OPTIONS.find((a) => a.id === t.accent) ?? ACCENT_OPTIONS[0];
  root.style.setProperty("--accent", accent.hex);
  root.style.setProperty("--accent-soft", lightenHex(accent.hex));

  const serif = SERIF_OPTIONS.find((s) => s.id === t.serif) ?? SERIF_OPTIONS[0];
  root.style.setProperty("--serif-stack", serif.stack);

  const mode = MODES[t.surface];
  const size = t.fontSize ?? mode.bodySize;
  root.style.setProperty("--body-size", `${size}px`);

  const margin = MARGIN_OPTIONS.find((m) => m.id === t.margin) ?? MARGIN_OPTIONS[1];
  root.style.setProperty("--page-pad", `${margin.pad}px`);
}

// Expose the storage key so debug tools / tests can nuke it.
export const TWEAKS_STORAGE_KEY = STORAGE_KEY;

// Expose the option lists for the TweaksPanel UI (avoids two imports).
export { ACCENT_OPTIONS, AI_STYLE_OPTIONS, MARGIN_OPTIONS, SERIF_OPTIONS, MODES };
