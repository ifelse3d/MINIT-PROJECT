"use client";

// ---------------------------------------------------------------------------
// APPEARANCE — the "make the writing bigger" control.
//
// WHY (user request, 2026-07-28: "大小我希望是可以在 setting 里调要多大多小，
// 客户有长者也有中年也有年轻，太大了对于可以看到的不友善")
//
// The previous pass enlarged everything for everyone. That helped the 72-year-old
// treasurer and punished the 30-year-old secretary, for whom the same setting
// wastes half the screen and turns a one-screen page into four.
//
// Design notes for this control specifically, because it is the one control a
// person uses when they are ALREADY struggling to read:
//   * The options are shown at their own size. "Besar" is rendered large. You
//     pick by looking, not by reading a percentage.
//   * It applies the instant you tap it — no Save button, nothing to confirm.
//     If it is wrong you can see that it is wrong and tap another one.
//   * Light/dark sits here too, because "the screen is hard to read" is one
//     problem in the person's mind, not two.
// ---------------------------------------------------------------------------

import { Moon, Sun } from "lucide-react";
import {
  TEXT_SIZES,
  TEXT_SIZE_LABELS,
  useAppearance,
} from "@/components/appearance-provider";
import { LanguageSwitcher, Tri, useLangs, useTriText } from "@/components/language-provider";
import { SettingsBlock, SettingsRow } from "./ui";

/** Preview size per step, so each option looks like what it does. */
const PREVIEW_CLASS: Record<(typeof TEXT_SIZES)[number], string> = {
  small: "text-base",
  medium: "text-lg",
  large: "text-xl",
  xlarge: "text-2xl",
};

/**
 * 2026-08-22: this used to be a <Card> with a paragraph on top. It is now three
 * ROWS inside the page's "Paparan" section — see ./ui.tsx for why. The controls
 * themselves are untouched: the size options still render at their own size,
 * and everything still applies the instant you tap it, with no Save button.
 */
export function AppearanceRows() {
  const t = useTriText();
  const { textSize, setTextSize, dark, setDark } = useAppearance();

  return (
    <>
      {/* Text size — full width: the whole point is that the options are shown
          at the size they set, so they cannot be squeezed into a column. */}
      <SettingsBlock>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-base font-semibold">
            <Tri bm="Saiz tulisan" zh="字体大小" en="Text size" />
          </span>
          <span className="text-sm text-muted-foreground">
            <Tri
              bm="Berubah serta-merta"
              zh="一按马上就变"
              en="Changes straight away"
            />
          </span>
        </div>
        <div className="grid gap-2.5 @xl:grid-cols-2">
          {TEXT_SIZES.map((size) => {
            const label = TEXT_SIZE_LABELS[size];
            const selected = textSize === size;
            return (
              <button
                key={size}
                type="button"
                aria-pressed={selected}
                onClick={() => setTextSize(size)}
                className={`flex min-h-20 flex-col items-start justify-center gap-0.5 rounded-md border-2 px-4 py-3 text-left transition-colors ${
                  selected
                    ? "border-[#a855f7] bg-[#a855f7]/10"
                    : "border-input bg-white/70 hover:border-[#a855f7]/50 dark:bg-white/5"
                }`}
              >
                <span
                  className={`font-semibold leading-tight ${PREVIEW_CLASS[size]}`}
                >
                  {selected && <span aria-hidden>✓ </span>}
                  {t(label.bm, label.zh, label.en)}
                </span>
                <span className="text-base text-muted-foreground">
                  {t(label.hint.bm, label.hint.zh, label.hint.en)}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsBlock>

      <SettingsRow label={<Tri bm="Warna latar" zh="背景颜色" en="Background" />}>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            aria-pressed={!dark}
            onClick={() => setDark(false)}
            className={`flex min-h-12 items-center gap-2 rounded-md border-2 px-4 text-base font-medium ${
              !dark
                ? "border-[#a855f7] bg-[#a855f7]/10"
                : "border-input bg-white/70 dark:bg-white/5"
            }`}
          >
            <Sun className="h-5 w-5" strokeWidth={2} />
            <Tri bm="Terang" zh="浅色" en="Light" />
          </button>
          <button
            type="button"
            aria-pressed={dark}
            onClick={() => setDark(true)}
            className={`flex min-h-12 items-center gap-2 rounded-md border-2 px-4 text-base font-medium ${
              dark
                ? "border-[#a855f7] bg-[#a855f7]/10"
                : "border-input bg-white/70 dark:bg-white/5"
            }`}
          >
            <Moon className="h-5 w-5" strokeWidth={2} />
            <Tri bm="Gelap" zh="深色" en="Dark" />
          </button>
        </div>
      </SettingsRow>

      {/* Language — ONE language at a time (Stage R). The advanced option
          below restores the old three-languages-side-by-side view, which is
          genuinely useful for a mixed committee reading one screen together. */}
      <SettingsRow
        label={<Tri bm="Bahasa" zh="语言" en="Language" />}
        help={
          <Tri
            bm="MinitAI dipaparkan dalam SATU bahasa yang anda pilih. Dokumen rasmi yang dijana tetap dalam BM."
            zh="MinitAI 会以您选的「一种」语言显示。生成的官方文件仍然是马来文。"
            en="MinitAI shows ONE language of your choice. Generated official documents remain in BM."
          />
        }
      >
        <div className="flex flex-col gap-3">
          <div className="w-fit">
            <LanguageSwitcher />
          </div>
          <TriParallelToggle />
        </div>
      </SettingsRow>
    </>
  );
}

/** Advanced: show all three languages side by side (the pre-redesign view). */
function TriParallelToggle() {
  const { mode, setMode } = useLangs();
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <input
        type="checkbox"
        checked={mode === "all"}
        onChange={(e) => setMode(e.target.checked ? "all" : "zh")}
        className="h-4 w-4 accent-[color:var(--v2-primary)]"
      />
      <Tri
        bm="Lanjutan: tunjuk ketiga-tiga bahasa serentak"
        zh="进阶：三种语言并排显示"
        en="Advanced: show all three languages side by side"
      />
    </label>
  );
}
