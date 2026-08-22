"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { Tri } from "@/components/language-provider";
import { meetingTypeLabelTri } from "@/lib/meeting-types";

// ---------------------------------------------------------------------------
// WHERE THE ASSISTANT GOT IT FROM.
//
// 2026-08-20, docs/助手重做-设计.md §2: "每个事实要带出处 —— 哪一场会议、哪一天
// ⋯⋯ 使用者点得进去看原文，AI 就骗不了人."
//
// This little list is the enforcement half of letting the assistant read the
// society's records. The prompt tells it to cite [1], [2]; these are those
// numbers, as links to the meeting they came from. Anyone can click and check.
// An assistant that must show its working is a different thing from one that
// merely promises not to make things up.
//
// Renders nothing when there are no sources — an answer that used no record
// (how do I make a receipt?) must not grow an empty "Sumber" heading.
// ---------------------------------------------------------------------------

export type AnswerSource = {
  /** Matches the [n] in the reply text. */
  n: number;
  docId: number;
  meetingDate: string | null;
  meetingType: string | null;
};

export function AnswerSources({ sources }: { sources: AnswerSource[] }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-[color:var(--v2-border)] pt-2">
      <p className="text-sm font-semibold text-[color:var(--v2-text-soft)]">
        <Tri bm="Daripada minit anda" zh="出自你们的会议记录" en="From your minutes" />
      </p>
      <ul className="flex flex-col gap-1">
        {sources.map((s) => (
          <li key={`${s.n}-${s.docId}`}>
            <Link
              // #minutes-N is the anchor /minutes/history already puts on
              // every card (the activity calendar deep-links to it), so this
              // scrolls to the meeting and highlights it — no new page needed.
              href={`/minutes/history#minutes-${s.docId}`}
              className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4 hover:opacity-80"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span className="tabular-nums">[{s.n}]</span>
              <span>
                {s.meetingDate ?? (
                  <Tri
                    bm="tarikh tidak direkodkan"
                    zh="没有记录日期"
                    en="no date recorded"
                  />
                )}
              </span>
              {s.meetingType && (
                <span className="text-[color:var(--v2-text-soft)]">
                  · <Tri {...meetingTypeLabelTri(s.meetingType)} />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
