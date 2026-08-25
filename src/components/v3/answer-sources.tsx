"use client";

import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import { meetingTypeUiLabelTri } from "@/lib/meeting-types";

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
//
// 2026-08-23 — the same idea for the OTHER kind of fact. Since the assistant
// gained tools it can state a July total out of the donations table, and that
// has no meeting document to link to. It still needs provenance: "I looked in
// your donation records" is the difference between a citation and a claim, and
// it is also how somebody spots the assistant looking in the wrong place.
// ---------------------------------------------------------------------------

export type AnswerSource = {
  /** Matches the [n] in the reply text. */
  n: number;
  docId: number;
  meetingDate: string | null;
  meetingType: string | null;
};

/**
 * What each tool is called, in words a committee member reads.
 *
 * Deliberately says WHAT WAS LOOKED IN, not what the tool is named. "cari_derma"
 * is a function; "your donation records" is a place the person recognises and
 * can go and check for themselves.
 */
const LOOKUP_LABEL: Record<string, { bm: string; zh: string; en: string }> = {
  cari_derma: { bm: "Rekod derma anda", zh: "你们的捐款记录", en: "Your donation records" },
  cari_resit: { bm: "Resit anda", zh: "你们的收据", en: "Your receipts" },
  cari_fasal: { bm: "Perlembagaan anda", zh: "你们的章程", en: "Your constitution" },
  senarai_ajk: { bm: "Senarai AJK", zh: "你们的职位名单", en: "Your committee list" },
  tarikh_akhir: { bm: "Tarikh akhir anda", zh: "你们的死线", en: "Your deadlines" },
};

/** Where the lookup lands, so the person can go and see the same thing. */
const LOOKUP_HREF: Record<string, string> = {
  cari_derma: "/money/receipts",
  cari_resit: "/money/history",
  cari_fasal: "/constitution/clauses",
  senarai_ajk: "/members",
  tarikh_akhir: "/calendar",
};

export function AnswerSources({
  sources,
  lookups = [],
}: {
  sources: AnswerSource[];
  /** Tool names that actually ran for this answer, e.g. ["cari_derma"]. */
  lookups?: string[];
}) {
  const t = useTriText();
  const known = lookups.filter((name) => name in LOOKUP_LABEL);
  if ((!sources || sources.length === 0) && known.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-[color:var(--v2-border)] pt-2">
      {known.length > 0 && (
        <>
          <p className="text-sm font-semibold text-[color:var(--v2-text-soft)]">
            <Tri bm="Minit menyemak" zh="Minit 查了" en="Minit checked" />
          </p>
          <ul className="mb-1 flex flex-wrap gap-x-3 gap-y-1">
            {known.map((name) => {
              const l = LOOKUP_LABEL[name];
              return (
                <li key={name}>
                  <Link
                    href={LOOKUP_HREF[name] ?? "/"}
                    className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4 hover:opacity-80"
                  >
                    <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                    {t(l.bm, l.zh, l.en)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {sources.length > 0 && (
      <>
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
                // K-4: the UI variant rides the official BM term along
                // (G-4 did this for the history page; this card lagged).
                <span className="text-[color:var(--v2-text-soft)]">
                  · <Tri {...meetingTypeUiLabelTri(s.meetingType)} />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      </>
      )}
    </div>
  );
}
