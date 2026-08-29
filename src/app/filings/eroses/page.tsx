import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { getSupabaseServer } from "@/db/supabase-server";
import { dayIsoMalaysia } from "@/lib/history";
import {
  getConfirmedMinutesDoc,
  listConfirmedMinutes,
} from "@/db/minutes-list";
import { loadFilingRoster } from "@/app/minutes/roster-actions";
import { buildPastePack } from "@/lib/paste-pack";
import { loadStatementRows } from "@/app/money/report/data";
import {
  buildPenyataKewangan,
  type PenyataExpenseInput,
  type PenyataKewangan,
} from "@/lib/eroses-penyata";
import { ErosesGuide, type GuideAuditor, type GuideMaklumat } from "./eroses-guide";

// ---------------------------------------------------------------------------
// /filings/eroses — the STEP-BY-STEP Annual Return guide (D3, work order 56;
// J's own 17 eROSES screenshots are the curriculum). Nine steps, matching the
// portal's own "Langkah penyata tahunan" rail: each step explains what THAT
// eROSES page asks, puts Minit's matching values beside it with one COPY
// button per value, and — where a value is missing — says exactly which page
// records it (the D1/D2 holes, now filled).
//
// Server component: every value is read HERE under RLS and computed by
// TypeScript (Hard Rule 2). The client component only renders and copies.
// The screenshots themselves are J's own org's data and are NOT shipped —
// the guide describes the portal in words (拍板: 截图是教材不进产品).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function ErosesGuidePage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string | string[]; dari?: string; hingga?: string }>;
}) {
  const sp = await searchParams;
  const active = await getActiveOrg().catch(() => null);
  if (!active) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-10">
        <p className="v2-glass p-5 text-base">
          <Link href="/orgs" className="underline underline-offset-4">
            <Tri
              bm="Pilih atau cipta pertubuhan dahulu"
              zh="请先选择或创建机构"
              en="Choose or create an organisation first"
            />{" "}
            →
          </Link>
        </p>
      </div>
    );
  }

  const docRaw = Array.isArray(sp.doc) ? sp.doc[0] : sp.doc;
  const docId = Number(docRaw ?? "");
  const todayIso = dayIsoMalaysia(new Date().toISOString())!;

  const supabase = await getSupabaseServer();
  const [meetings, filingRoster, auditorsRead, orgRead, banksRead, branchesRead] =
    await Promise.all([
      listConfirmedMinutes(),
      loadFilingRoster(),
      supabase
        .from("auditors")
        .select("person_name, name_official, email, appointed_on, status")
        .eq("org_id", active.id)
        .order("id", { ascending: true }),
      supabase
        .from("orgs")
        .select("phone, financial_year_start, members_registered, members_voting")
        .eq("id", active.id)
        .maybeSingle(),
      supabase
        .from("org_bank_accounts")
        .select("bank_name, account_no")
        .eq("org_id", active.id)
        .order("id", { ascending: true }),
      supabase
        .from("orgs")
        .select("id", { count: "exact", head: true })
        .eq("parent_org_id", active.id),
    ]);

  const selectedId =
    Number.isInteger(docId) && docId > 0
      ? docId
      : meetings.length > 0
        ? meetings[0].id
        : null;
  const selected =
    selectedId !== null ? await getConfirmedMinutesDoc(selectedId) : null;
  const pastePack =
    selected?.extraction != null
      ? buildPastePack(selected.extraction, filingRoster)
      : null;

  // Auditors (migration 34) — a database that is behind answers with an
  // error; the guide then says so instead of pretending "no auditors".
  const auditors: GuideAuditor[] | null = auditorsRead.error
    ? null
    : ((auditorsRead.data ?? []) as GuideAuditor[]);

  // Maklumat Am (migration 35) — same fail-open shape.
  const maklumat: GuideMaklumat | null = orgRead.error
    ? null
    : {
        phone: (orgRead.data?.phone as string | null) ?? null,
        financialYearStart:
          (orgRead.data?.financial_year_start as string | null) ?? null,
        membersRegistered:
          (orgRead.data?.members_registered as number | null) ?? null,
        membersVoting: (orgRead.data?.members_voting as number | null) ?? null,
        banks: banksRead.error
          ? []
          : ((banksRead.data ?? []) as { bank_name: string; account_no: string }[]).map(
              (b) => ({ bankName: b.bank_name, accountNo: b.account_no }),
            ),
      };
  const branchCount = branchesRead.count ?? 0;
  const committeeCount = filingRoster.length;

  // The financial year: ?dari/?hingga override, else the recorded financial
  // year start (D2-2), else the calendar year. TypeScript sums every cell
  // (Hard Rule 2) via eroses-penyata.ts.
  let fromIso = `${todayIso.slice(0, 4)}-01-01`;
  let toIso = todayIso;
  const fyStart = maklumat?.financialYearStart ?? null;
  if (fyStart && ISO_DAY.test(fyStart)) {
    // The most recent financial year START on or before today.
    const monthDay = fyStart.slice(5);
    const thisYearStart = `${todayIso.slice(0, 4)}-${monthDay}`;
    fromIso =
      thisYearStart <= todayIso
        ? thisYearStart
        : `${Number(todayIso.slice(0, 4)) - 1}-${monthDay}`;
  }
  if (ISO_DAY.test(sp.dari ?? "")) fromIso = sp.dari as string;
  if (ISO_DAY.test(sp.hingga ?? "")) toIso = sp.hingga as string;

  let penyata: PenyataKewangan | null = null;
  const rows = await loadStatementRows(active.id, { fromIso, toIso });
  if (rows) {
    const KNOWN = new Set(["recorded", "submitted", "approved", "paid", "rejected"]);
    penyata = buildPenyataKewangan({
      donations: rows.donations.map((d) => ({
        amountCents: d.amountCents,
        purpose: d.purpose,
        donatedAtIso: d.donatedAtIso,
        kind: d.kind === "in_kind" ? "in_kind" : "cash",
      })),
      expenses: rows.expenses.map((e) => ({
        amountCents: e.amountCents,
        category: e.category,
        spentAtIso: e.spentAtIso,
        // Rows older than the claim flow have no status — they were direct
        // records of money already spent.
        status: (KNOWN.has(e.status ?? "")
          ? e.status
          : "recorded") as PenyataExpenseInput["status"],
      })),
      from: fromIso,
      to: toIso,
    });
  }

  return (
    <ErosesGuide
      meetings={meetings.map((m) => ({
        id: m.id,
        label:
          m.title ??
          `${m.meetingTypeLabel ?? m.meetingType}${m.meetingDateIso ? ` — ${m.meetingDateIso}` : ""}`,
        meetingType: m.meetingType,
      }))}
      selectedId={selected?.id ?? null}
      selectedLabel={
        selected
          ? (selected.title ??
            `${selected.meetingTypeLabel ?? selected.meetingType}${selected.meetingDateIso ? ` — ${selected.meetingDateIso}` : ""}`)
          : null
      }
      selectedMeetingType={selected?.meetingType ?? null}
      pastePack={pastePack}
      auditors={auditors}
      maklumat={maklumat}
      committeeCount={committeeCount}
      branchCount={branchCount}
      missingOfficialCount={
        filingRoster.filter((m) => (m.nameOfficial ?? "").trim() === "").length
      }
      penyata={penyata}
      fromIso={fromIso}
      toIso={toIso}
    />
  );
}
