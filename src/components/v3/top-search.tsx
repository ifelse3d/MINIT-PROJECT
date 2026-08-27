"use client";

// ---------------------------------------------------------------------------
// Top search bar for the v2 shell. Frosted pill with a leading Lucide search
// icon, a language switcher, and a theme toggle. Search here is intent-led,
// not an open chatbot (CLAUDE.md rule 10) — placeholder hints at scope.
//
// 2026-07-28 audit fixes:
//  * SearchForm and ThemeToggle are now exported so the PHONE top bar can use
//    them too. Previously this whole component sat inside `hidden md:block`,
//    which meant a phone user — i.e. our actual user — had no way to search
//    their own records and no way to reach the theme toggle at all.
//  * The theme choice is persisted (it used to reset to light on every reload).
//
// 2026-07-28 (found in review): ThemeToggle used to keep its OWN useState + its own
// localStorage write to "minit.theme.v1". Once Settings gained a light/dark control
// there were two writers and two copies of the state: changing it in Settings left
// this button's icon wrong AND made the next tap a no-op, so the person tapped the
// theme button and the app appeared to ignore them. It now reads and writes the one
// AppearanceProvider, which owns the class on <html> and the stored value.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Moon, Search, Sun } from "lucide-react";
import { LanguageSwitcher, useTriText } from "@/components/language-provider";
import { useAppearance } from "@/components/appearance-provider";
import { AccountControls } from "./org-chip";

export function SearchForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const t = useTriText();
  const router = useRouter();
  const [q, setQ] = useState("");

  // Keyword search over stored records — NOT a chatbot (CLAUDE.md rule 10).
  function submit() {
    const trimmed = q.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    onSubmitted?.();
  }

  return (
    <form
      className="v2-glass flex flex-1 items-center gap-3 rounded-md px-5 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <button
        type="submit"
        aria-label={t("Cari", "搜索", "Search")}
        className="flex size-11 shrink-0 items-center justify-center rounded-sm text-[color:var(--v2-text-soft)] hover:bg-white/60"
      >
        <Search className="h-5 w-5" strokeWidth={1.9} />
      </button>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t(
          "Cari minit, resit, fasal…",
          "搜索记录、收据、条款…",
          "Search minutes, receipts, clauses…"
        )}
        className="w-full bg-transparent text-base text-[color:var(--v2-text)] placeholder:text-[color:var(--v2-text-soft)] focus:outline-none"
      />
    </form>
  );
}

export function TopSearch() {
  return (
    <div className="flex items-center gap-3">
      <SearchForm />
      {/* The active organisation lives in the sidebar footer, not here — one
          place for "which org am I in", and a calmer top bar. */}
      <div className="hidden items-center gap-2 sm:flex">
        <div className="v2-glass rounded-xs px-2 py-1.5">
          <LanguageSwitcher />
        </div>
        <ThemeToggle />
        <AccountControls />
      </div>
    </div>
  );
}

export function ThemeToggle() {
  const t = useTriText();
  // ONE source of truth — see the note in this file's header.
  const { dark, setDark } = useAppearance();

  return (
    <button
      type="button"
      onClick={() => setDark(!dark)}
      aria-label={
        dark
          ? t("Tukar ke terang", "切换到浅色", "Switch to light")
          : t("Tukar ke gelap", "切换到深色", "Switch to dark")
      }
      className="v2-glass flex h-11 w-11 items-center justify-center rounded-sm text-[color:var(--v2-text)]"
    >
      {dark ? <Sun className="h-5 w-5" strokeWidth={1.9} /> : <Moon className="h-5 w-5" strokeWidth={1.9} />}
    </button>
  );
}
