"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import {
  constitutionCoverage,
  findAddressClause,
  findAmendmentRule,
  findNameClause,
  readRegisteredAddress,
  readRegisteredName,
  readRegistrationNo,
  type ClauseCoverage,
  type IdentityFact,
} from "@/lib/constitution-identity";
import type { ConfirmedClause } from "@/lib/constitution";
import type { ConstitutionOrganisation } from "@/lib/extraction";
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
  organisation,
  orgName,
  orgId,
}: {
  clauses: ConfirmedClause[];
  /**
   * §2 (104): the three facts the READ handed back — the AI's own answer,
   * preferred over the clause regex. Absent for a constitution read before
   * tonight (the durable copy stores clauses, not this block), and then every
   * row below falls back to the regex exactly as it always did.
   */
  organisation?: ConstitutionOrganisation;
  /** The name Minit currently uses for the active org. */
  orgName: string | null;
  /** null when there is no active org (nothing to rename). */
  orgId: number | null;
}) {
  const registered = readRegisteredName(clauses, organisation);
  const amendment = findAmendmentRule(clauses);
  const coverage = constitutionCoverage(clauses);

  // Nothing read yet: the page's own empty state already says "photograph your
  // constitution". A second empty panel saying it again is noise.
  if (clauses.length === 0) return null;

  return (
    <div className="flex flex-col gap-4 rounded-md border-2 border-purple-200 bg-purple-50/50 p-4 dark:border-purple-400/30 dark:bg-purple-400/10">
      <p className="text-lg font-semibold">
        📋{" "}
        <Tri
          bm="Apa yang MinitAI baca tentang pertubuhan anda"
          zh="MinitAI 从章程读到的机构资料"
          en="What MinitAI read about your organisation"
        />
      </p>

      <NameRow
        registered={registered}
        nameClause={findNameClause(clauses)}
        orgName={orgName}
        orgId={orgId}
        coverage={coverage}
      />
      <AlamatRow clauses={clauses} organisation={organisation} />
      <RegistrationRow organisation={organisation} />
      <AmendmentRow amendment={amendment} coverage={coverage} />
    </div>
  );
}

// --- the registered name -----------------------------------------------------

function NameRow({
  registered,
  nameClause,
  orgName,
  orgId,
  coverage,
}: {
  registered: IdentityFact | null;
  /** The NAMA clause itself, when one was read — even if the name inside it
   *  could not be parsed. */
  nameClause: ReturnType<typeof findNameClause>;
  orgName: string | null;
  orgId: number | null;
  coverage: ClauseCoverage;
}) {
  const [state, formAction, pending] = useActionState(renameOrg, INITIAL);
  const [dismissed, setDismissed] = useState(false);
  /** §3 (104): the third road — "none of these, I'll type it". */
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");

  if (!registered) {
    // 🔴 Three different truths, three different sentences (work order 85 ①;
    // J caught the panel claiming "There is no NAMA clause" about a document
    // whose Fasal 1 WAS the NAMA clause — Minit just could not parse the name
    // out of it. A false statement about their own document):
    //   (a) the NAMA clause is here, the name is not parseable → quote the
    //       clause verbatim and ask the person to check it (eROSES test: they
    //       read and confirm; they are not sent to fill in a form);
    //   (b) clauses are missing → NotFound names the missing numbers;
    //   (c) everything is here and there genuinely is no NAMA clause → say so.
    if (nameClause) {
      return (
        <Field
          label={<Tri bm="Nama berdaftar" zh="注册名称" en="Registered name" />}
        >
          <div className="flex flex-col gap-2">
            <p className="text-base">
              <Tri
                bm="Fasal NAMA ada dalam perlembagaan anda, tetapi MinitAI tidak pasti bahagian mana ialah nama berdaftar. Sila baca fasal itu sendiri:"
                zh="您的章程里有「名称」那一条，但 MinitAI 没办法确定哪一段才是注册名称。请您自己看这一条："
                en="Your constitution does have a NAMA clause, but MinitAI could not tell which part is the registered name. Please read the clause yourself:"
              />
            </p>
            <Source source={{ kind: "clause", clause: nameClause }} showText />
            <p className="text-sm text-muted-foreground">
              <Tri
                bm={`Nama yang MinitAI guna sekarang: ${orgName ?? "—"}.`}
                zh={`MinitAI 现在用的名字是：${orgName ?? "—"}。`}
                en={`The name MinitAI is using now: ${orgName ?? "—"}.`}
              />
            </p>
            {/* §3 (104): the box is HERE, not a sentence pointing at
                Settings. J read the clause, saw the right name, and had
                nowhere to put it. */}
            <TypeOwnName orgId={orgId} />
          </div>
        </Field>
      );
    }
    return (
      <Field
        label={<Tri bm="Nama berdaftar" zh="注册名称" en="Registered name" />}
      >
        <NotFound
          coverage={coverage}
          absent={
            <Tri
              bm="Tiada fasal NAMA dalam perlembagaan yang MinitAI pegang. Taip nama berdaftar di bawah."
              zh="MinitAI 手上这份章程里没有「名称」那一条。注册名称请在下面自己填。"
              en="There is no NAMA clause in the constitution MinitAI holds. Type the registered name below."
            />
          }
        />
        <div className="mt-2">
          <TypeOwnName orgId={orgId} />
        </div>
      </Field>
    );
  }

  const matches =
    orgName !== null &&
    registered.value.trim().toLowerCase() === orgName.trim().toLowerCase();

  return (
    <Field label={<Tri bm="Nama berdaftar" zh="注册名称" en="Registered name" />}>
      <p className="text-base font-semibold">{registered.value}</p>
      <Source source={registered.source} />

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
              bm="Sama dengan nama yang MinitAI guna sekarang."
              zh="和 MinitAI 现在用的名字一样。"
              en="Same as the name MinitAI is using."
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
        <div className="mt-3 flex flex-col gap-2 rounded-md border-2 border-amber-300 bg-amber-50 p-3 dark:border-amber-400/40 dark:bg-amber-400/10">
          <p className="text-base font-medium text-amber-900 dark:text-amber-100">
            <Tri
              bm="Nama ini tidak sama dengan nama yang MinitAI guna sekarang:"
              zh="这个名字跟 MinitAI 现在用的不一样："
              en="This is not the name MinitAI is using at the moment:"
            />{" "}
            <span className="font-semibold">{orgName ?? "—"}</span>
          </p>
          <p className="text-sm text-amber-900 dark:text-amber-100">
            <Tri
              bm="Nama yang MinitAI guna dicetak pada setiap resit dan dokumen rasmi, jadi ia patut sama dengan perlembagaan."
              zh="MinitAI 用的名字会印在每一张收据和官方文件上，所以应该跟章程一样。"
              en="The name MinitAI uses is printed on every receipt and official document, so it should match the constitution."
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
                <input type="hidden" name="name" value={registered.value} />
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
            {/* 🔴 §3 (104), THE THIRD ROAD. J, 2026-08-31 evening: 「讀錯了
                沒得改」— and he was right, there were only ever two buttons.
                He pressed "use the constitution's name", the read was wrong,
                and his organisation was then really called "Persatuan" with
                no way back on this screen. A reading the person can only
                accept or ignore is not a review. */}
            {orgId !== null && !typing && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTyped(registered.value);
                  setTyping(true);
                }}
              >
                ✏️{" "}
                <Tri
                  bm="Dua-dua salah — saya taip sendiri"
                  zh="都不对，我自己打"
                  en="Neither — I'll type it myself"
                />
              </Button>
            )}
          </div>
          {orgId !== null && typing && (
            <TypeOwnName orgId={orgId} initial={typed} />
          )}
        </div>
      )}
    </Field>
  );
}

/**
 * §3 (104): the box where a person types the registered name themselves.
 *
 * Deliberately the SAME write path as the adopt button — renameOrg, which is
 * user-scoped so RLS decides whether this account may rename this society, and
 * which revalidates the layout so the new name appears everywhere at once.
 * There is no second door into orgs.name, and no new server action to audit.
 *
 * It is a text box, not a form to fill in, and it opens PRE-FILLED with what
 * MinitAI read — the eROSES test survives: the person corrects a draft, they
 * are not interviewed. (Where nothing was read at all, it opens empty, which
 * is the one case in which typing is the only honest option.)
 */
function TypeOwnName({
  orgId,
  initial = "",
}: {
  orgId: number | null;
  initial?: string;
}) {
  const [state, formAction, pending] = useActionState(renameOrg, INITIAL);
  const [value, setValue] = useState(initial);

  if (orgId === null) return null;
  if (state.ok) {
    return (
      <p className="text-base text-green-800 dark:text-green-300">
        ✓{" "}
        <Tri
          bm="Nama pertubuhan sudah dikemas kini."
          zh="机构名称已经更新。"
          en="The organisation name has been updated."
        />
      </p>
    );
  }
  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2">
      <input type="hidden" name="orgId" value={orgId} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-muted-foreground">
          <Tri
            bm="Nama berdaftar pertubuhan anda"
            zh="您机构的注册名称"
            en="Your organisation's registered name"
          />
        </span>
        <input
          name="name"
          value={value}
          onChange={(e) => {
            // C-4 (拍板 33), the same rule as the sign-up box: the ROS
            // register writes society names in CAPITALS, so a mixed-case
            // name here would disagree with every official document.
            // Uppercasing never changes the length, so the caret stays put.
            const el = e.currentTarget;
            const pos = el.selectionStart;
            setValue(el.value.toUpperCase());
            if (pos !== null)
              requestAnimationFrame(() => el.setSelectionRange(pos, pos));
          }}
          maxLength={200}
          autoCapitalize="characters"
          className="w-full rounded-md border-2 border-input bg-white px-3 py-2 text-base dark:bg-white/5"
        />
      </label>
      <span className="text-sm text-muted-foreground">
        <Tri
          bm="Nama ini dicetak pada setiap resit dan dokumen rasmi. Salin daripada perlembagaan atau sijil pendaftaran."
          zh="这个名字会印在每一张收据和正式文件上。请照章程或注册证书上的写法抄。"
          en="This name is printed on every receipt and official document. Copy it from the constitution or the registration certificate."
        />
      </span>
      {state.error && (
        <p className="text-sm font-medium text-red-800 dark:text-red-300">
          {state.error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending || value.trim() === ""}>
          {pending ? (
            <Tri bm="Sebentar…" zh="请稍候…" en="One moment…" />
          ) : (
            <Tri bm="Simpan nama ini" zh="用这个名字" en="Save this name" />
          )}
        </Button>
      </div>
    </form>
  );
}

// --- the registered address ----------------------------------------------------

/**
 * ⑥ (work order 85, J 2026-08-30: 「我是要讓系統知道社團的資訊，名字地址
 * 等等」). Same shape and same rules as NameRow: what was read, with its
 * clause; a clause that is about the address but would not parse is QUOTED
 * for the person to read (① rule); a constitution that never mentions an
 * address gets silence — where the clause is silent, the panel is silent.
 *
 * Display-only for now: the orgs table has no address column, so there is
 * deliberately no "use this address" button (and no migration for it — this
 * panel records what the document says, and its source).
 */
function AlamatRow({
  clauses,
  organisation,
}: {
  clauses: ConfirmedClause[];
  organisation?: ConstitutionOrganisation;
}) {
  const found = readRegisteredAddress(clauses, organisation);
  const addressClause = found ? null : findAddressClause(clauses);
  if (!found && !addressClause) return null;

  return (
    <Field
      label={
        <Tri bm="Alamat berdaftar" zh="注册地址" en="Registered address" />
      }
    >
      {found ? (
        <>
          <p className="text-base font-semibold">{found.value}</p>
          <Source source={found.source} />
          {/* §3 (104): said out loud, because there is no button here and a
              row with no button reads like a row that failed. The orgs table
              has no address column — adopting it needs a migration, which is
              J's to apply (D8), so tonight this row RECORDS what the document
              says and cites where. */}
          <p className="mt-1 text-sm text-muted-foreground">
            <Tri
              bm="MinitAI menyimpan alamat ini bersama perlembagaan anda dan menunjukkannya di sini. Ia belum boleh disalin ke dalam profil pertubuhan — itu perlu perubahan pangkalan data."
              zh="MinitAI 把这个地址跟章程一起留着，在这里给您看。目前还不能一键写进机构资料 —— 那需要改数据库。"
              en="MinitAI keeps this address with your constitution and shows it here. It cannot yet be copied into the organisation's profile — that needs a database change."
            />
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-base">
            <Tri
              bm="Perlembagaan anda ada fasal tentang alamat, tetapi MinitAI tidak pasti bahagian mana ialah alamatnya. Sila baca fasal itu sendiri:"
              zh="您的章程里有讲地址的条文，但 MinitAI 没办法确定哪一段才是地址。请您自己看这一条："
              en="Your constitution has a clause about the address, but MinitAI could not tell which part is the address. Please read the clause yourself:"
            />
          </p>
          <Source source={{ kind: "clause", clause: addressClause! }} showText />
        </div>
      )}
    </Field>
  );
}

// --- the PPM/ROS registration number -----------------------------------------

/**
 * §2 (104): the third of the three fields. Display-only and silent when the
 * document does not print it — same posture as the address row, and for the
 * same reason: there IS an orgs.ppm_no column, but the place a person sets it
 * is the sign-up door (§1) and Settings; a second writer of the same column on
 * this screen is a second thing to keep in step.
 */
function RegistrationRow({
  organisation,
}: {
  organisation?: ConstitutionOrganisation;
}) {
  const found = readRegistrationNo(organisation);
  if (!found) return null;
  return (
    <Field
      label={
        <Tri
          bm="No. pendaftaran (PPM/ROS)"
          zh="注册号（PPM/ROS）"
          en="Registration no. (PPM/ROS)"
        />
      }
    >
      <p className="text-base font-semibold">{found.value}</p>
      <Source source={found.source} />
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
      <AmendmentDisclosure>
        <NotFound
          coverage={coverage}
          absent={
            <Tri
              bm="Perlembagaan yang MinitAI pegang tiada fasal pindaan. Itu jarang berlaku — perlembagaan contoh ROS ada satu. Kalau memang tiada, tanya ROS bagaimana pertubuhan anda patut meminda undang-undangnya sebelum anda menukar apa-apa."
              zh="MinitAI 手上这份章程里没有「修改章程」这一条。这不常见 —— ROS 的样本章程是有的。如果真的没有，改任何东西之前先去问 ROS，你们社团要怎样修改章程。"
              en="The constitution MinitAI holds has no amendment clause. That is unusual — the ROS model constitution has one. If yours genuinely does not, ask ROS how your society is meant to amend its rules before you change anything."
            />
          }
        />
      </AmendmentDisclosure>
    );
  }

  const { clause, requiresGeneralMeeting, noticeDays, majority, needsRegistrarApproval } =
    amendment;

  return (
    <AmendmentDisclosure>
      <div className="flex flex-col gap-3 rounded-md border-2 border-amber-300 bg-amber-50 p-3 dark:border-amber-400/40 dark:bg-amber-400/10">
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
                  bm="Baca fasal di bawah — MinitAI tidak mahu meringkaskan syarat undang-undang."
                  zh="请看下面那一条 —— 法律条件，MinitAI 不敢帮您简化。"
                  en="Read the clause below — MinitAI will not summarise a legal condition."
                />
              </li>
            )}
        </ul>

        <Source source={{ kind: "clause", clause }} showText />

        {/* "Then ask if they need help." The paperwork this clause just
            demanded is paperwork MinitAI already knows how to make. */}
        <div className="flex flex-col gap-2 border-t-2 border-amber-300 pt-3 dark:border-amber-400/40">
          <p className="text-base font-medium text-amber-900 dark:text-amber-100">
            <Tri
              bm="Mahu MinitAI tolong?"
              zh="要 MinitAI 帮忙吗？"
              en="Would you like MinitAI to help?"
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
          {/* The same disclaimer the clause Q&A carries. MinitAI shows people
              their own rules; it does not tell them what the law requires. */}
          <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
            <Tri
              bm="MinitAI menunjukkan apa yang perlembagaan anda sendiri tulis. Ia bukan nasihat undang-undang."
              zh="MinitAI 只是把你们自己章程写的东西显示出来，这不是法律意见。"
              en="MinitAI shows what your own constitution says. This is not legal advice."
            />
          </p>
        </div>
      </div>
    </AmendmentDisclosure>
  );
}

/**
 * ⑤ (work order 85, J 2026-08-30: 「現在不是 pindaan 為什麼這樣」). The
 * amendment block is a STANDING explainer J asked for on 8/22 ("remind the
 * user that changing the constitution needs a general meeting") — but as a
 * permanently open amber card it read as "the system thinks I am amending my
 * constitution right now", and it was the loudest thing on the page. Nothing
 * inside it is removed; it now opens on demand, collapsed by default.
 *
 * Probe note: a closed <details>' body is NOT in innerText (§6 trap) — assert
 * on the summary, or open it first.
 */
function AmendmentDisclosure({ children }: { children: React.ReactNode }) {
  return (
    <details className="group rounded-md border-2 border-[color:var(--v2-border)] bg-white/50 dark:bg-white/5">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md p-3 hover:bg-accent/50">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Tri
              bm="Kalau anda mahu menukar perlembagaan"
              zh="如果要修改章程"
              en="If you want to change the constitution"
            />
          </span>
          <span className="block text-sm text-muted-foreground">
            <Tri
              bm="Tekan untuk lihat apa yang perlembagaan anda sendiri kata"
              zh="点开看您自己的章程是怎么写的"
              en="Tap to see what your own constitution says"
            />
          </span>
        </span>
        <span className="text-muted-foreground transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-1 px-3 pb-3">{children}</div>
    </details>
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
          bm={`Belum ada dalam apa yang MinitAI pegang — fasal ${list} masih tiada. Ambil gambar muka surat itu.`}
          zh={`MinitAI 手上这份还差第 ${list} 条 —— 请把那几页拍下来。`}
          en={`Not in what MinitAI holds — clause ${list} is still missing. Photograph those pages.`}
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
            bm={`MinitAI membaca fasal 1 hingga ${coverage.highest}, tiada yang tertinggal di antaranya. Kalau perlembagaan anda ada fasal selepas ${coverage.highest}, ambil gambar muka surat terakhir.`}
            zh={`MinitAI 读到第 1 到第 ${coverage.highest} 条，中间没有漏。如果你们章程在第 ${coverage.highest} 条后面还有，请把最后几页拍下来。`}
            en={`MinitAI read clauses 1 to ${coverage.highest} with none missing in between. If your constitution has clauses after ${coverage.highest}, photograph the last pages.`}
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
 *  never a claim without the place it rests on.
 *
 *  §2 (104): two kinds now. A fact the CLAUSE regex parsed cites the clause it
 *  parsed; a fact the AI handed back cites the AI's own source_ref (where on
 *  the page, and the first words as printed) plus its confidence, so a
 *  "check" reading looks like one. */
function Source({
  source,
  showText = false,
}: {
  source: IdentityFact["source"];
  showText?: boolean;
}) {
  if (source.kind === "ai") {
    const ref = source.ref;
    return (
      <div className="text-sm text-muted-foreground">
        <p>
          <Tri bm="Sumber" zh="出处" en="Source" />:{" "}
          <span className="font-medium">
            {ref?.location ?? (
              <Tri bm="perlembagaan anda" zh="您的章程" en="your constitution" />
            )}
          </span>
          {source.confidence === "check" && (
            <>
              {" · "}
              <span className="font-medium text-amber-800 dark:text-amber-300">
                <Tri
                  bm="sila semak"
                  zh="请核对一下"
                  en="please double-check"
                />
              </span>
            </>
          )}
        </p>
        {ref?.snippet && (
          <blockquote className="mt-1.5 border-l-4 border-muted-foreground/30 pl-3 italic leading-relaxed">
            {ref.snippet}
          </blockquote>
        )}
      </div>
    );
  }
  const clause = source.clause;
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
