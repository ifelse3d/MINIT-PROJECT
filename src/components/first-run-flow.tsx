"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Tri,
  useLangs,
  type LangKey,
} from "@/components/language-provider";
import {
  TEXT_SIZES,
  TEXT_SIZE_LABELS,
  useAppearance,
} from "@/components/appearance-provider";
import { useActiveOrg } from "@/components/v3/org-chip";

// ---------------------------------------------------------------------------
// FIRST-RUN FLOW (A-1, 2026-08-25, J's #21): the first time this device opens
// Minit, three steps before anything else —
//   ① choose a language (labels each in their own language),
//   ② set the text size RIGHT THERE, live, with "is this comfortable?",
//   ③ what happens next — name + organisation (or, later, an invite code).
// Every step is skippable; skipping keeps the defaults. An elderly first-time
// visitor should be comfortable BEFORE the first real screen, not after
// finding Settings.
//
// Trigger: the language provider's `needsChoice` (this device never chose a
// language) — the same gate the old single-step picker used, so devices that
// have already been through it never see this. The flow stays open through
// its steps even though choosing a language clears needsChoice.
//
// Step ③ is contextual: it can only DO something for a signed-in person with
// no organisation (button to /orgs/new — the form there asks name + org
// name). Signed out, it says what comes after signing in. Already set up, it
// is skipped entirely. When Stage B lands, the invite-code path joins here.
// ---------------------------------------------------------------------------

const LANG_OPTIONS: { key: LangKey; label: string; sub: string }[] = [
  { key: "zh", label: "中文", sub: "以中文使用 MinitAI" },
  { key: "bm", label: "Bahasa Malaysia", sub: "Guna MinitAI dalam BM" },
  { key: "en", label: "English", sub: "Use MinitAI in English" },
];

export function FirstRunFlow() {
  const { needsChoice, setMode } = useLangs();
  const { textSize, setTextSize } = useAppearance();
  const { email, org } = useActiveOrg();
  // No effect needed: while the device is fresh (`needsChoice`), the flow IS
  // step 1; advancing or finishing is recorded here. `needsChoice` going false
  // (a language was chosen) does not close the flow mid-way, because progress
  // takes over the moment step 1 is answered.
  const [progress, setProgress] = useState<{ step: 2 | 3 } | "done" | null>(null);
  const step: 1 | 2 | 3 | null =
    progress === "done" ? null : progress ? progress.step : needsChoice ? 1 : null;
  const setStep = (s: 2 | 3) => setProgress({ step: s });

  if (step === null) return null;

  const finish = () => setProgress("done");
  // Someone signed in AND set up has nothing to do at step ③.
  const afterSize = () => (email && org ? finish() : setStep(3));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="v2-glass max-h-[92vh] w-full max-w-md overflow-y-auto p-6">
        {step === 1 && (
          <>
            <h2 className="text-xl font-semibold">
              选择语言 · Pilih bahasa · Choose language
            </h2>
            <p className="mt-1 text-sm text-[color:var(--v2-text-soft)]">
              随时可以在设置里更改 · Boleh ditukar di Tetapan · Change any time
              in Settings
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {LANG_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    setMode(o.key);
                    setStep(2);
                  }}
                  className="flex flex-col items-start rounded-md border border-[color:var(--v2-outline-border)] px-4 py-3 text-left transition-colors hover:border-[color:var(--v2-primary)] hover:bg-[color:var(--v2-primary-soft)]"
                >
                  <span className="text-lg font-semibold">{o.label}</span>
                  <span className="text-sm text-[color:var(--v2-text-soft)]">
                    {o.sub}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                // Skipping = keeping 中文 (the default), recorded so this
                // device is never asked again.
                setMode("zh");
                setStep(2);
              }}
              className="mt-4 text-sm text-[color:var(--v2-text-soft)] underline underline-offset-4"
            >
              跳过 · Langkau · Skip
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-xl font-semibold">
              <Tri
                bm="Saiz tulisan — selesa dibaca?"
                zh="字体大小 —— 这样看得舒服吗？"
                en="Text size — comfortable to read?"
              />
            </h2>
            {/* The LIVE preview is the whole point: tapping a size changes the
                real root font-size immediately, this dialog included. */}
            <p className="mt-2 text-base text-[color:var(--v2-text-soft)]">
              <Tri
                bm="Tekan satu — seluruh skrin berubah serta-merta. Boleh ditukar bila-bila di Tetapan."
                zh="点一下，整个屏幕立刻跟着变。以后随时可以在设置里改。"
                en="Tap one — the whole screen changes instantly. Change it any time in Settings."
              />
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {TEXT_SIZES.map((size) => {
                const l = TEXT_SIZE_LABELS[size];
                const active = textSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setTextSize(size)}
                    aria-pressed={active}
                    className={`flex min-h-14 items-center justify-between rounded-md border-2 px-4 py-3 text-left transition-colors ${
                      active
                        ? "border-[color:var(--v2-primary)] bg-[color:var(--v2-primary-soft)]"
                        : "border-[color:var(--v2-outline-border)] hover:border-[color:var(--v2-primary)]"
                    }`}
                  >
                    <span className="text-lg font-semibold">
                      <Tri bm={l.bm} zh={l.zh} en={l.en} />
                    </span>
                    <span className="text-sm text-[color:var(--v2-text-soft)]">
                      <Tri bm={l.hint.bm} zh={l.hint.zh} en={l.hint.en} />
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={afterSize}
                className="text-sm text-[color:var(--v2-text-soft)] underline underline-offset-4"
              >
                <Tri bm="Langkau" zh="跳过" en="Skip" />
              </button>
              <Button size="lg" onClick={afterSize}>
                <Tri bm="Selesa — teruskan" zh="舒服了，继续" en="Comfortable — continue" />
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-xl font-semibold">
              <Tri
                bm="Satu langkah terakhir"
                zh="最后一步"
                en="One last step"
              />
            </h2>
            {email ? (
              <>
                <p className="mt-2 text-base text-[color:var(--v2-text-soft)]">
                  <Tri
                    bm="Beritahu MinitAI nama anda dan nama pertubuhan anda — nama yang betul akan tercetak pada resit dan minit."
                    zh="告诉 MinitAI 您的名字和机构的名字 —— 收据和会议记录上才会印出正确的名字。"
                    en="Tell MinitAI your name and your organisation's name — so the right names print on receipts and minutes."
                  />
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <Button asChild size="lg" onClick={finish}>
                    <Link href="/orgs/new">
                      <Tri
                        bm="Isi nama & pertubuhan saya →"
                        zh="填写名字和机构 →"
                        en="Enter my name & organisation →"
                      />
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <p className="mt-2 text-base text-[color:var(--v2-text-soft)]">
                <Tri
                  bm="Selepas log masuk, MinitAI akan tanya nama anda dan nama pertubuhan anda — kemudian semuanya sedia."
                  zh="登入之后，MinitAI 会问您的名字和机构的名字 —— 然后就都准备好了。"
                  en="After you sign in, MinitAI asks for your name and your organisation's name — then everything is ready."
                />
              </p>
            )}
            <div className="mt-4 flex items-center justify-end">
              <Button size="lg" variant={email ? "outline" : "default"} onClick={finish}>
                {email ? (
                  <Tri bm="Nanti dahulu" zh="待会再说" en="Later" />
                ) : (
                  <Tri bm="Faham" zh="明白了" en="Got it" />
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
