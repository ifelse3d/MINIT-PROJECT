"use client";

import { createContext, useContext, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// LANGUAGE PREFERENCE — the user chooses which of BM / 中文 / EN they want to
// SEE in the interface (any combination; at least one). Saved on the device.
// Generated OFFICIAL documents remain BM regardless (CLAUDE.md rule 9).
// Adopt via the <Tri> helper; screens not yet converted simply keep showing
// all three languages.
// ---------------------------------------------------------------------------

export type LangKey = "bm" | "zh" | "en";
export type LangPrefs = Record<LangKey, boolean>;

const DEFAULT_PREFS: LangPrefs = { bm: true, zh: true, en: true };
const STORAGE_KEY = "minit.langs";

const LangContext = createContext<{
  prefs: LangPrefs;
  toggle: (k: LangKey) => void;
}>({ prefs: DEFAULT_PREFS, toggle: () => {} });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<LangPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LangPrefs>;
        const next: LangPrefs = {
          bm: parsed.bm !== false,
          zh: parsed.zh !== false,
          en: parsed.en !== false,
        };
        if (next.bm || next.zh || next.en) setPrefs(next);
      }
    } catch {
      // corrupted storage — keep defaults
    }
  }, []);

  function toggle(k: LangKey) {
    setPrefs((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      if (!next.bm && !next.zh && !next.en) return prev; // at least one stays on
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable — preference just won't persist
      }
      return next;
    });
  }

  return <LangContext.Provider value={{ prefs, toggle }}>{children}</LangContext.Provider>;
}

export function useLangs() {
  return useContext(LangContext);
}

/**
 * Renders the enabled language versions of one label, joined by a separator.
 * <Tri bm="Wang" zh="财务" en="Money" /> → "Wang · 财务 · Money" (or fewer).
 */
export function Tri({
  bm,
  zh,
  en,
  sep = " · ",
}: {
  bm: string;
  zh: string;
  en: string;
  sep?: string;
}) {
  const { prefs } = useLangs();
  const parts = [prefs.bm && bm, prefs.zh && zh, prefs.en && en].filter(
    (x): x is string => Boolean(x)
  );
  return <>{parts.join(sep)}</>;
}

/** Same as <Tri> but returns a plain string (for placeholders, titles). */
export function useTriText() {
  const { prefs } = useLangs();
  return (bm: string, zh: string, en: string, sep = " · ") =>
    [prefs.bm && bm, prefs.zh && zh, prefs.en && en]
      .filter((x): x is string => Boolean(x))
      .join(sep);
}

/**
 * The three toggle chips for the header.
 * `tone="dark"` is for surfaces that are dark regardless of theme — the sign-in
 * screen sits on a dark scrim over a photo, where the light-glass styling below
 * would be invisible.
 */
export function LanguageSwitcher({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { prefs, toggle } = useLangs();
  const items: { key: LangKey; label: string }[] = [
    { key: "bm", label: "BM" },
    { key: "zh", label: "中" },
    { key: "en", label: "EN" },
  ];
  const dark = tone === "dark";
  return (
    <div className="flex items-center gap-1" title="Bahasa · 语言 · Language">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => toggle(it.key)}
          aria-pressed={prefs[it.key]}
          className={
            dark
              ? `rounded-full border px-5 py-2 text-sm font-semibold tracking-[0.02em] transition-colors ${
                  prefs[it.key]
                    ? "border-white/30 bg-white/[0.16] text-white"
                    : "border-transparent text-white/85 hover:bg-white/[0.12] hover:text-white"
                }`
              : `rounded-full border px-2.5 py-1 text-sm font-semibold transition-colors ${
                  prefs[it.key]
                    ? "border-transparent bg-gradient-to-r from-[#5b4bd6] to-[#6f5ef2] text-white"
                    : "border-muted-foreground/30 bg-muted/40 text-muted-foreground hover:border-muted-foreground/60"
                }`
          }
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
