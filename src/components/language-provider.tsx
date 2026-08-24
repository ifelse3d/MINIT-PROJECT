"use client";

import { createContext, useContext, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// LANGUAGE — ONE language at a time (Stage R, 2026-08-25).
//
// J's brief: the three-languages-at-once wall was a big part of the "template"
// feel — every label read "Wang · 财务 · Money". The interface now shows ONE
// chosen language. First visit: a picker (default 中文). The old side-by-side
// tri view survives as an ADVANCED option in Settings ("all"), because it is
// genuinely useful for a mixed committee reading one screen together.
//
// The choice is a DEVICE preference (dot-prefix key, survives sign-out) and is
// mirrored into a cookie so the server can stamp <html lang> before first
// paint. Generated OFFICIAL documents remain BM regardless (CLAUDE.md rule 9).
//
// <Tri> keeps its API — every call site in the app keeps working — it simply
// renders the selected language only (or all three in "all" mode).
// ---------------------------------------------------------------------------

import {
  DEFAULT_LANG_MODE,
  LANG_COOKIE,
  htmlLangFor,
  isLangMode,
  type LangKey,
  type LangMode,
} from "@/lib/lang";

export type { LangKey, LangMode };
export { LANG_COOKIE, htmlLangFor, isLangMode };
export type LangPrefs = Record<LangKey, boolean>;

const STORAGE_KEY = "minit.lang.v2";
/** Pre-redesign key: three independent toggles. Read once for migration. */
const LEGACY_KEY = "minit.langs";

const DEFAULT_MODE: LangMode = DEFAULT_LANG_MODE;

function prefsFor(mode: LangMode): LangPrefs {
  if (mode === "all") return { bm: true, zh: true, en: true };
  return { bm: mode === "bm", zh: mode === "zh", en: mode === "en" };
}

const LangContext = createContext<{
  mode: LangMode;
  prefs: LangPrefs;
  /** True until this device has ever chosen — the shell shows the picker. */
  needsChoice: boolean;
  setMode: (m: LangMode) => void;
}>({
  mode: DEFAULT_MODE,
  prefs: prefsFor(DEFAULT_MODE),
  needsChoice: false,
  setMode: () => {},
});

function persistMode(m: LangMode) {
  try {
    localStorage.setItem(STORAGE_KEY, m);
  } catch {
    // storage unavailable — preference just won't persist
  }
  try {
    // Mirror for the server: <html lang> is stamped from this cookie.
    document.cookie = `${LANG_COOKIE}=${m};path=/;max-age=31536000;samesite=lax`;
  } catch {
    // no document (tests) — nothing to mirror
  }
  try {
    document.documentElement.lang = htmlLangFor(m);
  } catch {
    // no document — fine
  }
}

export function LanguageProvider({
  children,
  initialMode,
}: {
  children: React.ReactNode;
  /** From the cookie, resolved on the server, so SSR and client agree. */
  initialMode?: string;
}) {
  const fromServer = isLangMode(initialMode) ? initialMode : null;
  const [mode, setModeState] = useState<LangMode>(fromServer ?? DEFAULT_MODE);
  const [needsChoice, setNeedsChoice] = useState(false);

  useEffect(() => {
    if (fromServer) return; // the cookie answered it — nothing to migrate
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isLangMode(stored)) {
        setModeState(stored);
        persistMode(stored); // refresh the cookie for the next server render
        return;
      }
      // Migrate the old three-toggle preference IF it names exactly one
      // language; "all three on" was the old default, indistinguishable from
      // never having chosen, so it asks fresh.
      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as Partial<LangPrefs>;
        const on = (["bm", "zh", "en"] as const).filter((k) => legacy[k] === true);
        if (on.length === 1) {
          setModeState(on[0]);
          persistMode(on[0]);
          return;
        }
      }
      setNeedsChoice(true);
    } catch {
      setNeedsChoice(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setMode(m: LangMode) {
    setModeState(m);
    setNeedsChoice(false);
    persistMode(m);
  }

  return (
    <LangContext.Provider
      value={{ mode, prefs: prefsFor(mode), needsChoice, setMode }}
    >
      {children}
    </LangContext.Provider>
  );
}

export function useLangs() {
  return useContext(LangContext);
}

/**
 * Renders the enabled language version(s) of one label.
 * <Tri bm="Wang" zh="钱" en="Money" /> → "钱" (single mode) or all three
 * joined by the separator (advanced "all" mode).
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
 * Server errors travel as the three-line joinUserError() format (bm\nzh\nen).
 * This hook picks the reader's line; anything that is not exactly that shape
 * (extra detail lines, plain strings) is returned untouched.
 */
export function useLocalizedError() {
  const { mode } = useLangs();
  return (raw: string | null | undefined): string | null => {
    if (raw == null || raw === "") return null;
    if (mode === "all") return raw;
    const lines = raw.split("\n");
    if (lines.length !== 3) return raw;
    const idx = mode === "bm" ? 0 : mode === "zh" ? 1 : 2;
    return lines[idx] || raw;
  };
}

/**
 * The single-select language chips (top bar, /login, first-run picker).
 * In the advanced "all" mode every chip shows lit — tapping one leaves it.
 */
export function LanguageSwitcher({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { mode, setMode } = useLangs();
  const items: { key: LangKey; label: string }[] = [
    { key: "bm", label: "BM" },
    { key: "zh", label: "中文" },
    { key: "en", label: "EN" },
  ];
  const dark = tone === "dark";
  return (
    <div className="flex items-center gap-1" title="Bahasa · 语言 · Language">
      {items.map((it) => {
        const active = mode === it.key || mode === "all";
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => setMode(it.key)}
            aria-pressed={active}
            className={
              dark
                ? `rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                    active
                      ? "border-white/40 bg-white/[0.18] text-white"
                      : "border-transparent text-white/80 hover:bg-white/[0.1] hover:text-white"
                  }`
                : `rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${
                    active
                      ? "border-transparent bg-[color:var(--v2-primary)] text-white"
                      : "border-[color:var(--v2-outline-border)] text-[color:var(--v2-text-soft)] hover:bg-[color:var(--v2-primary-soft)]"
                  }`
            }
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * First-visit language choice — a small centred card over a scrim. Three big
 * buttons, one per language, each labelled in ITS OWN language (the only
 * honest way to label a language chooser). Dismissing = keeping 中文.
 */
export function LanguageFirstRunPicker() {
  const { needsChoice, setMode } = useLangs();
  if (!needsChoice) return null;
  const options: { key: LangKey; label: string; sub: string }[] = [
    { key: "zh", label: "中文", sub: "以中文使用 Minit" },
    { key: "bm", label: "Bahasa Malaysia", sub: "Guna Minit dalam BM" },
    { key: "en", label: "English", sub: "Use Minit in English" },
  ];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="v2-glass w-full max-w-sm p-6">
        <h2 className="text-xl font-semibold">
          选择语言 · Pilih bahasa · Choose language
        </h2>
        <p className="mt-1 text-sm text-[color:var(--v2-text-soft)]">
          随时可以在设置里更改 · Boleh ditukar di Tetapan · Change any time in
          Settings
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setMode(o.key)}
              className="flex flex-col items-start rounded-xl border border-[color:var(--v2-outline-border)] px-4 py-3 text-left transition-colors hover:border-[color:var(--v2-primary)] hover:bg-[color:var(--v2-primary-soft)]"
            >
              <span className="text-lg font-semibold">{o.label}</span>
              <span className="text-sm text-[color:var(--v2-text-soft)]">{o.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
