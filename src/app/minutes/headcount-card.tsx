"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { headcountQuestion } from "@/lib/minutes-ambiguity";
import { confirmedHeadcount } from "@/lib/attendance-gate";
import { useMinutes } from "./minutes-store";

// ---------------------------------------------------------------------------
// THE HEADCOUNT CARD (work order 125 §2-3 — J 2026-09-07).
//
// J's AGM page records attendance in one line: 「理事12人,请假2人(甲,乙),
// 会员40人」. The reader copied it right; nothing counted it; the attendance
// step saw no names and made him type one; the document said "1 orang".
//
// Code counts the line (src/lib/headcount.ts) and this card ASKS:
//
//   "The page says: 「…」. I make that 52 present (理事 12 + 会员 40); the 2
//    on leave are not counted. Right?"      [Yes, 52]  [No, I will type it]
//
// and, when the line is a shape code does not know (the third ask-back
// shape, minutes-ambiguity.ts):
//
//   "The page says: 「…」. How many does this say were present?"   [ ___ ]
//
// Nothing is pre-selected and nothing is pre-filled in the typing box; no
// quota is spent (the page was read already). The answer is a person's
// statement (attendance_confirmed) — it satisfies D30 without a name list,
// and it is what the document prints and eROSES receives.
//
// 🔴 Icons: 🤖 (a machine) and 🙋 (a raised hand) — checked against the
// house rule; ✅ is a mark, not a person.
// ---------------------------------------------------------------------------

/** Is the headcount line still an open question? (The agent's check-in
 *  sentence counts it.) */
export function useHeadcountOpen(): boolean {
  const { extraction, isSample } = useMinutes();
  return !isSample && headcountQuestion(extraction) !== null;
}

export function HeadcountCard() {
  const t = useTriText();
  const { extraction, isSample, confirmHeadcount } = useMinutes();
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");

  if (isSample) return null;
  const line = extraction.attendance_count;
  if (!line || line.confidence === "missing" || line.value.trim() === "") return null;

  const confirmed = confirmedHeadcount(extraction);
  const submitTyped = () => {
    const n = Number(draft.trim());
    if (!Number.isInteger(n) || n <= 0) return;
    confirmHeadcount(n);
    setTyping(false);
    setDraft("");
  };

  // Answered: say what was agreed, and let it be taken back.
  if (confirmed !== undefined && !typing) {
    return (
      <div
        data-probe="headcount-card"
        data-state="confirmed"
        className="flex flex-wrap items-center gap-3 rounded-md border-2 border-green-400 bg-green-50 p-4 text-green-950 dark:bg-green-400/10 dark:text-green-50"
      >
        <p className="min-w-56 flex-1 text-base">
          ✅{" "}
          <Tri
            bm={`Bilangan hadir disahkan: ${confirmed} orang (daripada baris di atas kertas: 「${line.value}」).`}
            zh={`出席人数已确认：${confirmed} 人（来自纸上那句：「${line.value}」）。`}
            en={`Headcount confirmed: ${confirmed} present (from the line on the page: 「${line.value}」).`}
          />
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraft("");
            setTyping(true);
          }}
        >
          <Tri bm="Tukar" zh="改" en="Change" />
        </Button>
      </div>
    );
  }

  const question = headcountQuestion(extraction);
  const counted = question?.counted ?? null;

  // The typing box — opened by "No, I will type it", by "Change", or shown at
  // once when the line is a shape code cannot count. Never pre-filled.
  const typingBox = (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submitTyped();
          }
        }}
        placeholder={t("bilangan hadir", "出席人数", "number present")}
        className="h-11 w-36 rounded-sm border border-input bg-white px-3 text-base dark:bg-transparent"
        data-probe="headcount-input"
      />
      <Button type="button" onClick={submitTyped} disabled={!/^\d+$/.test(draft.trim()) || Number(draft) <= 0}>
        <Tri bm="Sahkan bilangan ini" zh="就是这个人数" en="Confirm this number" />
      </Button>
      {(typing && confirmed !== undefined) || (typing && counted) ? (
        <Button type="button" variant="ghost" onClick={() => setTyping(false)}>
          <Tri bm="Batal" zh="取消" en="Cancel" />
        </Button>
      ) : null}
    </div>
  );

  if (typing || counted === null) {
    return (
      <div
        data-probe="headcount-card"
        data-state={counted === null ? "unreadable" : "typing"}
        className="flex flex-col gap-3 rounded-md border-2 border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-400/10 dark:text-amber-50"
      >
        <p className="text-base font-semibold">🙋 「{line.value}」</p>
        <p className="text-base">
          {counted === null ? (
            <Tri
              bm="Berapa orang yang HADIR menurut baris ini? Saya tidak dapat mengiranya sendiri — taipkan bilangannya."
              zh="这一句写的是几个人出席？我算不出来 —— 请您填人数。"
              en="How many were PRESENT according to this line? I cannot count it myself — type the number."
            />
          ) : (
            <Tri
              bm="Taipkan bilangan yang hadir."
              zh="请填出席人数。"
              en="Type the number present."
            />
          )}
        </p>
        {typingBox}
        <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
          <Tri
            bm="Tiada kuota digunakan — ini hanya satu soalan. Bilangan ini masuk ke minit dan ke eROSES."
            zh="不用额度 —— 这只是问一句。这个人数会进会议记录和 eROSES。"
            en="No quota is used — this is only a question. The number goes into the minutes and into eROSES."
          />
        </p>
      </div>
    );
  }

  const partsText = counted.parts.map((p) => `${p.label} ${p.n}`).join(" + ");
  return (
    <div
      data-probe="headcount-card"
      data-state="counted"
      data-present={counted.present}
      className="flex flex-col gap-3 rounded-md border-2 border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-400/10 dark:text-amber-50"
    >
      <p className="text-base font-semibold">🤖 「{line.value}」</p>
      <p className="text-base">
        <Tri
          bm={`Saya kira ${counted.present} orang HADIR (${partsText})${counted.apologies > 0 ? `; ${counted.apologies} orang tidak hadir dengan maaf, tidak dikira` : ""}. Betul?`}
          zh={`我算出 ${counted.present} 人出席（${partsText}）${counted.apologies > 0 ? `，请假 ${counted.apologies} 人不算` : ""}。对吗？`}
          en={`I make that ${counted.present} PRESENT (${partsText})${counted.apologies > 0 ? `; the ${counted.apologies} on leave are not counted` : ""}. Right?`}
        />
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => confirmHeadcount(counted.present)} data-probe="headcount-yes">
          <Tri bm={`Betul, ${counted.present} orang`} zh={`对，就是 ${counted.present} 人`} en={`Yes, ${counted.present}`} />
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraft("");
            setTyping(true);
          }}
        >
          <Tri bm="Tidak, saya isi sendiri" zh="不对，我自己填人数" en="No, I will type the number" />
        </Button>
      </div>
      <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
        <Tri
          bm="Tiada kuota digunakan — ini hanya satu soalan. Bilangan yang anda sahkan masuk ke minit dan ke eROSES; AI tidak mengira."
          zh="不用额度 —— 这只是问一句。您确认的人数会进会议记录和 eROSES；AI 不算数。"
          en="No quota is used — this is only a question. The number you confirm goes into the minutes and into eROSES; the AI does not count."
        />
      </p>
    </div>
  );
}
