import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { SearchResults, type DbMinutesHit, type DbReceiptHit } from "./search-results";

// ---------------------------------------------------------------------------
// /search — keyword search over the org's STORED RECORDS (FIX 4). This is
// deterministic TypeScript substring matching, NOT a chatbot (Hard Rule 10);
// question-style queries belong to "Tanya Minit". DB sources are scoped by
// org_id (RLS + explicit filter); local sources are searched in the client
// component, exactly the same stores the pages themselves use.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  let dbReceipts: DbReceiptHit[] = [];
  let dbMinutes: DbMinutesHit[] = [];

  if (query) {
    const active = await getActiveOrg().catch(() => null);
    if (active) {
      const supabase = await getSupabaseServer();

      // Receipts: FULL donor name (D18 + §1-10, work order 32 — the record
      // system must show whose record it is; the treasurer could not find
      // "Lim" because the list said "L•••••"). Masking now belongs to the
      // moments data LEAVES the app (print/share/export), not to this list.
      const { data: receipts } = await supabase
        .from("receipts")
        .select(
          "id, receipt_no, donation:donations!receipts_donation_id_fkey (donor_name, donor_masked, amount_cents, purpose, donated_at)",
        )
        .eq("org_id", active.id)
        .limit(200);
      dbReceipts = ((receipts as unknown as {
        id: number;
        receipt_no: string;
        donation: {
          donor_name: string | null;
          donor_masked: string | null;
          amount_cents: number;
          purpose: string | null;
          donated_at: string | null;
        } | null;
      }[]) ?? [])
        .filter((r) => {
          const hay = [
            r.receipt_no,
            r.donation?.donor_name ?? "",
            r.donation?.donor_masked ?? "",
            r.donation?.purpose ?? "",
            r.donation?.donated_at ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(query.toLowerCase());
        })
        .slice(0, 20)
        .map((r) => ({
          id: r.id,
          receiptNo: r.receipt_no,
          donorName: r.donation?.donor_name ?? r.donation?.donor_masked ?? "—",
          amountCents: r.donation?.amount_cents ?? 0,
          purpose: r.donation?.purpose ?? "",
          dateIso: r.donation?.donated_at ?? "",
        }));

      const { data: docs } = await supabase
        .from("minutes_docs")
        .select("id, meeting_type, meeting_date, status")
        .eq("org_id", active.id)
        .order("id", { ascending: false })
        .limit(100);
      dbMinutes = ((docs as {
        id: number;
        meeting_type: string | null;
        meeting_date: string | null;
        status: string | null;
      }[]) ?? [])
        .filter((d) =>
          `${d.meeting_type ?? ""} ${d.meeting_date ?? ""} ${d.status ?? ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .slice(0, 20)
        .map((d) => ({
          id: d.id,
          meetingType: d.meeting_type ?? "",
          meetingDate: d.meeting_date ?? "",
          status: d.status ?? "",
        }));
    }
  }

  return <SearchResults query={query} dbReceipts={dbReceipts} dbMinutes={dbMinutes} />;
}
