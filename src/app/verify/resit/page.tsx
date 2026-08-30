import type { Metadata } from "next";
import { getSupabase } from "@/db/supabase";
import { verifyReceiptVerify } from "@/lib/receipt-verify";
import { dayIsoMalaysia } from "@/lib/history";
import { formatRm } from "@/lib/minutes-draft";

// ---------------------------------------------------------------------------
// PUBLIC RECEIPT VERIFY PAGE (work order 87 ① — 24號單建議② shipped).
//
// Reached ONLY by scanning the QR on a receipt PDF: the ?t= token is HMAC-
// signed, so there is deliberately NO "type a number" search — sequential,
// gap-free receipt numbers (Hard Rule 2) would make a lookup form a way to
// enumerate the whole receipts table. No token, no query.
//
// WHAT THE PAGE MAY SAY (24號原話: 做壞比不做更危險):
//   · "number N was issued through this system" + org name, date, amount —
//     ONLY facts already printed on the paper the scanner is holding.
//   · never the donor's name or phone (Hard Rule 5) — the query below never
//     selects those columns, and `purpose`/`item_desc` stay out too (free
//     text a treasurer may have typed a person's name into).
//   · never anything that reads like "MinitAI certifies this society is
//     genuine" — the disclaimer is on the page in all three languages.
//
// The page is public (src/proxy.ts PUBLIC_PATHS) and renders bare
// (shell.tsx BARE_ROUTES): a donor scanning a paper receipt has no account.
// It therefore uses the service-role client — scoped to the exact (org,
// number) pair named by a token only this system could have signed.
//
// Trilingual by stacking, not by Tri: the reader chose nothing yet, and a
// scanned page must be readable with zero interaction.
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Semak Resit / 收据查证 — MinitAI",
  robots: { index: false },
};

type VerifiedReceipt = {
  receiptNo: string;
  orgName: string;
  dateIso: string;
  /** null = in-kind receipt: the paper prints items, not money, so the page
   *  names the receipt type instead of echoing free text. */
  amountRm: string | null;
};

type LookupOutcome =
  | { state: "verified"; receipt: VerifiedReceipt }
  | { state: "not_issued" }
  | { state: "try_later" };

async function lookup(token: string | undefined): Promise<LookupOutcome> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!token || secret === "") return { state: "not_issued" };
  const claim = verifyReceiptVerify(token, secret);
  if (!claim) return { state: "not_issued" };

  // Service-role read, pinned to the signed (org, number) pair. 🔴 NEVER add
  // donor_name / donor_phone / purpose / item_desc / collector_name here.
  const supabase = getSupabase();
  const [receiptRes, orgRes] = await Promise.all([
    supabase
      .from("receipts")
      .select(
        "receipt_no, issued_at, donation:donations!receipts_donation_id_fkey (amount_cents, donated_at, kind)",
      )
      .eq("org_id", claim.orgId)
      .eq("receipt_no", claim.receiptNo)
      .maybeSingle(),
    supabase.from("orgs").select("name").eq("id", claim.orgId).maybeSingle(),
  ]);

  // A database hiccup is "try again later", never "this receipt is fake" —
  // calling a genuine receipt fake is the worst failure this page has.
  if (receiptRes.error || orgRes.error) return { state: "try_later" };

  const row = receiptRes.data as {
    receipt_no: string;
    issued_at: string;
    donation: {
      amount_cents: number;
      donated_at: string | null;
      kind?: string | null;
    } | null;
  } | null;
  const orgName = (orgRes.data?.name as string | undefined) ?? null;
  if (!row || !row.donation || !orgName) return { state: "not_issued" };

  const inKind = row.donation.kind === "in_kind";
  return {
    state: "verified",
    receipt: {
      receiptNo: row.receipt_no,
      orgName,
      // Same derivation the PDF prints (receipt-pdf route): donation date,
      // else the issue day — the page must repeat the paper, not improvise.
      dateIso: row.donation.donated_at ?? dayIsoMalaysia(row.issued_at) ?? "",
      amountRm: inKind ? null : formatRm(Number(row.donation.amount_cents)),
    },
  };
}

function TriBlock({
  bm,
  zh,
  en,
  className,
}: {
  bm: string;
  zh: string;
  en: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p>{bm}</p>
      <p>{zh}</p>
      <p>{en}</p>
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="mt-6 rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-100">
      <TriBlock
        bm="⚠️ Halaman ini hanya mengesahkan bahawa nombor resit itu dikeluarkan melalui sistem MinitAI. Ia TIDAK mengesahkan identiti, pendaftaran atau status persatuan itu."
        zh="⚠️ 本页只证明这个收据编号出自 MinitAI 系统，不证明该社团的身份、注册或任何资格。"
        en="⚠️ This page only confirms that the receipt number was issued through the MinitAI system. It does NOT confirm the society's identity, registration or status."
        className="space-y-1"
      />
    </div>
  );
}

function ReportLine() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  if (!email) return null;
  return (
    <div className="mt-6 text-sm leading-relaxed text-muted-foreground">
      <TriBlock
        bm={`Syak penyamaran? Laporkan kepada ${email}`}
        zh={`怀疑有人冒用？请举报：${email}`}
        en={`Suspect impersonation? Report it to ${email}`}
        className="space-y-1"
      />
    </div>
  );
}

export default async function VerifyResitPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const outcome = await lookup(typeof t === "string" ? t : undefined);

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">
        Semakan Resit / 收据查证 / Receipt check
      </h1>

      {outcome.state === "verified" && (
        <>
          <div className="mt-6 rounded-xl border border-border bg-card p-5">
            <p className="text-lg font-semibold">
              ✓ No. {outcome.receipt.receiptNo}
            </p>
            <TriBlock
              bm="Nombor resit ini memang dikeluarkan melalui sistem MinitAI, dengan butiran berikut:"
              zh="这个收据编号确实由 MinitAI 系统开出，内容如下："
              en="This receipt number was indeed issued through the MinitAI system, with these details:"
              className="mt-2 space-y-1 text-sm leading-relaxed text-muted-foreground"
            />
            <dl className="mt-4 space-y-2 text-base">
              <div>
                <dt className="text-xs text-muted-foreground">
                  Persatuan / 社团 / Society
                </dt>
                <dd className="font-medium">{outcome.receipt.orgName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Tarikh / 日期 / Date
                </dt>
                <dd className="font-medium">{outcome.receipt.dateIso}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Jumlah / 金额 / Amount
                </dt>
                <dd className="font-medium">
                  {outcome.receipt.amountRm ?? (
                    <span>
                      Derma barangan / 实物捐赠 / In-kind donation
                      <span className="block text-xs font-normal text-muted-foreground">
                        (resit jenis barangan tidak mencatat wang / 实物收据不记金额
                        / an in-kind receipt records no money)
                      </span>
                    </span>
                  )}
                </dd>
              </div>
            </dl>
            <TriBlock
              bm="Bandingkan butiran di atas dengan resit di tangan anda. Jika berbeza, resit itu mungkin dipalsukan."
              zh="请把上面的内容和您手上的收据对一对。如果不一样，这张收据可能是伪造的。"
              en="Compare the details above with the paper receipt in your hand. If they differ, that paper may be forged."
              className="mt-4 space-y-1 text-sm leading-relaxed text-muted-foreground"
            />
          </div>
          <Disclaimer />
          <ReportLine />
        </>
      )}

      {outcome.state === "not_issued" && (
        <>
          <div className="mt-6 rounded-xl border border-red-300/70 bg-red-50 p-5 text-red-900 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-100">
            <p className="text-lg font-semibold">✗</p>
            <TriBlock
              bm="Sistem ini TIDAK pernah mengeluarkan resit dengan kod imbasan ini. Sama ada kod QR rosak, atau resit itu bukan daripada sistem ini."
              zh="本系统没有开过这个编号的收据。可能是二维码损坏，也可能这张收据不是本系统开的。"
              en="This system has NOT issued a receipt matching this scan. Either the QR code is damaged, or the receipt did not come from this system."
              className="mt-2 space-y-1 text-sm leading-relaxed"
            />
          </div>
          <Disclaimer />
          <ReportLine />
        </>
      )}

      {outcome.state === "try_later" && (
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <TriBlock
            bm="Semakan tidak dapat dijalankan sekarang (masalah sambungan). Sila cuba imbas semula sebentar lagi — ini BUKAN bermakna resit itu palsu."
            zh="现在查不到（连线问题）。请稍后再扫一次——这不代表收据是假的。"
            en="The check cannot run right now (connection problem). Please scan again shortly — this does NOT mean the receipt is fake."
            className="space-y-1 text-sm leading-relaxed"
          />
        </div>
      )}
    </main>
  );
}
