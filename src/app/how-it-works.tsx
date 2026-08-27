"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { BRAND_NAME } from "@/lib/brand";

// ---------------------------------------------------------------------------
// "See how it works" (A-3, 2026-08-25, J's #3): a four-frame walkthrough in a
// modal — handwritten page → Minit reads it → you confirm → the finished
// document — using REAL screenshots (competition/screenshots, copied into
// public/how-it-works). Not a video, deliberately: frames load instantly on a
// kampung connection and each one can be stared at for as long as needed.
//
// Entry points: the home page and the big empty states (/minutes, /money) —
// exactly the moments someone is wondering what this app would do for them.
// W-2 re-shoots all screenshots after the redesign; refresh the four copies
// in public/how-it-works then.
// ---------------------------------------------------------------------------

// F-3 (work order 31): each frame carries a "press here / look here" rectangle
// drawn by CSS over the screenshot (percent coordinates of the image, measured
// by scripts/howitworks-shots.mjs when the frames were shot) — never baked
// into the PNG, so a re-shoot only replaces the images.
type FrameHighlight = {
  left: string;
  top: string;
  width: string;
  height: string;
  labelBm: string;
  labelZh: string;
  labelEn: string;
};

const FRAMES: readonly {
  src: string;
  icon: string;
  bm: string;
  zh: string;
  en: string;
  hi: FrameHighlight;
}[] = [
  {
    src: "/how-it-works/step-1.png",
    icon: "📷",
    bm: "Ambil gambar nota tulisan tangan — atau taip sendiri.",
    zh: "拍下手写的会议笔记 —— 也可以自己打字。",
    en: "Photograph the handwritten notes — or type them in.",
    hi: {
      left: "29.5%",
      top: "69.0%",
      width: "9.4%",
      height: "6.4%",
      labelBm: "Tekan di sini",
      labelZh: "现在按这里",
      labelEn: "Press here",
    },
  },
  {
    src: "/how-it-works/step-2.png",
    icon: "🔍",
    bm: `${BRAND_NAME} membaca setiap baris. Yang kabur ditanda untuk anda semak.`,
    zh: `${BRAND_NAME} 逐行读出来。读不准的会标黄，等您核对。`,
    en: `${BRAND_NAME} reads every line. Smudged ones are flagged for you to check.`,
    hi: {
      left: "29.6%",
      top: "44.8%",
      width: "65.5%",
      height: "10.5%",
      labelBm: "Semak baris kuning di sini",
      labelZh: "标黄的在这里核对",
      labelEn: "Check the flagged lines here",
    },
  },
  {
    src: "/how-it-works/step-3.png",
    icon: "✅",
    bm: "Anda sahkan — barulah ia masuk daftar dan resit bernombor dijana.",
    zh: "您确认之后，才会进登记簿、开出连号收据。",
    en: "You confirm — only then does it enter the register and get numbered receipts.",
    // §1-4: the frame now points at the CONFIRM button itself (the sample
    // rows are gone from the real page — the walkthrough IS the demo).
    hi: {
      left: "29.5%",
      top: "69.1%",
      width: "24.3%",
      height: "6.9%",
      labelBm: "Sahkan di sini",
      labelZh: "在这里确认加入登记",
      labelEn: "Confirm here",
    },
  },
  {
    src: "/how-it-works/step-4.png",
    icon: "📄",
    bm: "Dokumen siap: minit rasmi, pek eROSES, tarikh akhir anda.",
    zh: "成品出来：正式会议记录、eROSES 粘贴包、您的截止日期。",
    en: "The finished pieces: official minutes, the eROSES pack, your deadlines.",
    hi: {
      left: "29.5%",
      top: "5.6%",
      width: "65.8%",
      height: "40%",
      labelBm: "Dokumen siap anda",
      labelZh: "做好的文件在这里",
      labelEn: "Your finished document",
    },
  },
];

/** The entry button + the modal it opens. Drop it on any page. */
export function HowItWorksButton({
  variant = "outline",
}: {
  variant?: "outline" | "link";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "link" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start text-base text-muted-foreground underline underline-offset-4"
        >
          ▶ <Tri bm="Lihat cara ia berfungsi" zh="看它怎么运作" en="See how it works" />
        </button>
      ) : (
        <Button variant="outline" size="lg" className="self-start text-base" onClick={() => setOpen(true)}>
          ▶ <Tri bm="Lihat cara ia berfungsi" zh="看它怎么运作" en="See how it works" />
        </Button>
      )}
      {open && <HowItWorksModal onClose={() => setOpen(false)} />}
    </>
  );
}

function HowItWorksModal({ onClose }: { onClose: () => void }) {
  const t = useTriText();
  const [i, setI] = useState(0);
  const frame = FRAMES[i];

  const prev = useCallback(() => setI((v) => Math.max(0, v - 1)), []);
  const next = useCallback(() => setI((v) => Math.min(FRAMES.length - 1, v + 1)), []);

  // Arrow keys and Escape work — someone demoing on a laptop will reach for
  // them without thinking.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t(`Cara ${BRAND_NAME} berfungsi`, `${BRAND_NAME} 怎么运作`, `How ${BRAND_NAME} works`)}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-md bg-[color:var(--v2-card)] p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-lg font-semibold">
            {frame.icon}{" "}
            <span className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--v2-primary-fill)] text-sm font-bold text-white">
              {i + 1}
            </span>
            <Tri bm={frame.bm} zh={frame.zh} en={frame.en} />
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60"
            aria-label={t("Tutup", "关闭", "Close")}
          >
            <X className="h-6 w-6" strokeWidth={2.2} />
          </button>
        </div>

        {/* F-3: the screenshot with its CSS "look here" box on top. The box is
            positioned in percent of the image, so it survives any modal size. */}
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={frame.src}
            alt={t(frame.bm, frame.zh, frame.en)}
            className="w-full rounded-md border border-[color:var(--v2-border)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-sm border-4 border-red-500 shadow-[0_0_0_3px_rgba(255,255,255,0.7)]"
            style={{
              left: frame.hi.left,
              top: frame.hi.top,
              width: frame.hi.width,
              height: frame.hi.height,
            }}
          >
            <span className="absolute -top-8 left-0 whitespace-nowrap rounded-md bg-red-600 px-2 py-1 text-sm font-semibold text-white">
              {t(frame.hi.labelBm, frame.hi.labelZh, frame.hi.labelEn)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" size="lg" disabled={i === 0} onClick={prev}>
            <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
            <Tri bm="Sebelum" zh="上一格" en="Back" />
          </Button>
          <div className="flex items-center gap-2" aria-hidden>
            {FRAMES.map((_, d) => (
              <button
                key={d}
                type="button"
                onClick={() => setI(d)}
                className={`h-3 w-3 rounded-full ${
                  d === i
                    ? "bg-[color:var(--v2-primary-fill)]"
                    : "bg-[color:var(--v2-border)]"
                }`}
              />
            ))}
          </div>
          {i === FRAMES.length - 1 ? (
            <Button size="lg" onClick={onClose}>
              <Tri bm="Faham!" zh="明白了" en="Got it" />
            </Button>
          ) : (
            <Button size="lg" onClick={next}>
              <Tri bm="Seterusnya" zh="下一格" en="Next" />
              <ChevronRight className="h-5 w-5" strokeWidth={2.2} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
