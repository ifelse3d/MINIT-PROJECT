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
import { LanguageSwitcher, Tri, useTriText } from "@/components/language-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Preview size per step, so each option looks like what it does. */
const PREVIEW_CLASS: Record<(typeof TEXT_SIZES)[number], string> = {
  small: "text-base",
  medium: "text-lg",
  large: "text-xl",
  xlarge: "text-2xl",
};

export function AppearanceCard() {
  const t = useTriText();
  const { textSize, setTextSize, dark, setDark } = useAppearance();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Tri
            bm="Saiz tulisan & warna"
            zh="字体大小与颜色"
            en="Text size & colours"
          />
        </CardTitle>
        <CardDescription>
          <Tri
            bm="Pilih saiz yang senang anda baca. Ia berubah serta-merta dan Minit ingat pilihan anda pada peranti ini."
            zh="选一个您看得最舒服的大小。一按马上就变，Minit 会在这台设备上记住您的选择。"
            en="Pick the size you can read comfortably. It changes straight away, and Minit remembers your choice on this device."
          />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Text size */}
        <fieldset className="flex flex-col gap-3">
          <legend className="text-base font-semibold">
            <Tri bm="Saiz tulisan" zh="字体大小" en="Text size" />
          </legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {TEXT_SIZES.map((size) => {
              const label = TEXT_SIZE_LABELS[size];
              const selected = textSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTextSize(size)}
                  className={`flex min-h-20 flex-col items-start justify-center gap-0.5 rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
                    selected
                      ? "border-[#7c6cf5] bg-[#7c6cf5]/10"
                      : "border-input bg-white/70 hover:border-[#7c6cf5]/50 dark:bg-white/5"
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
        </fieldset>

        {/* Light / dark */}
        <div className="flex flex-col gap-2 border-t-2 border-[color:var(--v2-border)] pt-4">
          <span className="text-base font-semibold">
            <Tri bm="Warna latar" zh="背景颜色" en="Background" />
          </span>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              aria-pressed={!dark}
              onClick={() => setDark(false)}
              className={`flex min-h-12 items-center gap-2 rounded-2xl border-2 px-4 text-base font-medium ${
                !dark
                  ? "border-[#7c6cf5] bg-[#7c6cf5]/10"
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
              className={`flex min-h-12 items-center gap-2 rounded-2xl border-2 px-4 text-base font-medium ${
                dark
                  ? "border-[#7c6cf5] bg-[#7c6cf5]/10"
                  : "border-input bg-white/70 dark:bg-white/5"
              }`}
            >
              <Moon className="h-5 w-5" strokeWidth={2} />
              <Tri bm="Gelap" zh="深色" en="Dark" />
            </button>
          </div>
        </div>

        {/* Language — the switcher already exists in the top bar, but someone
            looking for it in Settings should find it here too. */}
        <div className="flex flex-col gap-2 border-t-2 border-[color:var(--v2-border)] pt-4">
          <span className="text-base font-semibold">
            <Tri bm="Bahasa" zh="语言" en="Language" />
          </span>
          <p className="text-base text-muted-foreground">
            <Tri
              bm="Anda boleh hidupkan lebih daripada satu — setiap label akan ditunjukkan dalam bahasa yang anda pilih."
              zh="可以同时开多种 —— 每个标签都会用您选的语言显示。"
              en="You can turn on more than one — every label is then shown in the languages you picked."
            />
          </p>
          <div className="v2-glass w-fit rounded-full px-2 py-1.5">
            <LanguageSwitcher />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
