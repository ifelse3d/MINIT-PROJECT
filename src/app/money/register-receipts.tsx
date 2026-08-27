"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { NextStepLink, PageSection } from "@/components/page-section";
import {
  buildWaMeLink,
  receiptWhatsAppMessageBm,
  taxDeductibilityLineBm,
  type RegisterDonation,
} from "@/lib/receipts";
import { formatRm } from "@/lib/minutes-draft";
import { formatMytDateTime } from "@/lib/history";
import { maskName } from "@/lib/mask";
import { downloadFromApi } from "@/lib/download-file";
import { DonationEditor } from "./donation-editor";
import { IssueControls } from "./issue-controls";
import {
  CUSTODY_LABEL,
  CUSTODY_STYLE,
  TRANSFER_LABEL,
  TRANSFER_STYLE,
} from "./custody-labels";
import { useRegister } from "./register-store";

// ---------------------------------------------------------------------------
// /money/receipts — the RECEIPTS MANAGEMENT page (launch feedback #3,
// 2026-08-27 evening).
//
// The FLOW issues this round's receipts on /money/issue; this page is where
// the whole register can be looked after: see at a glance which rows have a
// receipt and which do not, filter, pick several and issue them, open one to
// check it, download or re-download its PDF, or WhatsApp it to the donor.
// Entry forms moved to step 1 (/money) — this page manages, it does not
// record.
// ---------------------------------------------------------------------------

/** #3: the "which rows?" lens. */
type ReceiptFilter = "all" | "without" | "with";

export function RegisterAndReceipts() {
  const t = useTriText();
  const {
    donations,
    documentOrgName,
    taxStatus,
    cashInHandCents,
    unreceipted: unreceiptedCount,
    saveDonation,
    deleteDonation,
    clearUnreceiptedDrafts,
    setError,
  } = useRegister();

  const [editingId, setEditingId] = useState<string | null>(null);
  // D18 (拍板 35, 2026-08-27): names show IN FULL by default — the treasurer
  // typed them, and a record system must show whose record it is. "Hide
  // names" is for the moments the screen faces OUTWARD (print, share,
  // screenshot); never persisted.
  const [showNames, setShowNames] = useState(true);
  // R-5 (2026-08-25): a temple event is forty rows. At ≥8 the card grid turns
  // into a compact LIST with search and batch selection — a register is a
  // ledger, not a photo album.
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // #3: 有哪一个开没开好收据 — one glance, one filter.
  const [filter, setFilter] = useState<ReceiptFilter>("all");

  const shown = donations.filter((d) =>
    filter === "all"
      ? true
      : filter === "without"
        ? d.receiptNo === null
        : d.receiptNo !== null,
  );
  const selectedUnreceipted = donations
    .filter((d) => selected.has(d.id) && d.receiptNo === null)
    .map((d) => d.id);
  /**
   * Which download is in flight.
   *
   * AUDIT FIX (2026-07-28): every file download had NO busy state and no button
   * disabling. Server-side PDF generation plus a network round-trip means
   * seconds of nothing happening after the tap, which reliably makes our users
   * tap again.
   */
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);

  async function downloadReceiptPdf(d: RegisterDonation) {
    if (!d.receiptNo) return;
    if (downloadBusy) return;
    setError(null);
    setDownloadBusy(`receipt:${d.id}`);
    try {
      await downloadFromApi(
        "/api/receipt-pdf",
        // ONLY the receipt number. Every printed fact — donor, amount, date,
        // purpose, org, tax status — is read back from the database on the
        // server (S0-1), so this device's copy of the row cannot change what
        // the official PDF says.
        { receiptNo: d.receiptNo },
        `resit-${d.receiptNo}.pdf`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloadBusy(null);
    }
  }

  return (
    <PageSection
      titleBm="Urus resit — daftar penuh"
      titleZh="收据管理 · 完整登记簿"
      titleEn="Manage receipts — the full register"
      summary={
        donations.length === 0 ? (
          <Tri
            bm="Kosong buat masa ini. Rekod wang masuk di halaman “Rekod wang masuk” — baris yang direkodkan muncul di sini."
            zh="现在还是空的。请到「记收入」记账 —— 记好的款项会出现在这里。"
            en="Empty for now. Record income on the “Record money in” page — recorded rows appear here."
          />
        ) : (
          <Tri
            bm={`${donations.length} derma dalam daftar — ${unreceiptedCount} belum ada resit. Lihat, pilih beberapa dan jana; buka satu untuk semak atau muat turun semula. Nombor dijana oleh kod, berurutan, tidak diulang.`}
            zh={`登记簿共 ${donations.length} 笔 —— 其中 ${unreceiptedCount} 笔还没开收据。可以筛选、选多笔一起开；也可以点开一笔核对、重新下载。号码由程序按顺序生成，不会重复。`}
            en={`${donations.length} donation(s) on the register — ${unreceiptedCount} without a receipt. Filter, pick several and issue; open one to check or re-download. Numbers are generated by code, in order, never reused.`}
          />
        )
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-base text-muted-foreground">
          <Tri
            bm="Nombor berurutan dijana oleh kod, bukan AI."
            zh="编号由程序生成，不是 AI。"
            en="Numbers generated by code, not the AI."
          />
        </p>
        {/* 2026-08-18: this used to be glued onto the end of the sentence
            above with a space. In Chinese that produced one run-on line whose
            second half was about a completely different subject AND in a
            language the reader had not chosen — it read like a mistake.
            The sentence itself is NOT translated on purpose: it is the exact
            legal wording printed on the receipt PDF (CLAUDE.md Hard Rule 3),
            and screen and paper must match word for word. So it now stands on
            its own, labelled as what it is, with the meaning said plainly
            underneath in the reader's language. */}
        <div className="rounded-md border-2 border-[color:var(--v2-border)] bg-white/60 p-3 dark:bg-white/5">
          <p className="text-sm font-medium text-muted-foreground">
            <Tri
              bm="Ayat ini dicetak pada setiap resit, tepat seperti di bawah:"
              zh="下面这一句会原样印在每一张收据上："
              en="This sentence is printed on every receipt, exactly as below:"
            />
          </p>
          {/* The org's REAL tax status, resolved on the server, so this line
              always matches what the generated PDF will say. */}
          <p className="mt-1 text-base font-medium">
            {taxDeductibilityLineBm(taxStatus)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {taxStatus === "s44_6" ? (
              <Tri
                bm="Maksudnya: penderma boleh menuntut pelepasan cukai dengan resit ini."
                zh="意思是：捐款人可以用这张收据申报扣税。"
                en="What it means: the donor can claim a tax deduction with this receipt."
              />
            ) : (
              <Tri
                bm="Maksudnya: penderma TIDAK boleh menuntut pelepasan cukai dengan resit ini."
                zh="意思是：捐款人不能用这张收据申报扣税。"
                en="What it means: the donor cannot claim a tax deduction with this receipt."
              />
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* One control for issuing — button, irreversibility confirm, the
              receipt-letters dialog and every outcome notice (shared with the
              round page, issue-controls.tsx). A selection narrows it to the
              ticked rows (#3: 可以選多). */}
          <IssueControls
            ids={selectedUnreceipted.length > 0 ? selectedUnreceipted : undefined}
            count={
              selectedUnreceipted.length > 0
                ? selectedUnreceipted.length
                : unreceiptedCount
            }
          />
          <Link href="/money/history" className="text-sm underline underline-offset-4">
            <Tri bm="Sejarah resit" zh="收据历史" en="Receipt history" /> →
          </Link>
          {/* D18 (拍板 35): full names show by default — the treasurer typed
              them. Hiding is for the moments the screen faces OUTWARD:
              printing, sharing, a screenshot over a shoulder. */}
          <Button variant="outline" size="sm" onClick={() => setShowNames((v) => !v)}>
            {showNames ? (
              <Tri
                bm="🙈 Sorok nama (untuk cetak/kongsi)"
                zh="隐藏姓名（打印/分享时用）"
                en="Hide names (for print/share)"
              />
            ) : (
              <Tri bm="👁 Tunjuk nama semula" zh="恢复显示姓名" en="Show names again" />
            )}
          </Button>
          {!showNames && (
            <span className="text-sm text-muted-foreground">
              <Tri
                bm="Nama disorok — selepas berkongsi, tekan sekali lagi untuk memaparkannya semula."
                zh="姓名已隐藏 —— 分享完再点一下就恢复。"
                en="Names hidden — after sharing, tap again to bring them back."
              />
            </span>
          )}
          {/* §1-4 (work order 32): "yesterday's test rows are still here" —
              one button clears every unreceipted draft. Rows with issued
              receipt numbers are untouchable, as everywhere. */}
          {unreceiptedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-700 hover:bg-red-50 hover:text-red-800 dark:hover:bg-red-400/10"
              onClick={() => {
                const ok = window.confirm(
                  t(
                    `Kosongkan ${unreceiptedCount} baris draf yang belum ada resit? Baris yang sudah ada nombor resit TIDAK disentuh. Tidak boleh dibatalkan.`,
                    `要清空这 ${unreceiptedCount} 笔还没开收据的草稿吗？已开收据的记录不会动。清了无法复原。`,
                    `Clear the ${unreceiptedCount} draft row(s) with no receipt yet? Rows with issued receipt numbers are NOT touched. This cannot be undone.`,
                  ),
                );
                if (ok) clearUnreceiptedDrafts();
              }}
            >
              🧹{" "}
              <Tri
                bm="Kosongkan draf"
                zh="清空这批草稿"
                en="Clear the drafts"
              />
            </Button>
          )}
        </div>
        {donations.length === 0 && (
          /* /money had NO empty state at all — it was permanently in demo
             mode with five fictional donors. (2026-07-28 audit.) */
          <div className="rounded-md border-2 border-dashed p-5 text-base">
            <p className="font-semibold">
              <Tri
                bm="Daftar derma masih kosong."
                zh="捐款登记簿还是空的。"
                en="The donation register is empty."
              />
            </p>
            <p className="mt-1 text-muted-foreground">
              <Tri
                bm="Rekod wang masuk di halaman “Rekod wang masuk” (gambar lejar, taip senarai, atau manual) — baris yang direkodkan muncul di sini."
                zh="请到「记收入」页记账（拍账页、打字名单、或手动加）—— 记好的款项会出现在这里。"
                en="Record income on the “Record money in” page (ledger photo, typed list, or manual) — recorded rows appear here."
              />
            </p>
          </div>
        )}
        {/* #3: which rows have a receipt, which do not — one glance. */}
        {donations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: "all" as const, bm: "Semua", zh: "全部", en: "All", n: donations.length },
                { key: "without" as const, bm: "Belum ada resit", zh: "还没开收据", en: "No receipt yet", n: unreceiptedCount },
                { key: "with" as const, bm: "Sudah ada resit", zh: "已开收据", en: "Receipt issued", n: donations.length - unreceiptedCount },
              ]
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`rounded-md border-2 px-3 py-1.5 text-sm font-medium ${
                  filter === f.key
                    ? "border-[color:var(--v2-primary)] bg-[color:var(--v2-primary-soft)] text-[color:var(--v2-primary)]"
                    : "border-[color:var(--v2-border)] text-muted-foreground hover:bg-accent"
                }`}
              >
                <Tri bm={f.bm} zh={f.zh} en={f.en} /> ({f.n})
              </button>
            ))}
          </div>
        )}
        {/* R-5: the compact list for a big register (≥8 rows). */}
        {donations.length >= 8 && (
          <ListRegister
            donations={shown}
            query={query}
            setQuery={setQuery}
            selected={selected}
            setSelected={setSelected}
            showNames={showNames}
            editingId={editingId}
            setEditingId={setEditingId}
            saveDonation={saveDonation}
            deleteDonation={deleteDonation}
            downloadReceiptPdf={downloadReceiptPdf}
            downloadBusy={downloadBusy}
            t={t}
          />
        )}

        {/* One card per donation — no sideways scroll (small registers only) */}
        <div className={donations.length >= 8 ? "hidden" : "grid gap-3 sm:grid-cols-2"}>
          {shown.map((d) => {
            const waLink = d.receiptNo
              ? buildWaMeLink(
                  d.donorPhone,
                  receiptWhatsAppMessageBm({
                    orgName: documentOrgName,
                    receiptNo: d.receiptNo,
                    donorName: d.donorName,
                    amountCents: d.amountCents,
                    dateIso: d.donatedAtIso,
                    purpose: d.purpose,
                    taxStatus,
                  })
                )
              : null;
            return (
              <div
                key={d.id}
                className={`rounded-sm border p-4 ${
                  selected.has(d.id) ? "border-[color:var(--v2-primary)]" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  {/* #3: pick several unreceipted rows, issue them together. */}
                  {d.receiptNo === null && (
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(d.id)) next.delete(d.id);
                          else next.add(d.id);
                          return next;
                        })
                      }
                      aria-label={t(
                        `Pilih ${d.donorName}`,
                        `选择 ${d.donorName}`,
                        `Select ${d.donorName}`,
                      )}
                      className="mt-1 h-5 w-5 shrink-0 accent-[color:var(--v2-primary)]"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {showNames ? d.donorName : maskName(d.donorName)}
                      {d.source === "manual" && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-slate-300 bg-slate-100 text-slate-700"
                        >
                          <Tri bm="manual" zh="手动" en="manual" />
                        </Badge>
                      )}
                      {d.kind === "in_kind" && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-teal-300 bg-teal-50 text-teal-800 dark:bg-teal-400/10 dark:text-teal-200"
                        >
                          <Tri bm="Barangan" zh="实物" en="In-kind" />
                        </Badge>
                      )}
                    </p>
                    <p className="font-mono text-sm text-muted-foreground">
                      {d.receiptNo ?? t("belum ada resit", "还没有收据", "no receipt yet")}
                    </p>
                  </div>
                  {/* D-1: goods rows show the goods, never RM0.00. The
                      estimate (if any) is labelled as an estimate. */}
                  {d.kind === "in_kind" ? (
                    <span className="text-right">
                      <span className="font-semibold">📦 {d.itemDesc || "—"}</span>
                      {d.estValueCents != null && (
                        <span className="block text-sm text-muted-foreground">
                          <Tri bm="anggaran" zh="估值" en="est." /> {formatRm(d.estValueCents)}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="font-semibold tabular-nums">{formatRm(d.amountCents)}</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {/* D19: a transfer is in the bank, not in a hand — it wears
                      its own badge, never a custody one. */}
                  {d.paymentMethod === "transfer" ? (
                    <Badge variant="outline" className={TRANSFER_STYLE}>
                      🏦 <Tri {...TRANSFER_LABEL} />
                    </Badge>
                  ) : (
                    <Badge variant="outline" className={CUSTODY_STYLE[d.custodyStatus]}>
                      <Tri {...CUSTODY_LABEL[d.custodyStatus]} />
                    </Badge>
                  )}
                  {d.transferProofPath && (
                    <span className="text-sm text-muted-foreground">
                      📎 <Tri bm="bukti dilampirkan" zh="已附截图" en="proof attached" />
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!d.receiptNo && editingId !== d.id && (
                    <Button variant="outline" onClick={() => setEditingId(d.id)}>
                      ✏️ <Tri bm="Ubah butiran" zh="修改资料" en="Edit details" />
                    </Button>
                  )}
                  {/* Only BEFORE a receipt exists. Once a number is issued the
                      row is part of a gap-free series and deleting it would put
                      a hole in the audit trail. */}
                  {!d.receiptNo && (
                    <Button
                      variant="outline"
                      className="text-red-700 hover:bg-red-50 hover:text-red-800 dark:hover:bg-red-400/10"
                      onClick={() => {
                        if (
                          !window.confirm(
                            t(
                              `Buang derma ini daripada daftar?

${maskName(d.donorName)} · ${formatRm(d.amountCents)}

Resit belum dijana, jadi tiada nombor yang hilang. Tidak boleh dibatalkan.`,
                              `要把这一笔从登记簿里删掉吗？

${maskName(d.donorName)} · ${formatRm(d.amountCents)}

还没开收据，所以不会有号码断掉。删了无法复原。`,
                              `Remove this donation from the register?

${maskName(d.donorName)} · ${formatRm(d.amountCents)}

No receipt has been issued, so no number is lost. This cannot be undone.`,
                            ),
                          )
                        ) {
                          return;
                        }
                        deleteDonation(d.id);
                      }}
                    >
                      🗑 <Tri bm="Buang baris ini" zh="删掉这一笔" en="Remove this row" />
                    </Button>
                  )}
                  {d.receiptNo && (
                    <Button
                      variant="outline"
                      onClick={() => downloadReceiptPdf(d)}
                      disabled={downloadBusy !== null}
                    >
                      {downloadBusy === `receipt:${d.id}` ? (
                        <Tri bm="Menyiapkan…" zh="正在准备…" en="Preparing…" />
                      ) : (
                        <>
                          <Download className="h-5 w-5" strokeWidth={2} />
                          <Tri bm="Muat turun resit" zh="下载收据" en="Download receipt" />
                        </>
                      )}
                    </Button>
                  )}
                  {waLink ? (
                    <Button variant="outline" asChild>
                      <a href={waLink} target="_blank" rel="noopener noreferrer">
                        📱 <Tri bm="Hantar WhatsApp" zh="用 WhatsApp 发送" en="Send on WhatsApp" />
                      </a>
                    </Button>
                  ) : (
                    d.receiptNo && (
                      <span className="self-center text-base text-muted-foreground">
                        {t(
                          "Tiada nombor telefon — tekan “Ubah butiran” untuk menambahnya, kemudian hantar melalui WhatsApp.",
                          "没有电话号码 —— 按「修改资料」补上，就可以用 WhatsApp 发送。",
                          "No phone number — tap “Edit details” to add one, then you can send it on WhatsApp.",
                        )}
                      </span>
                    )
                  )}
                </div>
                {editingId === d.id && (
                  <DonationEditor
                    donation={d}
                    onSave={saveDonation}
                    onCancel={() => setEditingId(null)}
                  />
                )}
                {d.receiptNo && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    🔒{" "}
                    <Tri
                      bm="Dikunci untuk audit"
                      zh="已锁定以供审计"
                      en="Locked for the audit trail"
                    />
                  </p>
                )}
              </div>
            );
          })}
        </div>

      </div>

      {/* #4 (launch feedback): the receipt is NOT a precondition for handing
          cash over any more — money moves first, the receipt follows. This
          link only waits for there to be cash at all. */}
      <NextStepLink
        href="/money/custody"
        labelBm="Ke rekod simpanan tunai"
        labelZh="去记现金保管"
        labelEn="On to the cash custody record"
        blockedReason={
          cashInHandCents === 0 ? (
            <Tri
              bm="Tiada tunai yang tertunggak — pindahan bank tidak melalui simpanan tunai. Hujung bulan, muat turun fail cukai."
              zh="没有还没交的现金 —— 转账不经过现金保管。到月底再下载税务文件就好。"
              en="No cash outstanding — bank transfers never enter cash custody. At month end, download the tax file."
            />
          ) : undefined
        }
      />
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// R-5 (2026-08-25): the LIST view for a big register. J: "登記簿 ≥8 筆改列表
// ＋搜索＋批次". Search matches the donor name, receipt number, purpose and
// date; batch selection covers UNRECEIPTED rows only — a row with an issued
// number is part of a gap-free series and cannot be deleted anywhere.
// ---------------------------------------------------------------------------
function ListRegister({
  donations,
  query,
  setQuery,
  selected,
  setSelected,
  showNames,
  editingId,
  setEditingId,
  saveDonation,
  deleteDonation,
  downloadReceiptPdf,
  downloadBusy,
  t,
}: {
  donations: RegisterDonation[];
  query: string;
  setQuery: (q: string) => void;
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  showNames: boolean;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  saveDonation: (d: RegisterDonation) => void;
  deleteDonation: (id: string) => void;
  downloadReceiptPdf: (d: RegisterDonation) => void;
  downloadBusy: string | null;
  t: (bm: string, zh: string, en: string, sep?: string) => string;
}) {
  const q = query.trim().toLowerCase();
  const filtered =
    q === ""
      ? donations
      : donations.filter((d) =>
          [d.donorName, d.receiptNo ?? "", d.purpose, d.donatedAtIso]
            .join(" ")
            .toLowerCase()
            .includes(q),
        );
  const selectable = filtered.filter((d) => d.receiptNo === null);
  const allSelected =
    selectable.length > 0 && selectable.every((d) => selected.has(d.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function deleteSelected() {
    const doomed = donations.filter(
      (d) => selected.has(d.id) && d.receiptNo === null,
    );
    if (doomed.length === 0) return;
    const ok = window.confirm(
      t(
        `Buang ${doomed.length} baris daripada daftar? Resit belum dijana untuk baris ini, jadi tiada nombor yang hilang. Tidak boleh dibatalkan.`,
        `要把选中的 ${doomed.length} 行从登记簿里删掉吗？这些行还没开收据，不会有号码断掉。删了无法复原。`,
        `Remove ${doomed.length} row(s) from the register? No receipts have been issued for them, so no numbers are lost. This cannot be undone.`,
      ),
    );
    if (!ok) return;
    for (const d of doomed) deleteDonation(d.id);
    setSelected(new Set());
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(
            "Cari nama, nombor resit, tarikh…",
            "搜索姓名、收据号码、日期……",
            "Search name, receipt number, date…",
          )}
          className="min-w-56 flex-1 rounded-md border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-4 py-2.5 text-base outline-none focus:border-[color:var(--v2-primary)]"
        />
        <span className="text-sm text-muted-foreground">
          {filtered.length} / {donations.length}
        </span>
        {selected.size > 0 && (
          <Button
            variant="outline"
            className="text-red-700 hover:bg-red-50 hover:text-red-800 dark:hover:bg-red-400/10"
            onClick={deleteSelected}
          >
            🗑{" "}
            <Tri
              bm={`Buang ${selected.size} baris dipilih`}
              zh={`删除所选 ${selected.size} 行`}
              en={`Remove ${selected.size} selected`}
            />
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-[color:var(--v2-border)]">
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-[color:var(--v2-border)] text-left text-sm text-muted-foreground">
              <th className="w-10 px-3 py-2">
                {selectable.length > 0 && (
                  <input
                    type="checkbox"
                    aria-label={t("Pilih semua", "全选", "Select all")}
                    checked={allSelected}
                    onChange={() =>
                      setSelected(
                        allSelected
                          ? new Set()
                          : new Set(selectable.map((d) => d.id)),
                      )
                    }
                    className="h-4 w-4 accent-[color:var(--v2-primary)]"
                  />
                )}
              </th>
              <th className="px-3 py-2"><Tri bm="Penderma" zh="捐款人" en="Donor" /></th>
              <th className="px-3 py-2"><Tri bm="Resit" zh="收据" en="Receipt" /></th>
              <th className="px-3 py-2"><Tri bm="Tarikh" zh="日期" en="Date" /></th>
              <th className="px-3 py-2 text-right"><Tri bm="Jumlah" zh="金额" en="Amount" /></th>
              <th className="px-3 py-2"><Tri bm="Status" zh="状态" en="Status" /></th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <Fragment key={d.id}>
                <tr className="border-b border-[color:var(--v2-border)] last:border-b-0">
                  <td className="px-3 py-2">
                    {d.receiptNo === null && (
                      <input
                        type="checkbox"
                        checked={selected.has(d.id)}
                        onChange={() => toggle(d.id)}
                        className="h-4 w-4 accent-[color:var(--v2-primary)]"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {showNames ? d.donorName : maskName(d.donorName)}
                  </td>
                  <td className="px-3 py-2 font-mono text-sm text-muted-foreground">
                    {d.receiptNo ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-sm tabular-nums">
                    {d.donatedAtIso}
                    {/* §1-11 (拍板 0-5): when the row was RECORDED — distinct
                        from the donation date. Absent on old rows. */}
                    {d.createdAtIso && (
                      <span className="block text-xs text-muted-foreground">
                        <Tri bm="direkod" zh="记录于" en="recorded" />{" "}
                        {formatMytDateTime(d.createdAtIso)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {/* D-1: goods rows show the goods, never RM0.00. */}
                    {d.kind === "in_kind" ? (
                      <span className="font-medium">📦 {d.itemDesc || "—"}</span>
                    ) : (
                      formatRm(d.amountCents)
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {/* D19: transfers wear their own badge, never a custody one. */}
                    {d.paymentMethod === "transfer" ? (
                      <Badge variant="outline" className={TRANSFER_STYLE}>
                        🏦 <Tri {...TRANSFER_LABEL} />
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={CUSTODY_STYLE[d.custodyStatus]}>
                        <Tri {...CUSTODY_LABEL[d.custodyStatus]} />
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      {d.receiptNo === null && editingId !== d.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(d.id)}
                        >
                          ✏️
                        </Button>
                      )}
                      {d.receiptNo && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadReceiptPdf(d)}
                          disabled={downloadBusy !== null}
                          title={t("Muat turun resit", "下载收据", "Download receipt")}
                        >
                          <Download className="h-4 w-4" strokeWidth={2} />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {editingId === d.id && (
                  <tr>
                    <td colSpan={7} className="px-3 pb-3">
                      <DonationEditor
                        donation={d}
                        onSave={saveDonation}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  <Tri
                    bm="Tiada baris sepadan dengan carian itu."
                    zh="没有符合搜索的记录。"
                    en="No rows match that search."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
