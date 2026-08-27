"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { chooseReceiptPrefix } from "./actions";
import { DonationEditor } from "./donation-editor";
import { ManualIncomeForm } from "./manual-income";
import { TypeDonations } from "./type-donations";
import {
  CUSTODY_LABEL,
  CUSTODY_STYLE,
  TRANSFER_LABEL,
  TRANSFER_STYLE,
} from "./custody-labels";
import { useRegister } from "./register-store";

// ---------------------------------------------------------------------------
// /money/receipts — STEP 2: the register, and turning it into receipts.
//
// This is the page somebody actually opens most days, and before the
// 2026-08-23 split it was the MIDDLE of a 1734-line scroll: to issue one
// receipt you passed the ledger camera on the way in and the month-end tax
// pack on the way out. It now has its own address.
//
// Adding rows by hand lives here too, because a hand-typed gift and a
// photographed one are the same thing once they are in the register — the
// difference is only how they got in.
// ---------------------------------------------------------------------------

export function RegisterAndReceipts() {
  const t = useTriText();
  // G-1: the "type it in" door on step 1 lands here with ?taip=1 — the typing
  // grid opens ready instead of hiding behind its own button.
  const arrivedToType = useSearchParams().get("taip") === "1";
  const {
    donations,
    documentOrgName,
    taxStatus,
    registerCollector,
    receiptsIssued,
    cashInHandCents,
    unreceipted: unreceiptedCount,
    saveDonation,
    deleteDonation,
    clearUnreceiptedDrafts,
    addManualDonation,
    addManualDonations,
    issueReceipts,
    issueBusy,
    issueNotice,
    setIssueNotice,
    setError,
    onLedgerPicked,
    aiBusy,
  } = useRegister();

  const [editingId, setEditingId] = useState<string | null>(null);
  // D18 (拍板 35, 2026-08-27): names show IN FULL by default — the treasurer
  // typed them, and a record system must show whose record it is. "Hide
  // names" is for the moments the screen faces OUTWARD (print, share,
  // screenshot); never persisted.
  const [showNames, setShowNames] = useState(true);
  // B-4①: the receipt-letters dialog (issueNotice === "needs_prefix").
  const [prefixInput, setPrefixInput] = useState("");
  const [prefixBusy, setPrefixBusy] = useState(false);
  const [prefixError, setPrefixError] = useState<string | null>(null);
  // R-5 (2026-08-25): a temple event is forty rows. At ≥8 the card grid turns
  // into a compact LIST with search and batch selection — a register is a
  // ledger, not a photo album.
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** True while the irreversible "issue receipts" confirmation is showing. */
  const [confirmIssue, setConfirmIssue] = useState(false);
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
      step={2}
      titleBm="Daftar derma & jana resit"
      titleZh="捐款登记与开收据"
      titleEn="The register, and issuing receipts"
      summary={
        donations.length === 0 ? (
          <Tri
            bm="Kosong buat masa ini. Baris yang anda sahkan di langkah 1 akan masuk ke sini — atau taip terus di bawah."
            zh="现在还是空的。您在第 1 步确认的行会进到这里 —— 也可以直接在下面打字输入。"
            en="Empty for now. The rows you confirm in step 1 land here — or type them in below."
          />
        ) : (
          <Tri
            bm={`${donations.length} derma dalam daftar. Nombor resit dijana oleh kod, berurutan dan tidak boleh diulang.`}
            zh={`登记簿里有 ${donations.length} 笔捐款。收据号码由程序按顺序生成，不会重复。`}
            en={`${donations.length} donation(s) in the register. Receipt numbers are generated by code, in order, never reused.`}
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
        <div className="rounded-2xl border-2 border-[color:var(--v2-border)] bg-white/60 p-3 dark:bg-white/5">
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
          {/* Issuing receipts is IRREVERSIBLE: it locks every amount and
              burns a block of sequential numbers that can never be reused.
              So the button asks once before it fires. */}
          {!receiptsIssued && (
            <Button
              onClick={() => setConfirmIssue(true)}
              size="lg"
              className="text-base"
              disabled={issueBusy}
            >
              {issueBusy ? (
                <Tri bm="Menjana…" zh="生成中…" en="Issuing…" />
              ) : (
                <Tri bm="Jana resit berurutan" zh="生成正式收据" en="Issue receipts" />
              )}
            </Button>
          )}
          {/* B-4② (J #15): the second confirmation stays (numbers are legal
              and non-reusable) but is ONE clear dialog now, not a yellow box
              stacking buttons into the page. */}
          {!receiptsIssued && confirmIssue && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              role="dialog"
              aria-modal="true"
            >
              <div className="flex w-full max-w-md flex-col gap-3 rounded-2xl border bg-background p-5 shadow-xl">
                <p className="text-lg font-semibold">
                  <Tri
                    bm={`Jana resit untuk ${unreceiptedCount} derma?`}
                    zh={`要为 ${unreceiptedCount} 笔捐款生成收据吗？`}
                    en={`Issue receipts for ${unreceiptedCount} donation(s)?`}
                  />
                </p>
                <p className="text-base text-muted-foreground">
                  <Tri
                    bm="Setiap resit dapat nombor berurutan yang kekal. Selepas ini nombor tidak boleh dibatalkan atau diubah, dan jumlah wang dikunci untuk audit."
                    zh="每张收据会拿到一个永久的顺序编号。生成之后编号无法取消或修改，金额也会锁定以供审计。"
                    en="Each receipt gets a permanent sequential number. Afterwards the numbers cannot be cancelled or changed, and the amounts are locked for the audit trail."
                  />
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    size="lg"
                    variant="outline"
                    className="text-base"
                    disabled={issueBusy}
                    onClick={() => setConfirmIssue(false)}
                  >
                    <Tri bm="Batal" zh="取消" en="Cancel" />
                  </Button>
                  <Button
                    size="lg"
                    className="text-base"
                    disabled={issueBusy}
                    onClick={() => {
                      setConfirmIssue(false);
                      void issueReceipts();
                    }}
                  >
                    <Tri bm="Ya, jana resit" zh="是，生成收据" en="Yes, issue receipts" />
                  </Button>
                </div>
              </div>
            </div>
          )}
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
        {issueNotice === "saved" && (
          /* B-4④ (J #16): after the numbers land, say what happens NEXT —
             the tester issued a receipt and then stared at the page. */
          <div className="flex flex-col gap-1.5 rounded-xl border-2 border-green-400 bg-green-50 p-3 text-base text-green-900 dark:bg-green-400/10 dark:text-green-100">
            <p className="font-medium">
              ✓{" "}
              <Tri
                bm="Resit disimpan ke sejarah pertubuhan"
                zh="收据已保存到组织历史"
                en="Receipts saved to the organisation's history"
              />
            </p>
            <p className="text-sm">
              <Tri
                bm="Seterusnya: setiap kad di bawah ada butang “Muat turun resit” dan “Hantar WhatsApp” untuk penderma itu. Tunai yang diterima — pergi rekod simpanannya:"
                zh="下一步：下面每张卡片上都有「下载收据」和「用 WhatsApp 发送」按钮，可以发给捐款人。收的是现金的 —— 去记现金保管："
                en="Next: every card below has “Download receipt” and “Send on WhatsApp” for that donor. Cash you received — go record its custody:"
              />{" "}
              <Link href="/money/custody" className="font-medium underline underline-offset-4">
                <Tri bm="Rekod simpanan tunai" zh="现金保管记录" en="Cash custody record" /> →
              </Link>
            </p>
          </div>
        )}
        {issueNotice === "local" && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <Tri
              bm="Mod demo: nombor dijana setempat sahaja — TIDAK disimpan. Pilih pertubuhan di halaman Pertubuhan untuk menyimpan."
              zh="演示模式：编号仅在本机生成——未保存。请在组织页面选择组织以保存。"
              en="Demo mode: numbers issued locally only — NOT saved. Choose an organisation on the Organisations page to save."
            />
          </p>
        )}
        {issueNotice === "readonly" && (
          /* B-4: not only auditors any more — a collector or secretary who
             reaches this button gets the same refusal, naming who to ask. */
          <p className="rounded-xl border-2 border-slate-300 bg-slate-50 p-3 text-base font-medium text-slate-800 dark:bg-white/10 dark:text-slate-100">
            <Tri
              bm="Peranan anda tidak boleh menjana resit — itu tugas bendahari atau pentadbir. Minta mereka melakukannya."
              zh="您的角色不能开收据 —— 开收据是财政或管理员的事，请找他们处理。"
              en="Your role cannot issue receipts — that is the treasurer's or an administrator's job. Ask them to do it."
            />
          </p>
        )}
        {/* B-4① (J #12): the receipt-letters choice happens HERE, in one
            dialog — no more trip to Settings that testers never came back
            from. Explains what the letters ARE, takes the letters, done. */}
        {issueNotice === "needs_prefix" && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex w-full max-w-lg flex-col gap-3 rounded-2xl border bg-background p-5 shadow-xl">
              <p className="text-lg font-semibold">
                <Tri
                  bm="Sebelum resit pertama: pilih huruf resit anda"
                  zh="开第一张收据之前：先选收据字母"
                  en="Before the first receipt: choose your receipt letters"
                />
              </p>
              <p className="text-base text-muted-foreground">
                <Tri
                  bm="Huruf ini ialah PANGKAL nombor resit — contoh: huruf PSH memberi resit PSH-2026-0001. Setiap cawangan perlu huruf sendiri supaya resit menunjukkan siapa yang mengeluarkannya. Selepas resit pertama dikeluarkan, huruf itu dikunci dan tidak boleh diubah lagi."
                  zh="这组字母是收据编号的开头 —— 例如选 PSH，收据就是 PSH-2026-0001。每个分会要有自己的字母，收据才看得出是谁开的。开出第一张之后，字母就锁定，不能再改。"
                  en="These letters are the START of every receipt number — e.g. choosing PSH gives PSH-2026-0001. Each branch needs its own letters so a receipt shows who issued it. After the first receipt they are locked and cannot change."
                />
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri
                    bm="Huruf anda (2–8 huruf/angka)"
                    zh="您的字母（2–8 个字母或数字）"
                    en="Your letters (2–8 letters/digits)"
                  />
                </span>
                <input
                  value={prefixInput}
                  onChange={(e) => {
                    setPrefixInput(e.target.value.toUpperCase());
                    setPrefixError(null);
                  }}
                  placeholder="PSH"
                  maxLength={8}
                  className="w-40 rounded-md border border-input bg-background px-3 py-2 font-mono text-lg uppercase shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              {prefixInput && (
                <p className="text-sm text-muted-foreground">
                  <Tri bm="Contoh resit" zh="收据示例" en="Example receipt" />:{" "}
                  <span className="font-mono">
                    {prefixInput}-{new Date().getFullYear()}-0001
                  </span>
                </p>
              )}
              {prefixError && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                  {prefixError}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  size="lg"
                  variant="ghost"
                  className="text-base"
                  disabled={prefixBusy}
                  onClick={() => {
                    setIssueNotice(null);
                    setPrefixError(null);
                  }}
                >
                  <Tri bm="Nanti dahulu" zh="先不要" en="Not now" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="text-base"
                  disabled={issueBusy || prefixBusy}
                  onClick={() => void issueReceipts({ acceptDefaultPrefix: true })}
                >
                  <Tri bm="Guna 'MIN' sahaja" zh="就用 MIN 继续" en="Continue with 'MIN'" />
                </Button>
                <Button
                  size="lg"
                  className="text-base"
                  disabled={prefixBusy || prefixInput.trim() === ""}
                  onClick={() => {
                    void (async () => {
                      setPrefixBusy(true);
                      setPrefixError(null);
                      try {
                        const result = await chooseReceiptPrefix(prefixInput);
                        if (result.ok) {
                          setIssueNotice(null);
                          // The prefix is set — issue with the letters chosen.
                          await issueReceipts();
                          return;
                        }
                        setPrefixError(
                          result.reason === "invalid"
                            ? t(
                                "Huruf tidak sah — mula dengan huruf, 2 hingga 8 huruf/angka. Contoh: PSH, KLG2.",
                                "字母无效 —— 要以字母开头，共 2 到 8 个字母或数字。例如：PSH、KLG2。",
                                "Not valid — start with a letter, 2 to 8 letters/digits. Examples: PSH, KLG2.",
                              )
                            : result.reason === "not_admin"
                              ? t(
                                  "Hanya pentadbir pertubuhan boleh menetapkan huruf ini. Minta pentadbir membuatnya di Tetapan — atau teruskan dengan 'MIN'.",
                                  "只有机构管理员能设定这组字母。请管理员在设置里设定 —— 或者先用 MIN 继续。",
                                  "Only an organisation admin can set these letters. Ask an admin to set them in Settings — or continue with 'MIN'.",
                                )
                              : result.reason === "frozen"
                                ? t(
                                    "Resit sudah wujud, jadi huruf telah dikunci.",
                                    "已经开过收据，字母已锁定。",
                                    "Receipts already exist, so the letters are locked.",
                                  )
                                : t(
                                    "Tidak berjaya disimpan. Cuba lagi.",
                                    "没能保存，请再试一次。",
                                    "Could not be saved. Try again.",
                                  ),
                        );
                      } finally {
                        setPrefixBusy(false);
                      }
                    })();
                  }}
                >
                  {prefixBusy ? (
                    <Tri bm="Menyimpan…" zh="保存中…" en="Saving…" />
                  ) : (
                    <Tri
                      bm="Guna huruf ini & jana resit"
                      zh="用这组字母开收据"
                      en="Use these letters & issue"
                    />
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
        {issueNotice === "sample" && (
          <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
            <Tri
              bm="Ada baris CONTOH dalam daftar — resit tidak dijana dan tiada apa-apa disimpan. Nombor resit sebenar tidak boleh digunakan untuk derma rekaan. Padam baris contoh itu dahulu, kemudian cuba lagi."
              zh="登记簿里有示范用的记录——收据没有生成，也没有写入任何东西。真实的收据号码不能用在虚构的捐款上。请先删掉那些示范记录，再试一次。"
              en="The register contains SAMPLE rows — no receipts were issued and nothing was saved. Real receipt numbers cannot be spent on fictional donations. Delete the sample rows first, then try again."
            />
          </p>
        )}
        {issueNotice === "db_behind" && (
          <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
            <Tri
              bm="Daftar ini ada derma barangan, tetapi pangkalan data belum dikemas kini untuknya (migration 25). Tiada resit dijana dan tiada apa-apa hilang — baris menunggu dengan selamat. Minta pentadbir sistem jalankan migration itu, kemudian cuba lagi."
              zh="登记簿里有实物捐赠，但数据库还没更新到支持它（migration 25）。收据没有生成，东西也不会丢 —— 记录安全地等着。请系统管理员跑完那支 migration 再试一次。"
              en="The register contains an in-kind donation, but the database has not been updated for it yet (migration 25). No receipts were issued and nothing is lost — the rows wait safely. Ask whoever runs the system to apply that migration, then try again."
            />
          </p>
        )}
        {issueNotice === "error" && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {/* issue_receipts() is one DB transaction (2026-08-25): a failure
                writes nothing, so trying again is safe — say so instead of the
                old "we cannot tell what happened" alarm. */}
            <Tri
              bm="Resit tidak dijana — tiada apa-apa disimpan. Sila cuba sekali lagi. Jika masih gagal, semak “Sejarah resit”."
              zh="收据没有生成——什么都没有写入。请再试一次；若还是失败，请看「收据历史」。"
              en="The receipts were not issued — nothing was saved. Please try again; if it keeps failing, check “Receipt history”."
            />
          </p>
        )}
        {donations.length === 0 && (
          /* /money had NO empty state at all — it was permanently in demo
             mode with five fictional donors. (2026-07-28 audit.) */
          <div className="rounded-xl border-2 border-dashed p-5 text-base">
            <p className="font-semibold">
              <Tri
                bm="Daftar derma masih kosong."
                zh="捐款登记簿还是空的。"
                en="The donation register is empty."
              />
            </p>
            <p className="mt-1 text-muted-foreground">
              <Tri
                bm="Ambil gambar halaman lejar anda di langkah 1 di atas. AI akan membaca setiap baris, anda sahkan, dan baris yang disahkan masuk ke sini."
                zh="请在上面第 1 步拍下您的账页照片。AI 会逐行读出来，您确认之后，确认过的记录就会进到这里。"
                en="Take a photo of your ledger page in step 1 above. Minit reads each line, you check it, and the checked lines land here."
              />
            </p>
          </div>
        )}
        {/* R-5: the compact list for a big register (≥8 rows). */}
        {donations.length >= 8 && (
          <ListRegister
            donations={donations}
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
          {donations.map((d) => {
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
              <div key={d.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
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

        {/* Manual entry lives INSIDE the register step now, not as a fifth
            top-level card competing with the photo flow. It is the fallback for
            a donation that was never written on paper. */}
        {/* Two shapes of "there was no paper", because they are genuinely
            different jobs: ONE gift with a category and a note (rental, a
            grant, cash handed over) — and a COLLECTION, forty people at
            RM10 each, where the only thing that varies row to row is a name
            and an amount. J, 2026-08-22: 賬單如果捐錢人多的話會到很多. */}
        <TypeDonations
          onAddMany={addManualDonations}
          defaultCollector={registerCollector}
          defaultOpen={arrivedToType}
        />
        <ManualIncomeForm
          onAdd={addManualDonation}
          defaultCollector={registerCollector}
          // D-2: the slip-photo path reuses the ledger reader; the chosen
          // income type pre-fills empty purposes at "check" for the review.
          onSlipPhoto={(file, category) =>
            onLedgerPicked(file, "auto", { fillPurpose: category })
          }
          slipBusy={aiBusy}
        />
      </div>

      {/* B-3: custody is a RECORD page now, not step 3 — this link is the
          "what happens to the cash next" guidance, not a step in a chain. */}
      <NextStepLink
        href="/money/custody"
        labelBm="Ke rekod simpanan tunai"
        labelZh="去记现金保管"
        labelEn="On to the cash custody record"
        blockedReason={
          !receiptsIssued ? (
            <Tri
              bm="Jana resit dahulu — tunai hanya boleh diserahkan selepas setiap derma ada nombor resit, kalau tidak tiada apa-apa untuk diikat pada serahan itu."
              zh="请先开收据 —— 只有每笔捐款都有收据号码之后才能交接，否则交出去的钱没有凭据可以对。"
              en="Issue the receipts first — cash can only be handed over once every donation has a receipt number, otherwise there is nothing to tie the hand-over to."
            />
          ) : cashInHandCents === 0 ? (
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
          className="min-w-56 flex-1 rounded-xl border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-4 py-2.5 text-base outline-none focus:border-[color:var(--v2-primary)]"
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

      <div className="overflow-x-auto rounded-xl border border-[color:var(--v2-border)]">
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
