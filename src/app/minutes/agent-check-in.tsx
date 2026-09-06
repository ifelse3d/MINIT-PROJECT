"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// THE AGENT IS IN THE ROOM (work order 118 §6 — 108 §7, J's 6th point).
//
// J, 8/31: once he was inside the three-step wizard the agent vanished; all
// that was left was a line of small underlined text saying "Discuss … with
// the AI (1 AI action per message)". He wanted it to SPEAK UP: 「這裡我不
// 確定，你看對不對」.
//
// So each step ends with one sentence from MinitAI, in plain words:
//
//   "I am not sure about N things here. Sort them out now?"   — with the
//   ask-back cards (118 §3) right under it, or a jump to the rows it marked;
//   "I understood everything in this step."                    — otherwise.
//
// 🔴 It NEVER edits anything by itself (100 §0, the two-tier rule stands):
// every card below is a question a person answers with a tap; the sentence
// only counts them. Zero AI, zero quota — the counting is code.
//
// 🔴 Icon: 🤖 — a machine, no community. Checked against the house rule.
// ---------------------------------------------------------------------------

export function AgentCheckIn({
  uncertain,
  cards,
  onHandleNow,
  extra,
}: {
  /** How many things MinitAI is unsure about on this step. */
  uncertain: number;
  /** The ask-back cards for this step (rendered under the sentence). */
  cards?: ReactNode;
  /** When the uncertain things live elsewhere on the page (amber rows), the
   *  "sort them out now" button jumps there instead of opening cards. */
  onHandleNow?: () => void;
  /** Anything that belongs beside the sentence — the discuss entry. */
  extra?: ReactNode;
}) {
  const [showing, setShowing] = useState(true);
  const hasCards = uncertain > 0 && cards !== undefined;
  return (
    <div
      data-probe="agent-check-in"
      data-uncertain={uncertain}
      className="flex flex-col gap-3 rounded-md border-2 border-[color:var(--v2-primary)]/30 bg-[color:var(--v2-card)] p-4"
    >
      <p className="text-base font-medium">
        🤖{" "}
        {uncertain > 0 ? (
          <Tri
            bm={`Saya tidak pasti tentang ${uncertain} perkara di sini. Mahu selesaikan sekarang?`}
            zh={`我这里有 ${uncertain} 个地方不确定，现在处理吗？`}
            en={`I am not sure about ${uncertain} thing${uncertain > 1 ? "s" : ""} here. Sort them out now?`}
          />
        ) : (
          <Tri
            bm="Langkah ini saya faham semuanya."
            zh="这一步我都看得懂。"
            en="I understood everything in this step."
          />
        )}
      </p>
      {uncertain > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {hasCards ? (
            <Button
              type="button"
              variant={showing ? "outline" : "default"}
              onClick={() => setShowing((s) => !s)}
            >
              {showing ? (
                <Tri bm="Nanti dahulu" zh="等一下再处理" en="Later" />
              ) : (
                <Tri bm="Selesaikan sekarang" zh="现在处理" en="Sort them out now" />
              )}
            </Button>
          ) : (
            onHandleNow && (
              <Button type="button" onClick={onHandleNow}>
                <Tri bm="Tunjukkan saya" zh="现在处理" en="Show me" />
              </Button>
            )
          )}
        </div>
      )}
      {hasCards && showing && cards}
      {extra}
    </div>
  );
}
