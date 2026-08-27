import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { dayIsoMalaysia } from "@/lib/history";
import { ReceiptSeriesRows } from "../receipt-series-rows";
import { SettingsSection } from "../ui";

// /settings/receipts — the receipt letters (§7.2b).
export const dynamic = "force-dynamic";

/**
 * The org's receipt letters, and whether they are still changeable.
 * Two cheap reads rather than one join: the count is a HEAD request (no rows
 * come back, so no donor data crosses the wire — Hard Rule 5), and "has this
 * org ever issued a receipt" is exactly the condition freeze_receipt_series()
 * uses, so the UI and the trigger agree by construction.
 */
async function loadReceiptSeries(
  orgId: number,
): Promise<{ prefix: string; frozen: boolean } | null> {
  const supabase = await getSupabaseServer();
  const [{ data: org }, { count }] = await Promise.all([
    supabase.from("orgs").select("receipt_prefix").eq("id", orgId).maybeSingle(),
    supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
  ]);
  if (!org) return null;
  return { prefix: org.receipt_prefix as string, frozen: (count ?? 0) > 0 };
}

export default async function ReceiptSettingsPage() {
  const active = await getActiveOrg();
  const receiptSeries = active ? await loadReceiptSeries(active.id) : null;

  return (
    <div className="flex flex-col gap-6 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Tri bm="Nombor resit" zh="收据字号" en="Receipt numbers" />
      </h1>
      {!active || !receiptSeries ? (
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
      ) : (
        <SettingsSection title={<Tri bm="Siri resit" zh="收据序号" en="Receipt series" />}>
          <ReceiptSeriesRows
            orgId={active.id}
            prefix={receiptSeries.prefix}
            frozen={receiptSeries.frozen}
            year={Number(dayIsoMalaysia(new Date().toISOString())!.slice(0, 4))}
          />
        </SettingsSection>
      )}
    </div>
  );
}
