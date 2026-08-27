"use client";

// ---------------------------------------------------------------------------
// ThemeToggle — the one light/dark switch (violet redesign §5.2: a 34px
// icon button on the top bar, with a tooltip). The big 574px SearchForm and
// the gear-menu AccountControls that used to live here were retired by the
// redesign: search is the compact top-bar input + command palette
// (top-bar.tsx), the account menu is the profile avatar (profile-menu.tsx).
// ---------------------------------------------------------------------------

import { Moon, Sun } from "lucide-react";
import { useTriText } from "@/components/language-provider";
import { useAppearance } from "@/components/appearance-provider";
import { IconTip } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const t = useTriText();
  // ONE source of truth: the appearance provider (settings and this button
  // may never disagree about which mode is on).
  const { dark, setDark } = useAppearance();
  const label = dark
    ? t("Tukar ke terang", "切换到浅色", "Switch to light")
    : t("Tukar ke gelap", "切换到深色", "Switch to dark");

  return (
    <IconTip label={label} side="bottom">
      <button
        type="button"
        onClick={() => setDark(!dark)}
        aria-label={label}
        className="flex h-9 w-9 items-center justify-center rounded-sm text-[color:var(--v2-text)] hover:bg-[color:var(--v2-card-nested)]"
      >
        {dark ? (
          <Sun className="h-5 w-5" strokeWidth={1.9} />
        ) : (
          <Moon className="h-5 w-5" strokeWidth={1.9} />
        )}
      </button>
    </IconTip>
  );
}
