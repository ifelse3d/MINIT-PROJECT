"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { openAmbiguities } from "@/lib/minutes-ambiguity";
import { circled } from "./item-sources";
import { useMinutes } from "./minutes-store";

// ---------------------------------------------------------------------------
// THE ASK-BACK CARDS (work order 118 §3 — 看不懂的時候舉手，不要編一個).
//
// One amber card per line MinitAI can read two ways (src/lib/minutes-
// ambiguity.ts decides which; it is code, so the same line asks the same
// question every time). The card:
//   * quotes the line exactly as written, with the same circled number the
//     document's way-home list prints, so the two match by eye;
//   * spells each reading out as a WHOLE SENTENCE in plain words — never
//     our jargon — and pre-selects NOTHING (J: 兩個都亮著，人自己點);
//   * costs no quota: the paper was read already, this only asks a person;
//   * offers "neither, I will type it" and "keep it exactly as written".
//
// Choosing a reading is an ordinary human edit (editField): the line becomes
// the chosen sentence, confirmed, with its original provenance kept. Until
// then the document carries the line verbatim (verbatimForAmbiguous) — an
// honest shorthand beats a fluent guess.
//
// 🔴 Icons: 🙋 (a raised hand) is a gesture, not a person of any community;
// checked against the house rule.
// ---------------------------------------------------------------------------

/** How many questions are open right now — the agent's check-in sentence
 *  at the end of each step reads this. */
export function useOpenQuestionCount(): number {
  const { extraction, isSample } = useMinutes();
  return isSample ? 0 : openAmbiguities(extraction).length;
}

export function AskBackCards() {
  const t = useTriText();
  const { extraction, isSample, updateField, editField } = useMinutes();
  /** Which card has its own text box open (by extraction index). */
  const [typing, setTyping] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  if (isSample) return null;
  const open = openAmbiguities(extraction);
  if (open.length === 0) return null;

  const choose = (index: number, value: string) =>
    updateField((e) => {
      editField(e.resolutions[index].text, value);
      delete e.resolutions[index].as_written;
      return e;
    });
  const keepAsWritten = (index: number) =>
    updateField((e) => {
      e.resolutions[index].as_written = true;
      return e;
    });

  return (
    <div className="flex flex-col gap-3" data-probe="ask-back-cards">
      {open.map(({ ambiguity, extractionIndex }) => {
        const no = circled(ambiguity.index + 1);
        const isTyping = typing === extractionIndex;
        return (
          <div
            key={extractionIndex}
            data-card="ask-back"
            className="flex flex-col gap-3 rounded-md border-2 border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-400/10 dark:text-amber-50"
          >
            <p className="text-base font-semibold">
              🙋 {no}「{ambiguity.quote}」
            </p>
            <p className="text-base">
              <Tri
                bm="Baris ini boleh dibaca dua cara. Yang mana satu?"
                zh="这一条有两种读法，你要哪一个？"
                en="This line can be read two ways. Which one do you mean?"
              />
            </p>
            <div className="flex flex-col gap-2">
              {ambiguity.readings.map((r, k) => (
                <Button
                  key={k}
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-auto min-h-12 justify-start whitespace-normal border-amber-400 bg-white/70 text-left text-base dark:bg-white/5"
                  onClick={() => choose(extractionIndex, r.value)}
                >
                  ○ {t(r.label.bm, r.label.zh, r.label.en)}
                </Button>
              ))}
              {isTyping ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(ev) => setDraft(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" && draft.trim() !== "") {
                        choose(extractionIndex, draft.trim());
                        setTyping(null);
                      }
                    }}
                    placeholder={t(
                      "Tulis maksud baris ini dengan perkataan anda sendiri",
                      "用你自己的话写这一条的意思",
                      "Write what this line means, in your own words",
                    )}
                    className="h-12 min-w-0 flex-1 rounded-sm border-2 border-amber-400 bg-white px-3 text-base dark:bg-transparent"
                    aria-label={t("Tulis sendiri", "自己打", "Type it yourself")}
                  />
                  <Button
                    type="button"
                    disabled={draft.trim() === ""}
                    onClick={() => {
                      choose(extractionIndex, draft.trim());
                      setTyping(null);
                    }}
                  >
                    <Tri bm="Simpan" zh="保存" en="Save" />
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setTyping(null)}>
                    <Tri bm="Batal" zh="取消" en="Cancel" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-auto min-h-12 justify-start whitespace-normal border-amber-400 bg-white/70 text-left text-base dark:bg-white/5"
                  onClick={() => {
                    setDraft(ambiguity.quote);
                    setTyping(extractionIndex);
                  }}
                >
                  ○ <Tri bm="Bukan kedua-duanya — saya tulis sendiri" zh="都不是，我自己打" en="Neither — I will type it myself" />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button
                type="button"
                onClick={() => keepAsWritten(extractionIndex)}
                className="underline underline-offset-4"
              >
                <Tri
                  bm="Biarkan seperti yang ditulis"
                  zh="照原文保留，不用改"
                  en="Keep it exactly as written"
                />
              </button>
              <span className="text-amber-900/80 dark:text-amber-100/80">
                <Tri
                  bm="Tiada kuota digunakan — ini hanya soalan. Sehingga anda pilih, dokumen memaparkan baris ini seperti yang ditulis."
                  zh="不用额度 —— 这只是问一句。你没选之前，文件里这一条照原文显示。"
                  en="No quota used — this is only a question. Until you choose, the document shows this line exactly as written."
                />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
