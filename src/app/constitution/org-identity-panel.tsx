"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import {
  constitutionCoverage,
  findAmendmentRule,
  findRegisteredName,
  type ClauseCoverage,
} from "@/lib/constitution-identity";
import type { ConfirmedClause } from "@/lib/constitution";
import { renameOrg, type OrgActionState } from "../orgs/actions";

// ---------------------------------------------------------------------------
// WHAT MINIT LEARNED ABOUT YOUR SOCIETY FROM ITS OWN CONSTITUTION.
//
// 2026-08-22, J: "這個不是在 PERLEMBAGAAN 也有那個 NGO 的注冊名字嗎？那不是更好
// 讓他們直接 UPLOAD，然後給他們看，有什麽要改的才改。然後改了你也要看是否是需要
// 那種開 MESYUARAT AGUNG 的然後要改 PERLEMBAGAAN，然後提醒 USER 說要改這些成爲
// 新的是需要開會的。然後問是否需要協助然後給建議。這個才是一個好用的系統和 AI。
// 這個系統就是要幫助那些不怎麽懂的。"
//
// Three things, in the order the person needs them:
//
//   1. THE NAME MINIT READ, beside the name Minit is currently using. One
//      button adopts the registered one. This is the eROSES test applied to
//      sign-up: the authoritative document is in their hand, so Minit reads it
//      and the person CORRECTS it — they are not interviewed for it.
//
//   2. WHAT THEIR OWN CONSTITUTION SAYS ABOUT CHANGING ITSELF. This is the
//      part a first-time secretary does not know and cannot be expected to
//      guess: a wrong committee title is not a typo you fix, it is an
//      amendment that has to be passed at a general meeting. Minit says so
//      BEFORE they try, quoting the clause number and the verbatim text.
//
//   3. AN OFFER TO DO THE PAPERWORK — the meeting notice and agenda that the
//      clause just told them they need. "Then ask if they want help."
//
// 🔴 IT QUOTES, IT DOES NOT ADVISE. Every requirement shown here is read out of
// THIS society's own clause by the tested functions in
// src/lib/constitution-identity.ts, and the verbatim clause is printed beside
// it. Minit never says "the Societies Act requires…" and never states a
// deadline the document did not state — CLAUDE.md rule 10, no legal advice,
// ever. Where the clause is silent, the panel is silent.
//
// 🔴 WHEN SOMETHING IS NOT THERE, IT SAYS SO. See NotFound() below. The first
// draft of this panel answered "Minit has not read that clause yet, it is
// usually on the last pages" in every not-found case, and J was right to call
// that what it is: an excuse standing in for an answer. Clause numbers are a
// sequence, so Minit can tell "clause 4 is missing from what I hold" from
// "clauses 1–20 are all here and none of them is the amendment clause" — and it
// now says whichever of those is true.
// ---------------------------------------------------------------------------

const INITIAL: OrgActionState = { error: null, ok: false };

export function OrgIdentityPanel({
  clauses,
  orgName,
  orgId,
}: {
  clauses: ConfirmedClause[];
  /** The name Minit currently uses for the active org. */
  orgName: string | null;
  /** null when there is no active org (nothing to rename). */
  orgId: number | null;
}) {
  const registered = findRegisteredName(clauses);
  const amendment = findAmendmentRule(clauses);
  const coverage = constitutionCoverage(clauses);

  // Nothing read yet: the page's own empty state already says "photograph your
  // constitution". A second empty panel saying it again is noise.
  if (clauses.length === 0) return null;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border-2 border-purple-200 bg-purple-50/50 p-4 dark:border-purple-400/30 dark:bg-purple-400/10">
      <p className="text-lg font-semibold">
        📋{" "}
        <Tri
          bm="Apa yang Minit baca tentang pertubuhan anda"
          zh="Minit 从章程读到的机构资料"
          en="What Minit read about your organisation"
        />
      </p>

      <NameRow
        registered={registered}
        orgName={orgName}
        orgId={orgId}
        coverage={coverage}
      />
      <AmendmentRow amendment={amendment} coverage={coverage} />
    </div>
  );
}

// --- the registered name -----------------------------------------------------

function NameRow({
  registered,
  orgName,
  orgId,
  coverage,
}: {
  registered: ReturnType<typeof findRegisteredName>;
  orgName: string | null;
  orgId: number | null;
  coverage: ClauseCoverage;
}) {
  const [state, formAction, pending] = useActionState(renameOrg, INITIAL);
  const [dismissed, setDismissed] = useState(false);

  if (!registered) {
    return (
      <Field
        label={<Tri bm="Nama berdaftar" zh="注册名称" en="Registered name" />}
      >
        <NotFound
          coverage={coverage}
          absent={
            <Tri
              bm="Tiada fasal NAMA dalam perlembagaan yang Minit pegang. Taip nama berdaftar sendiri di Tetapan → Pertubuhan."
              zh="Minit 手上这份章程里没有「名称」那一条。注册名称请到 设置 → 机构 自己填。"
              en="There is no NAMA clause in the constitution Minit holds. Type the registered name yourself in Settings → Organisation."
            />
          }
        />
      </Field>
    );
  }

  const matches =
    orgName !== null &&
    registered.name.trim().toLowerCase() === orgName.trim().toLowerCase();

  return (
    <Field label={<Tri bm="Nama berdaftar" zh="注册名称" en="Registered name" />}>
      <p className="text-base font-semibold">{registered.name}</p>
      <Source clause={registered.clause} />

      {state.ok || matches || dismissed ? (
        <p className="mt-2 text-base text-green-800 dark:text-green-300">
          ✓{" "}
          {state.ok ? (
            <Tri
              bm="Nama pertubuhan sudah dikemas kini."
              zh="机构名称已经更新。"
              en="The organisation name has been updated."
            />
          ) : matches ? (
            <Tri
              bm="Sama dengan nama yang Minit guna sekarang."
              zh="和 Minit 现在用的名字一样。"
              en="Same as the name Minit is using."
            />
          ) : (
            <Tri
              bm="Nama sekarang dikekalkan."
              zh="保留现在的名字。"
              en="Keeping the current name."
            />
          )}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 dark:border-amber-400/40 dark:bg-amber-400/10">
          <p className="text-base font-medium text-amber-900 dark:text-amber-100">
            <Tri
              bm="Nama ini tidak sama dengan nama yang Minit guna sekarang:"
              zh="这个名字跟 Minit 现在用的不一样："
              en="This is not the name Minit is using at the moment:"
            />{" "}
            <span className="font-semibold">{orgName ?? "—"}</span>
          </p>
          <p className="text-sm text-amber-900 dark:text-amber-100">
            <Tri
              bm="Nama yang Minit guna dicetak pada setiap resit dan dokumen rasmi, jadi ia patut sama dengan perlembagaan."
              zh="Minit 用的名字会印在每一张收据和官方文件上，所以应该跟章程一样。"
              en="The name Minit uses is printed on every receipt and official document, so it should match the constitution."
            />
          </p>
          {state.error && (
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              {state.error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {orgId !== null && (
              <form action={formAction}>
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="name" value={registered.name} />
                <Button type="submit" disabled={pending}>
                  {pending ? (
                    <Tri bm="Sebentar…" zh="请稍候…" en="One moment…" />
                  ) : (
                    <Tri
                      bm="Guna nama daripada perlembagaan"
                      zh="改用章程上的名字"
                      en="Use the name from the constitution"
                    />
                  )}
                </Button>
              </form>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setDismissed(true)}
            >
              <Tri
                bm="Kekalkan nama sekarang"
                zh="保留现在的名字"
                en="Keep the current name"
              />
            </Button>
          </div>
        </div>
      )}
    </Field>
  );
}

// --- how it may be changed ---------------------------------------------------

function AmendmentRow({
  amendment,
  coverage,
}: {
  amendment: ReturnType<typeof findAmendmentRule>;
  coverage: ClauseCoverage;
}) {
  if (!amendment) {
    return (
      <Field
        label={
          <Tri
            bm="Kalau anda mahu menukar perlembagaan"
            zh="如果要修改章程"
            en="If you want to change the constitution"
          />
        }
      >
        <NotFound
          coverage={coverage}
          absent={
            <Tri
              bm="Perlembagaan yang Minit pegang tiada fasal pindaan. Itu jarang berlaku — perlembagaan contoh ROS ada satu. Kalau memang tiada, tanya ROS bagaimana pertubuhan anda patut meminda undang-undangnya sebelum anda menukar apa-apa."
              zh="Minit 手上这份章程里没有「修改章程」这一条。这不常见 —— ROS 的样本章程是有的。如果真的没有，改任何东西之前先去问 ROS，你们社团要怎样修改章程。"
              en="The constitution Minit holds has no amendment clause. That is unusual — the ROS model constitution has one. If yours genuinely does not, ask ROS how your society is meant to amend its rules before you change anything."
            />
          }
        />
      </Field>
    );
  }

  const { clause, requiresGeneralMeeting, noticeDays, majority, needsRegistrarApproval } =
    amendment;

  return (
    <Field
      label={
        <Tri
          bm="Kalau anda mahu menukar perlembagaan"
          zh="如果要修改章程"
          en="If you want to change the constitution"
        />
      }
    >
      <div className="flex flex-col gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 dark:border-amber-400/40 dark:bg-amber-400/10">
        <p className="text-base font-medium text-amber-900 dark:text-amber-100">
          ⚠{" "}
          <Tri
            bm="Ini bukan pembetulan biasa. Mengikut perlembagaan anda sendiri, perkara ini diperlukan:"
            zh="这不是普通的改字。按照你们自己的章程，需要做到这些："
            en="This is not an ordinary correction. Your own constitution requires this:"
          />
        </p>

        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-base text-amber-900 dark:text-amber-100">
          {requiresGeneralMeeting && (
            <li>
              <Tri
                bm="Diluluskan di Mesyuarat Agung — bukan oleh jawatankuasa sahaja"
                zh="必须在会员大会（Mesyuarat Agung）上通过 —— 理事会自己决定不算"
                en="Passed at a general meeting (Mesyuarat Agung) — not by the committee alone"
              />
            </li>
          )}
          {noticeDays !== null && (
            <li>
              <Tri
                bm={`Notis ${noticeDays} hari kepada ahli sebelum mesyuarat`}
                zh={`开会前 ${noticeDays} 天要通知会员`}
                en={`${noticeDays} days' notice to members before the meeting`}
              />
            </li>
          )}
          {majority !== null && (
            <li>
              <Tri
                bm={`Sokongan “${majority}” seperti tertulis dalam fasal`}
                zh={`条文写明要「${majority}」的支持`}
                en={`Support of “${majority}”, as the clause puts it`}
              />
            </li>
          )}
          {needsRegistrarApproval && (
            <li>
              <Tri
                bm="Kelulusan Pendaftar Pertubuhan (ROS) seperti disebut dalam fasal"
                zh="条文提到还需要社团注册局（ROS）批准"
                en="Approval from the Registrar of Societies (ROS), as the clause mentions"
              />
            </li>
          )}
          {!requiresGeneralMeeting &&
            noticeDays === null &&
            majority === null &&
            !needsRegistrarApproval && (
              <li>
                <Tri
                  bm="Baca fasal di bawah — Minit tidak mahu meringkaskan syarat undang-undang."
                  zh="请看下面那一条 —— 法律条件，Minit 不敢帮您简化。"
                  en="Read the clause below — Minit will not summarise a legal condition."
                />
              </li>
            )}
        </ul>

        <Source clause={clause} showText />

        {/* "Then ask if they need help." The paperwork this clause just
            demanded is paperwork Minit already knows how to make. */}
        <div className="flex flex-col gap-2 border-t-2 border-amber-300 pt-3 dark:border-amber-400/40">
          <p className="text-base font-medium text-amber-900 dark:text-amber-100">
            <Tri
              bm="Mahu Minit tolong?"
              zh="要 Minit 帮忙吗？"
              en="Would you like Minit to help?"
            />
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/agm-pack">
                📄{" "}
                <Tri
                  bm="Sediakan notis & agenda mesyuarat"
                  zh="准备开会通知和议程"
                  en="Prepare the meeting notice & agenda"
                />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/calendar/add">
                🗓{" "}
                <Tri
                  bm="Masukkan tarikh mesyuarat"
                  zh="把开会日期记进日历"
                  en="Put the meeting date in the calendar"
                />
              </Link>
            </Button>
          </div>
          {/* The same disclaimer the clause Q&A carries. Minit shows people
              their own rules; it does not tell them what the law requires. */}
          <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
            <Tri
              bm="Minit menunjukkan apa yang perlembagaan anda sendiri tulis. Ia bukan nasihat undang-undang."
              zh="Minit 只是把你们自己章程写的东西显示出来，这不是法律意见。"
              en="Minit shows what your own constitution says. This is not legal advice."
            />
          </p>
        </div>
      </div>
    </Field>
  );
}

/**
 * What Minit says when it did not find something.
 *
 * 🔴 2026-08-22, J: "如果章程沒有的就沒有，爲什麽還要偏説什麽還沒讀到因爲在後
 * 面？⋯⋯爲什麽你一直想著怎樣偷工減料然後一直找借口？"
 *
 * The first version of this panel answered "Minit has not read that clause yet,
 * it is usually on the last pages" no matter what — a hedge that sounds humble
 * and is actually just refusing to answer. It is also unnecessary, because
 * clause numbers are a sequence and constitutionCoverage() can tell the two
 * cases apart:
 *
 *   holes in 1..N  → name the missing clause numbers. Specific and actionable.
 *   no holes       → say the thing is not there, and say what to do about it.
 *
 * The one honest caveat is stated once, in the gap-free case, and only as a
 * fact about the last clause number: a complete 1..20 could still be a book
 * whose clause 21 was never photographed.
 */
function NotFound({
  coverage,
  absent,
}: {
  coverage: ClauseCoverage;
  /** What to say when the clauses are complete and it is simply not there. */
  absent: React.ReactNode;
}) {
  if (!coverage.gapFree) {
    const list = coverage.missing.join(", ");
    return (
      <p className="text-base">
        <Tri
          bm={`Belum ada dalam apa yang Minit pegang — fasal ${list} masih tiada. Ambil gambar muka surat itu.`}
          zh={`Minit 手上这份还差第 ${list} 条 —— 请把那几页拍下来。`}
          en={`Not in what Minit holds — clause ${list} is still missing. Photograph those pages.`}
        />
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-base">{absent}</p>
      {coverage.highest > 0 && (
        <p className="text-sm text-muted-foreground">
          <Tri
            bm={`Minit membaca fasal 1 hingga ${coverage.highest}, tiada yang tertinggal di antaranya. Kalau perlembagaan anda ada fasal selepas ${coverage.highest}, ambil gambar muka surat terakhir.`}
            zh={`Minit 读到第 1 到第 ${coverage.highest} 条，中间没有漏。如果你们章程在第 ${coverage.highest} 条后面还有，请把最后几页拍下来。`}
            en={`Minit read clauses 1 to ${coverage.highest} with none missing in between. If your constitution has clauses after ${coverage.highest}, photograph the last pages.`}
          />
        </p>
      )}
    </div>
  );
}

// --- small pieces ------------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

/** Where a fact came from. Hard Rule 1's `source_ref` reaching the screen:
 *  never a claim without the clause it rests on. */
function Source({
  clause,
  showText = false,
}: {
  clause: ConfirmedClause;
  showText?: boolean;
}) {
  return (
    <div className="text-sm text-muted-foreground">
      <p>
        <Tri bm="Sumber" zh="出处" en="Source" />:{" "}
        <span className="font-medium">{clause.clause_no}</span>
        {clause.heading && ` · ${clause.heading}`}
        {clause.page_ref && ` · ${clause.page_ref}`}
      </p>
      {showText && (
        <blockquote className="mt-1.5 border-l-4 border-muted-foreground/30 pl-3 italic leading-relaxed">
          {clause.text}
        </blockquote>
      )}
    </div>
  );
}
