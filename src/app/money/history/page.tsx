import { CUSTODY_STATUS_LABEL, labelFor } from "@/lib/status-labels";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tri } from "@/components/language-provider";
import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { formatRm } from "@/lib/minutes-draft";

// /money/history — every receipt saved for the active org (Phase 7).
// PDPA (Hard Rule 5): this list shows ONLY the stored donor_masked value —
// full names stay on the receipt PDF itself, never in this list.
export const dynamic = "force-dynamic";

const CUSTODY_STYLE: Record<string, string> = {
  collected: "border-amber-300 bg-amber-100 text-amber-900",
  pending_remittance: "border-blue-300 bg-blue-100 text-blue-900",
  settled: "border-green-300 bg-green-100 text-green-800",
};

type ReceiptRow = {
  id: number;
  receipt_no: string;
  issued_at: string;
  donation: {
    donor_masked: string | null;
    amount_cents: number;
    purpose: string | null;
    donated_at: string | null;
    custody_status: string;
  } | null;
};

export default async function MoneyHistoryPage() {
  const active = await getActiveOrg();

  if (!active) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-10">
        <h1 className="mb-4 text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            <Tri bm="Sejarah Resit" zh="收据历史" en="Receipt History" />
          </span>
        </h1>
        <p className="text-muted-foreground">
          <Link href="/orgs" className="underline">
            <Tri
              bm="Pilih atau cipta pertubuhan dahulu"
              zh="请先选择或创建组织"
              en="Choose or create an organisation first"
            />
          </Link>
        </p>
      </div>
    );
  }

  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("receipts")
    .select(
      "id, receipt_no, issued_at, donation:donations!receipts_donation_id_fkey (donor_masked, amount_cents, purpose, donated_at, custody_status)",
    )
    .eq("org_id", active.id)
    .order("id", { ascending: false })
    .limit(200);

  const rows = (data as unknown as ReceiptRow[]) ?? [];
  // Money math in TypeScript (Hard Rule 2).
  const totalCents = rows.reduce(
    (sum, r) => sum + (r.donation?.amount_cents ?? 0),
    0,
  );

  return (
    <div className="mx-auto w-full max-w-4xl pb-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="v2-gradient-text">
              <Tri bm="Sejarah Resit" zh="收据历史" en="Receipt History" />
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {active.name} ·{" "}
            <Tri
              bm="Nama penderma disorok untuk melindungi privasi mereka"
              zh="为保护捐款人隐私，姓名已隐藏"
              en="Donor names are hidden to protect their privacy"
            />
          </p>
        </div>
        <Link href="/money" className="text-sm underline underline-offset-4">
          ← <Tri bm="Kembali ke Wang" zh="返回财务" en="Back to Money" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <Tri bm="Belum ada resit disimpan" zh="还没有保存的收据" en="No receipts saved yet" />
            </CardTitle>
            <CardDescription>
              <Tri
                bm="Jana resit di halaman Wang"
                zh="请在财务页面生成收据"
                en="Issue receipts on the Money page"
              />
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {rows.length} <Tri bm="resit" zh="张收据" en="receipts" /> ·{" "}
              <Tri bm="Jumlah" zh="总额" en="Total" /> {formatRm(totalCents)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Tri bm="No. Resit" zh="收据号" en="Receipt No." />
                  </TableHead>
                  <TableHead>
                    <Tri bm="Penderma" zh="捐款人" en="Donor" />
                  </TableHead>
                  <TableHead className="text-right">
                    <Tri bm="Jumlah" zh="金额" en="Amount" />
                  </TableHead>
                  <TableHead>
                    <Tri bm="Tujuan" zh="用途" en="Purpose" />
                  </TableHead>
                  <TableHead>
                    <Tri bm="Tarikh" zh="日期" en="Date" />
                  </TableHead>
                  <TableHead>
                    <Tri bm="Kustodi" zh="保管" en="Custody" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  // id anchor: the activity calendar deep-links to #receipt-N
                  <TableRow key={r.id} id={`receipt-${r.id}`} className="scroll-mt-24 target:bg-amber-50">
                    <TableCell className="font-mono">{r.receipt_no}</TableCell>
                    <TableCell>{r.donation?.donor_masked ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRm(r.donation?.amount_cents ?? 0)}
                    </TableCell>
                    <TableCell>{r.donation?.purpose ?? "—"}</TableCell>
                    <TableCell>{r.donation?.donated_at ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          CUSTODY_STYLE[r.donation?.custody_status ?? ""] ?? ""
                        }
                      >
                        {/* Was the raw enum "pending_remittance", untranslated,
                            while /money already had good trilingual wording. */}
                        <Tri
                          {...labelFor(
                            CUSTODY_STATUS_LABEL,
                            r.donation?.custody_status,
                          )}
                        />
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
