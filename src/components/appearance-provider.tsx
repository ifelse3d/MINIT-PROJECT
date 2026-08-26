"use client";

// ---------------------------------------------------------------------------
// APPEARANCE — text size + light/dark, chosen by the person using the app.
//
// WHY (user request, 2026-07-28): the previous pass hardcoded a single root
// font-size for everyone. But Minit's users are not one group — the same
// organisation has a 72-year-old treasurer who needs large type and a 30-year-old
// secretary for whom the same setting wastes half the screen. "Too big" is an
// accessibility failure too: it forces scrolling, wraps every label onto three
// lines, and makes a page that fitted on one screen take four.
//
// So text size is a SETTING, four steps, remembered on this device.
//
// HOW IT WORKS
// Everything in the app is rem-based (Tailwind's text-*, and its whole spacing
// scale), so one root font-size scales type AND the gaps between things
// together — which is what keeps the layout looking deliberate at every step.
// We set it as a PERCENTAGE so it still multiplies whatever the person may have
// already set as their browser default; someone who has set their browser to
// 24px and picks "Besar" here gets 28.5px, not 19px.
//
// Stored per device (localStorage), not per account: the same person legitimately
// wants large type on their phone and normal type on the office laptop, and this
// needs no database change.
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const TEXT_SIZES = ["small", "medium", "large", "xlarge"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** Root font-size percentage per step. `medium` is the default.
 *
 * C-8 (work order 31, 客③): the whole ladder came DOWN half a step (6.25
 * percentage points) — "medium" at 18px read oversized on ordinary screens,
 * and "small" at 16px was not actually small. The rem system is untouched:
 * one root percentage still scales type and spacing together. */
export const TEXT_SIZE_PERCENT: Record<TextSize, number> = {
  small: 93.75, // 15px on a default browser — genuinely compact
  medium: 106.25, // 17px — the default
  large: 118.75, // 19px
  xlarge: 133.75, // ~21.4px — for a reader who is really struggling
};

export const TEXT_SIZE_LABELS: Record<
  TextSize,
  { bm: string; zh: string; en: string; hint: { bm: string; zh: string; en: string } }
> = {
  small: {
    bm: "Kecil",
    zh: "小",
    en: "Small",
    hint: {
      bm: "Lebih banyak muat dalam satu skrin",
      zh: "一个屏幕能看到更多内容",
      en: "Fits more on one screen",
    },
  },
  medium: {
    bm: "Sedang",
    zh: "中",
    en: "Medium",
    hint: { bm: "Biasa", zh: "一般", en: "The usual" },
  },
  large: {
    bm: "Besar",
    zh: "大",
    en: "Large",
    hint: {
      bm: "Lebih senang dibaca",
      zh: "看起来轻松一些",
      en: "Easier to read",
    },
  },
  xlarge: {
    bm: "Sangat besar",
    zh: "特大",
    en: "Extra large",
    hint: {
      bm: "Untuk mata yang sukar membaca skrin",
      zh: "给看屏幕比较吃力的眼睛",
      en: "For eyes that struggle with screens",
    },
  },
};

const SIZE_KEY = "minit.textSize.v1";
const THEME_KEY = "minit.theme.v1";

function isTextSize(v: unknown): v is TextSize {
  return typeof v === "string" && (TEXT_SIZES as readonly string[]).includes(v);
}

/** Applied to <html> so every rem in the app follows it. */
function applyTextSize(size: TextSize): void {
  document.documentElement.style.fontSize = `${TEXT_SIZE_PERCENT[size]}%`;
  // Exposed for the rare place that needs to know (e.g. a canvas render).
  document.documentElement.dataset.textSize = size;
}

type AppearanceValue = {
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
  dark: boolean;
  setDark: (dark: boolean) => void;
  /** False until we have read this device's saved choices (avoids a flash). */
  ready: boolean;
};

const AppearanceContext = createContext<AppearanceValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [textSize, setSize] = useState<TextSize>("medium");
  const [dark, setDarkState] = useState(false);
  const [ready, setReady] = useState(false);

  // Read this device's choices once, after mount (SSR-safe).
  useEffect(() => {
    let storedSize: string | null = null;
    let storedTheme: string | null = null;
    try {
      storedSize = window.localStorage.getItem(SIZE_KEY);
      storedTheme = window.localStorage.getItem(THEME_KEY);
    } catch {
      // Private window with storage disabled: defaults apply for this visit.
    }
    const size = isTextSize(storedSize) ? storedSize : "medium";
    setSize(size);
    applyTextSize(size);

    const isDark = storedTheme === "dark";
    setDarkState(isDark);
    document.documentElement.classList.toggle("dark", isDark);

    setReady(true);
  }, []);

  const setTextSize = useCallback((next: TextSize) => {
    setSize(next);
    applyTextSize(next);
    try {
      window.localStorage.setItem(SIZE_KEY, next);
    } catch {
      // Not remembered, but it works for this visit. Nothing useful to say.
    }
  }, []);

  const setDark = useCallback((next: boolean) => {
    setDarkState(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // As above.
    }
  }, []);

  const value = useMemo(
    () => ({ textSize, setTextSize, dark, setDark, ready }),
    [textSize, setTextSize, dark, setDark, ready],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error("useAppearance must be used inside <AppearanceProvider>");
  }
  return ctx;
}

/**
 * Inline script for <head>: applies the saved text size and theme BEFORE the
 * first paint, so a person who chose "Extra large" never sees the page render
 * small and then jump. Kept tiny and dependency-free on purpose.
 */
export const APPEARANCE_BOOT_SCRIPT = `
(function () {
  try {
    var p = { small: 93.75, medium: 106.25, large: 118.75, xlarge: 133.75 };
    var s = localStorage.getItem(${JSON.stringify(SIZE_KEY)});
    if (!p[s]) s = "medium";
    document.documentElement.style.fontSize = p[s] + "%";
    document.documentElement.dataset.textSize = s;
    if (localStorage.getItem(${JSON.stringify(THEME_KEY)}) === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {
    document.documentElement.style.fontSize = "106.25%";
  }
})();
`;
