import "server-only";

import { getSupabaseServer } from "@/db/supabase-server";
import {
  dayIsoMalaysia,
  monthRange,
  monthUtcWindow,
  type ActivityRecord,
} from "@/lib/history";

// ---------------------------------------------------------------------------
// One month of org activity → ActivityRecord[]. SHARED by /calendar and
// /history (moved out of the calendar page so the query logic exists once).
// Every query is org_id-scoped and RLS applies on top. PDPA (Hard Rule 5, as
// revised by D18 + §1-10, work order 32): ids, dates, amounts, FULL donor
// names (in-app views show whose record it is — masking belongs to the
// moments data LEAVES the app), and committee member names (the actor
// columns: confirmed_by, collector, confirmed_by_hq). Still never IC
// numbers, question text, or document contents. Nothing here is logged, and
// none of it reaches an AI model (org-tools has its own selects).
//
// timestamptz columns are windowed in UTC (the Malaysian month shifted back
// 8h); plain date columns use the month's first/last day directly.
//
// `todayIso` splits meetings into history vs future: a meeting on or before
// today already happened (categories `agm` / `calendar`, filled dots, shown in
// /history), one after today has not (category `event`, outlined dot, /calendar
// only). Google Calendar behaves the same way — past entries stop looking
// upcoming. Callers may pass it explicitly so a test can pin "today".
// ---------------------------------------------------------------------------

export async function fetchMonthActivity(
  orgId: number,
  month: string,
  todayIso: string = dayIsoMalaysia(new Date().toISOString())!,
): Promise<ActivityRecord[]> {
  const supabase = await getSupabaseServer();
  const { firstIso, lastIso } = monthRange(month);
  const { startUtc, endUtc } = monthUtcWindow(month);
  const records: ActivityRecord[] = [];

  const [minutes, receipts, donations, expenses, remittances, einvois, pastePacks, uploads, constitutions, qa, dbDeadlines, dbEvents] =
    await Promise.all([
      // Confirmed minutes: bucket by confirmed_at, fall back to meeting_date.
      supabase
        .from("minutes_docs")
        .select("id, confirmed_at, meeting_date, confirmed_by")
        .eq("org_id", orgId)
        .eq("status", "confirmed")
        .or(
          `and(confirmed_at.gte.${startUtc},confirmed_at.lt.${endUtc}),and(confirmed_at.is.null,meeting_date.gte.${firstIso},meeting_date.lte.${lastIso})`,
        )
        .limit(200),
      supabase
        .from("receipts")
        .select(
          "id, issued_at, donation:donations!receipts_donation_id_fkey (amount_cents, donor_name, donor_masked, collector:members_roles!donations_collector_member_id_fkey (name))",
        )
        .eq("org_id", orgId)
        .gte("issued_at", startUtc)
        .lt("issued_at", endUtc)
        .limit(500),
      // Donations not yet receipted (receipted ones already count as receipts).
      supabase
        .from("donations")
        .select(
          "id, donated_at, amount_cents, donor_name, donor_masked, collector:members_roles!donations_collector_member_id_fkey (name)",
        )
        .eq("org_id", orgId)
        .is("receipt_id", null)
        .gte("donated_at", firstIso)
        .lte("donated_at", lastIso)
        .limit(500),
      supabase
        .from("expenses")
        .select("id, spent_at, amount_cents, category")
        .eq("org_id", orgId)
        .gte("spent_at", firstIso)
        .lte("spent_at", lastIso)
        .limit(500),
      supabase
        .from("remittance_batches")
        .select("id, handed_over_at, total_cents, confirmed_by_hq")
        .eq("org_id", orgId)
        .gte("handed_over_at", startUtc)
        .lt("handed_over_at", endUtc)
        .limit(200),
      supabase
        .from("einvois_packs")
        .select("id, generated_at")
        .eq("org_id", orgId)
        .gte("generated_at", startUtc)
        .lt("generated_at", endUtc)
        .limit(50),
      // paste_packs has no timestamp of its own — dated via its minutes doc.
      supabase
        .from("paste_packs")
        .select("id, minutes_doc:minutes_docs!paste_packs_minutes_doc_id_fkey (confirmed_at, meeting_date)")
        .eq("org_id", orgId)
        .limit(500),
      supabase
        .from("uploads")
        .select("id, uploaded_at, kind")
        .eq("org_id", orgId)
        .gte("uploaded_at", startUtc)
        .lt("uploaded_at", endUtc)
        .limit(500),
      // constitutions has no timestamp of its own — dated via the upload it was
      // ingested from (same trick as paste_packs). clauses_json is NEVER
      // selected: that is document content (Hard Rule 5).
      supabase
        .from("constitutions")
        .select("id, upload:uploads!constitutions_upload_id_fkey (uploaded_at)")
        .eq("org_id", orgId)
        .limit(200),
      // Q&A: ids + timestamps only, never the question text (PDPA).
      supabase
        .from("qa_log")
        .select("id, created_at")
        .eq("org_id", orgId)
        .gte("created_at", startUtc)
        .lt("created_at", endUtc)
        .limit(500),
      // Future items stored in the DB (empty until later phases write them —
      // the client merges its own computed deadlines/localStorage events).
      supabase
        .from("deadlines")
        .select("id, kind, due_date, status")
        .eq("org_id", orgId)
        .gte("due_date", firstIso)
        .lte("due_date", lastIso)
        .limit(100),
      supabase
        .from("events_meetings")
        .select("id, title, starts_at, kind")
        .eq("org_id", orgId)
        .gte("starts_at", startUtc)
        .lt("starts_at", endUtc)
        .limit(200),
    ]);

  for (const m of minutes.data ?? []) {
    const day = m.confirmed_at ? dayIsoMalaysia(m.confirmed_at) : m.meeting_date;
    if (!day) continue;
    records.push({
      category: "minutes",
      kind: "minutes",
      dayIso: day,
      href: `/minutes/history#minutes-${m.id}`,
      actor: m.confirmed_by ?? undefined,
      atIso: m.confirmed_at ?? undefined,
    });
  }

  type ReceiptRow = {
    id: number;
    issued_at: string;
    donation: {
      amount_cents: number;
      donor_name: string | null;
      donor_masked: string | null;
      collector: { name: string } | null;
    } | null;
  };
  for (const r of (receipts.data ?? []) as unknown as ReceiptRow[]) {
    const day = dayIsoMalaysia(r.issued_at);
    if (!day) continue;
    records.push({
      category: "money",
      kind: "receipt",
      dayIso: day,
      href: `/money/history#receipt-${r.id}`,
      amountCents: r.donation?.amount_cents ?? 0,
      // D18 + §1-10: the full name the treasurer typed; mask only as a
      // fallback for rows that never stored one.
      detail: r.donation?.donor_name ?? r.donation?.donor_masked ?? undefined,
      actor: r.donation?.collector?.name ?? undefined,
      atIso: r.issued_at,
    });
  }

  type DonationRow = {
    id: number;
    donated_at: string | null;
    amount_cents: number;
    donor_name: string | null;
    donor_masked: string | null;
    collector: { name: string } | null;
  };
  for (const d of (donations.data ?? []) as unknown as DonationRow[]) {
    if (!d.donated_at) continue;
    records.push({
      category: "money",
      kind: "donation",
      dayIso: d.donated_at,
      // §1-12: an UNRECEIPTED donation is not in the receipt history — the
      // register on the receipts page is where this row can be seen.
      href: "/money/receipts",
      amountCents: d.amount_cents,
      detail: d.donor_name ?? d.donor_masked ?? undefined,
      actor: d.collector?.name ?? undefined,
      // donated_at is a plain date; donations has no created_at column, so
      // there is honestly no clock time to print for these rows.
    });
  }

  for (const e of expenses.data ?? []) {
    if (!e.spent_at) continue;
    records.push({
      category: "money",
      kind: "expense",
      dayIso: e.spent_at,
      // Stage E: expenses have a real page of their own now.
      href: "/money/expenses",
      amountCents: e.amount_cents,
      detail: e.category ?? undefined,
    });
  }

  for (const b of remittances.data ?? []) {
    const day = b.handed_over_at ? dayIsoMalaysia(b.handed_over_at) : null;
    if (!day) continue;
    records.push({
      category: "money",
      kind: "remittance",
      dayIso: day,
      // §1-12: hand-overs live on the custody page — /money landed J on the
      // ledger reader with nothing about the batch he tapped.
      href: "/money/custody",
      amountCents: b.total_cents,
      actor: b.confirmed_by_hq ?? undefined,
      atIso: b.handed_over_at ?? undefined,
    });
  }

  for (const p of einvois.data ?? []) {
    const day = dayIsoMalaysia(p.generated_at);
    if (!day) continue;
    records.push({ category: "filings", kind: "einvois", dayIso: day, href: "/filings/eroses", atIso: p.generated_at });
  }

  type PastePackRow = {
    id: number;
    minutes_doc: { confirmed_at: string | null; meeting_date: string | null } | null;
  };
  for (const p of (pastePacks.data ?? []) as unknown as PastePackRow[]) {
    const day = p.minutes_doc?.confirmed_at
      ? dayIsoMalaysia(p.minutes_doc.confirmed_at)
      : (p.minutes_doc?.meeting_date ?? null);
    // TS-side month filter (this query could not be windowed on a join column)
    if (!day || day < firstIso || day > lastIso) continue;
    records.push({ category: "filings", kind: "paste_pack", dayIso: day, href: "/filings/eroses" });
  }

  for (const u of uploads.data ?? []) {
    const day = dayIsoMalaysia(u.uploaded_at);
    if (!day) continue;
    records.push({
      category: "uploads",
      kind: "upload",
      dayIso: day,
      href: "/inbox",
      detail: u.kind ?? undefined,
      atIso: u.uploaded_at,
    });
  }

  type ConstitutionRow = {
    id: number;
    upload: { uploaded_at: string } | null;
  };
  for (const c of (constitutions.data ?? []) as unknown as ConstitutionRow[]) {
    const day = c.upload?.uploaded_at ? dayIsoMalaysia(c.upload.uploaded_at) : null;
    // TS-side month filter (this query could not be windowed on a join column)
    if (!day || day < firstIso || day > lastIso) continue;
    records.push({ category: "constitution", kind: "constitution", dayIso: day, href: "/constitution" });
  }

  for (const q of qa.data ?? []) {
    const day = dayIsoMalaysia(q.created_at);
    if (!day) continue;
    records.push({ category: "qa", kind: "qa", dayIso: day, href: "/constitution" });
  }

  for (const d of dbDeadlines.data ?? []) {
    if (!d.due_date || d.status === "done") continue;
    records.push({ category: "deadline", kind: d.kind, dayIso: d.due_date, href: "/calendar" });
  }

  // One table, three categories, split by WHEN and by kind:
  //   already happened + kind 'agm' → `agm`          (history, links to the pack)
  //   already happened, any other   → `calendar`     (history)
  //   still to come                 → `event`        (future, /calendar only)
  for (const e of dbEvents.data ?? []) {
    const day = e.starts_at ? dayIsoMalaysia(e.starts_at) : null;
    if (!day) continue;
    const past = day <= todayIso;
    const category = past ? (e.kind === "agm" ? "agm" : "calendar") : "event";
    records.push({
      category,
      kind: category === "agm" ? "agm" : "event",
      dayIso: day,
      href: category === "agm" ? "/agm-pack" : "/calendar",
      detail: e.title,
    });
  }

  return records;
}
