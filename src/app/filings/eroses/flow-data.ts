// Shared server-side reads for the eROSES flows (H2, work order 69).
//
// One place resolves "which meeting, which financial year" so the entry page,
// the Penyata Tahunan steps and the register-a-meeting page all agree. Every
// value is read under RLS and every sum is TypeScript (Hard Rule 2) — the
// client components only render and copy.

import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { getFenceState } from "@/lib/fence";
import { dayIsoMalaysia } from "@/lib/history";
import {
  getConfirmedMinutesDoc,
  listConfirmedMinutes,
  type ConfirmedMinutesDoc,
} from "@/db/minutes-list";
import { readOrgTypeFlags } from "@/lib/org-flags";

export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export type FlowMeetingOption = { id: number; label: string; meetingType: string };

export type FlowBase = {
  active: { id: number; role: string } | null;
  orgType: "registered" | "committee" | null;
  meetings: FlowMeetingOption[];
  selectedId: number | null;
  selected: ConfirmedMinutesDoc | null;
  todayIso: string;
  /** D44 (work order 78): non-null = free (fenced) org — every COPY in the
   *  flow is locked and the clean PDF leaves through the counted download.
   *  null = paid org OR demo (CONTOH 禁令: the demo never blocks anybody —
   *  getFenceState's own isDemo guard) OR fence read failed (fail open). */
  fence: { downloadsRemaining: number } | null;
};

export function meetingLabelOf(m: {
  title?: string | null;
  meetingTypeLabel?: string | null;
  meetingType: string;
  meetingDateIso?: string | null;
}): string {
  return (
    m.title ??
    `${m.meetingTypeLabel ?? m.meetingType}${m.meetingDateIso ? ` — ${m.meetingDateIso}` : ""}`
  );
}

/** The context every flow page starts from: org, meetings, the chosen doc. */
export async function loadFlowBase(docParam: string | string[] | undefined): Promise<FlowBase> {
  const active = await getActiveOrg().catch(() => null);
  const todayIso = dayIsoMalaysia(new Date().toISOString())!;
  if (!active) {
    return {
      active: null,
      orgType: null,
      meetings: [],
      selectedId: null,
      selected: null,
      todayIso,
      fence: null,
    };
  }
  const [{ orgType }, meetings, fenceState] = await Promise.all([
    readOrgTypeFlags(active.id),
    listConfirmedMinutes(),
    getFenceState(active),
  ]);
  const docRaw = Array.isArray(docParam) ? docParam[0] : docParam;
  const docId = Number(docRaw ?? "");
  const selectedId =
    Number.isInteger(docId) && docId > 0
      ? docId
      : meetings.length > 0
        ? meetings[0].id
        : null;
  const selected = selectedId !== null ? await getConfirmedMinutesDoc(selectedId) : null;
  return {
    active: { id: active.id, role: active.role },
    orgType,
    meetings: meetings.map((m) => ({
      id: m.id,
      label: meetingLabelOf(m),
      meetingType: m.meetingType,
    })),
    selectedId: selected?.id ?? null,
    selected,
    todayIso,
    fence: fenceState
      ? { downloadsRemaining: fenceState.remaining.downloads }
      : null,
  };
}

export type FlowMaklumat = {
  phone: string | null;
  financialYearStart: string | null;
  membersRegistered: number | null;
  membersVoting: number | null;
  banks: { id: number; bankName: string; accountNo: string }[];
};

/** Maklumat Am (migration 35) — null = database behind (say so, D8). */
export async function loadFlowMaklumat(orgId: number): Promise<FlowMaklumat | null> {
  const supabase = await getSupabaseServer();
  const [orgRead, banksRead] = await Promise.all([
    supabase
      .from("orgs")
      .select("phone, financial_year_start, members_registered, members_voting")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("org_bank_accounts")
      .select("id, bank_name, account_no")
      .eq("org_id", orgId)
      .order("id", { ascending: true }),
  ]);
  if (orgRead.error) return null;
  return {
    phone: (orgRead.data?.phone as string | null) ?? null,
    financialYearStart: (orgRead.data?.financial_year_start as string | null) ?? null,
    membersRegistered: (orgRead.data?.members_registered as number | null) ?? null,
    membersVoting: (orgRead.data?.members_voting as number | null) ?? null,
    banks: banksRead.error
      ? []
      : ((banksRead.data ?? []) as { id: number; bank_name: string; account_no: string }[]).map(
          (b) => ({ id: b.id, bankName: b.bank_name, accountNo: b.account_no }),
        ),
  };
}

/**
 * The financial year the Penyata covers: ?dari/?hingga override, else the
 * recorded financial year start (D2-2), else the calendar year.
 */
export function resolveRange(
  todayIso: string,
  fyStart: string | null,
  dari?: string,
  hingga?: string,
): { fromIso: string; toIso: string } {
  let fromIso = `${todayIso.slice(0, 4)}-01-01`;
  let toIso = todayIso;
  if (fyStart && ISO_DAY.test(fyStart)) {
    const monthDay = fyStart.slice(5);
    const thisYearStart = `${todayIso.slice(0, 4)}-${monthDay}`;
    fromIso =
      thisYearStart <= todayIso
        ? thisYearStart
        : `${Number(todayIso.slice(0, 4)) - 1}-${monthDay}`;
  }
  if (dari && ISO_DAY.test(dari)) fromIso = dari;
  if (hingga && ISO_DAY.test(hingga)) toIso = hingga;
  return { fromIso, toIso };
}

/** The step query string, so every link inside the flow keeps its context. */
export function flowQuery(sp: { doc?: string | string[]; dari?: string; hingga?: string }): string {
  const docRaw = Array.isArray(sp.doc) ? sp.doc[0] : sp.doc;
  const parts: string[] = [];
  if (docRaw && /^\d+$/.test(docRaw)) parts.push(`doc=${docRaw}`);
  if (sp.dari && ISO_DAY.test(sp.dari)) parts.push(`dari=${sp.dari}`);
  if (sp.hingga && ISO_DAY.test(sp.hingga)) parts.push(`hingga=${sp.hingga}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}
