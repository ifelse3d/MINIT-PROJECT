"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { ExtractionTable } from "@/components/extraction-table";
import { NextStepLink, PageSection } from "@/components/page-section";
import { PdpaNote } from "@/components/pdpa-note";
import { HowItWorksButton } from "@/app/how-it-works";
import { sampleLedgerExtraction } from "@/lib/sample-ledger";
import {
  eligibleForReceipt,
  findDuplicateDonations,
  ledgerPageFullyRecorded,
  parseRmToCents,
} from "@/lib/receipts";
import { formatRm } from "@/lib/minutes-draft";
import { handExpensePhoto } from "@/lib/expense-handoff";
import { PaymentMethodToggle } from "./payment-method-toggle";
import { TypeDonations } from "./type-donations";
import { useRegister } from "./register-store";

// ---------------------------------------------------------------------------
// /money — STEP 1: read a page of the donation ledger, then check what the AI
// read. Nothing here moves money; the only way out is "add the confirmed rows
// to the register", which is an explicit human tap.
//
// This was StepCard 1 of a 1734-line page, before the 2026-08-23 split.
// ---------------------------------------------------------------------------

export function LedgerReview() {
  const t = useTriText();
  const {
    ledger,
    ledgerSourceLabel,
    isSampleLedger,
    noLedgerYet,
    aiBusy,
    aiError,
    addedRows,
    ledgerPayments,
    setLedgerPayment,
    ledgerPages,
    onLedgerPicked,
    showLedgerSample,
    ledgerBackToEmpty,
    mutateLedger,
    addConfirmedRowsToRegister,
    rowsReadyToAdd,
    donations,
    addManualDonations,
    registerCollector,
  } = useRegister();
  const router = useRouter();

  /**
   * 0-1 (26 号报告 2-1): a photo taken while everything on screen is ALREADY
   * in the register. Appending a new page under rows that were already turned
   * into receipts is how one donation gets two serial numbers — so the file
   * waits here until the person answers "same ledger, or a new page?".
   */
  const [askWhichPage, setAskWhichPage] = useState<File | null>(null);
  /** B-5③: which uploaded page is open full-size (index into ledgerPages). */
  const [viewPage, setViewPage] = useState<number | null>(null);
  /**
   * B-5④: a freshly picked photo waits HERE until the person says whether the
   * page records INCOME or SPENDING. A tester photographed a shopping receipt
   * on this page and it became a "BUY MATERIAL" donation with a real receipt
   * number — the one question below is what prevents that.
   */
  const [askDirection, setAskDirection] = useState<File | null>(null);
  /** B-5①: the in-page typing grid (no more jump to another page). */
  const [typingOpen, setTypingOpen] = useState(false);
  const pageFullyRecorded =
    !isSampleLedger && ledgerPageFullyRecorded(ledger.rows, addedRows);
  // I-1 (26 号报告 §3-1): a review still in progress gets its own question —
  // "retake THIS page (replace)" vs "the NEXT page (append)". Before this,
  // retaking a blurry photo APPENDED every row twice, and confirming both
  // copies issued two serial receipts for one donation.
  const reviewInProgress =
    !isSampleLedger && ledgerSourceLabel !== null && ledger.rows.length > 0;
  /** B-5④: every picked file answers "income or spending?" first. */
  function pickLedgerFile(file: File | null) {
    if (!file) return;
    setAskDirection(file);
  }

  /** The person said INCOME — continue to the existing which-page routing. */
  function proceedAsIncome(file: File) {
    setAskDirection(null);
    if (pageFullyRecorded || reviewInProgress) {
      setAskWhichPage(file);
      return;
    }
    void onLedgerPicked(file);
  }

  const ledgerRows = ledger.rows;
  const duplicateGroups = useMemo(
    () =>
      findDuplicateDonations(
        // Rows whose amount the AI hasn't read yet get a UNIQUE negative value
        // so two blank rows are never falsely flagged as duplicates.
        ledgerRows.map((r, i) => ({
          donorName: r.donor_name.value,
          donatedAtIso: r.donated_at.value,
          amountCents: r.amount_cents.value ?? -(i + 1),
        }))
      ),
    [ledgerRows]
  );

  // --- Editing the extracted ledger rows (fix what the AI read wrong) -------
  // A human edit becomes the source of truth: confidence → confirmed. Money is
  // parsed by deterministic TS (parseRmToCents), never the AI (Hard Rule 2).
  const userSource = () => ({
    location: t("diisi oleh pengguna", "由用户填写", "entered by user"),
    snippet: t("disahkan oleh pengguna", "用户已确认", "confirmed by user"),
  });
  function confirmTextField(f: { confidence: "confirmed" | "check" | "missing" }) {
    f.confidence = "confirmed";
  }
  function editTextField(
    f: {
      value: string;
      confidence: "confirmed" | "check" | "missing";
      source_ref: { location: string; snippet: string } | null;
    },
    v: string
  ): void {
    f.value = v;
    f.confidence = v === "" ? "missing" : "confirmed";
    f.source_ref = v === "" ? null : f.source_ref ?? userSource();
  }

  return (
    <PageSection
      step={1}
      titleBm="Ambil gambar halaman lejar & semak"
      titleZh="拍下账页并核对"
      titleEn="Photo of the ledger page, then check it"
      summary={
        ledgerSourceLabel ? (
          <>📄 {ledgerSourceLabel}</>
        ) : (
          <Tri
            bm="Minit membaca setiap baris. Baris yang kabur perlu anda sahkan sebelum boleh dapat resit."
            zh="Minit 会把每一行读出来。写得模糊的行要您确认之后才能开收据。"
            en="Minit reads every line. Smudged lines need your confirmation before they can get a receipt."
          />
        )
      }
    >
      <div className="flex flex-col gap-4">
        {/* Upload / camera input — the AI ingestion path (same UX as /minutes) */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-4">
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground shadow hover:bg-primary/90 ${
              // pointer-events-none + opacity-60 meant nothing responded AND the
            // explanation of why was unreadable. The label itself says
            // "AI is reading…", so keep it at full strength.
            aiBusy ? "pointer-events-none" : ""
            }`}
          >
            {aiBusy ? (
              <>
                ⏳ <Tri bm="AI sedang membaca…" zh="AI 读取中…" en="AI is reading…" />
              </>
            ) : (
              <>
                📷 <Tri bm="Ambil gambar lejar" zh="拍账页照片" en="Take a photo of the ledger" />
              </>
            )}
            {/* THE CAMERA. `capture` and `accept="image/*"` belong together and
                nowhere else: on a phone `capture` opens the camera directly,
                which is the point — and which is also why a PDF could never be
                chosen through this input, whatever `accept` claimed. This one
                used to say "application/pdf" as well, so on a phone the label
                promised something the input cannot do. (2026-08-23.) */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={aiBusy}
              onChange={(e) => {
                pickLedgerFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>

          {/* THE FILE. No `capture`, so the file picker opens on every platform
              and a scanned ledger is reachable. J, 2026-08-22:
              「賬單如果捐錢人多的話會到很多」 — a long donation list arrives as a
              multi-page PDF, and the page limit for a ledger is 20. */}
          {!aiBusy && (
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-2 border-[color:var(--v2-border)] px-4 text-base font-medium hover:bg-accent">
              📄{" "}
              <Tri
                bm="Pilih fail (gambar atau PDF)"
                zh="选一个档案（照片或 PDF）"
                en="Choose a file (photo or PDF)"
              />
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  pickLedgerFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {/* G-1 (2026-08-25): typing is a first-class way in, beside the
              camera — same three doors as /minutes.
              B-5① (J #13): it no longer JUMPS to another page — the typing
              grid opens right here, and "add to register" follows naturally. */}
          {!aiBusy && (
            <button
              type="button"
              onClick={() => setTypingOpen((v) => !v)}
              // K-4: whitespace-nowrap — at 360px the label used to break
              // inside 「自己打字」. The button row is flex-wrap, so the
              // whole button wraps as a unit instead.
              className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md border-2 border-[color:var(--v2-border)] px-4 text-base font-medium hover:bg-accent"
            >
              ⌨️{" "}
              <Tri
                bm="Tiada kertas — taip sendiri"
                zh="没有纸张 —— 自己打字"
                en="No paper — type it in"
              />
            </button>
          )}
          <span className="text-sm text-muted-foreground">
            {ledgerSourceLabel ? (
              <>📄 {ledgerSourceLabel}</>
            ) : isSampleLedger ? (
              <Tri
                bm="Contoh dipaparkan di bawah"
                zh="下面显示的是示范内容"
                en="The example is shown below"
              />
            ) : (
              <Tri
                bm="Satu gambar satu halaman, atau satu PDF (paling banyak 20 muka surat)"
                zh="一张照片拍一页，或者一份 PDF（最多 20 页）"
                en="One photo per page, or one PDF (up to 20 pages)"
              />
            )}
          </span>
        </div>

        {/* B-5① (J #13): the typing grid, IN PLACE. Rows land in the register
            through the same store the receipts page reads. */}
        {typingOpen && !aiBusy && (
          <TypeDonations
            onAddMany={addManualDonations}
            defaultCollector={registerCollector}
            defaultOpen
          />
        )}

        {/* B-5④: income or spending? Asked BEFORE any AI action, so a
            shopping receipt can never become somebody's donation. */}
        {askDirection && !aiBusy && (
          <div className="flex flex-col gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 dark:bg-amber-400/10">
            <p className="text-base font-medium text-amber-900 dark:text-amber-100">
              <Tri
                bm="Sebelum dibaca: halaman ini merekod WANG MASUK atau WANG KELUAR?"
                zh="读取之前先确认：这一页记的是收入，还是开支？"
                en="Before it is read: does this page record money IN, or money OUT?"
              />
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                onClick={() => {
                  const file = askDirection;
                  if (file) proceedAsIncome(file);
                }}
              >
                💰{" "}
                <Tri
                  bm="Wang masuk (derma / kutipan) — baca"
                  zh="收入（捐款/收款）—— 读取"
                  en="Money in (donations / collections) — read it"
                />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  const file = askDirection;
                  setAskDirection(null);
                  if (file) handExpensePhoto(file);
                  // The photo travels along in memory; the expenses page
                  // offers to read it there (cost said on that button).
                  router.push("/money/expenses");
                }}
              >
                🧾{" "}
                <Tri
                  bm="Wang keluar (belian / bil) — ke halaman perbelanjaan"
                  zh="开支（买东西/付账）—— 去开支页"
                  en="Money out (purchases / bills) — to the expenses page"
                />
              </Button>
              <button
                type="button"
                className="text-base text-muted-foreground underline underline-offset-4"
                onClick={() => setAskDirection(null)}
              >
                <Tri bm="Batal" zh="先不要" en="Cancel" />
              </button>
            </div>
            <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
              <Tri
                bm="Kenapa ditanya: resit belian yang terbaca sebagai derma akan mendapat nombor resit rasmi — itu rekod yang salah."
                zh="为什么要问：购物单如果被当成捐款读进来，会拿到正式收据号码 —— 那是错的记录。"
                en="Why this is asked: a purchase receipt read in as a donation would get an official receipt number — a wrong record."
              />
            </p>
          </div>
        )}

        {/* 0-1 + I-1 (26 号报告 2-1 & §3-1): which ledger page is this photo?
            Two situations, one panel: everything already recorded (0-1) asks
            "new page or more of it"; a review mid-check (I-1) asks "retake
            (replace) or next page (append)". Same mechanics — replace is
            mode:"fresh", append is the ordinary merge. */}
        {askWhichPage && !aiBusy && (
          <div className="flex flex-col gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 dark:bg-amber-400/10">
            <p className="text-base font-medium text-amber-900 dark:text-amber-100">
              {/* B-5③: say it like a person would — the old wording assumed
                  the reader knew what "the review" was. */}
              {pageFullyRecorded ? (
                <Tri
                  bm="Semua baris di skrin sudah masuk buku daftar. Gambar baharu ini halaman lejar yang BAHARU, atau sambungan halaman tadi?"
                  zh="画面上的每一行都已经入了登记簿。这张新照片，是新的一页帐，还是刚才那页的后续？"
                  en="Every row on screen is already in the register. Is this new photo a NEW ledger page, or more of the one you just did?"
                />
              ) : (
                <Tri
                  bm="Anda masih ada satu halaman dalam semakan. Gambar baharu ini halaman SETERUSNYA lejar yang sama — atau anda mahu AMBIL SEMULA halaman tadi?"
                  zh="你还有一页在核对中。这张新照片，是同一本账的下一页，还是要重拍刚才那一页？"
                  en="You still have a page mid-check. Is this new photo the NEXT page of the same ledger — or a RETAKE of the one on screen?"
                />
              )}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                variant={pageFullyRecorded ? "default" : "outline"}
                onClick={() => {
                  const file = askWhichPage;
                  setAskWhichPage(null);
                  // Replace wholesale. The register keeps everything already
                  // recorded — nothing is lost.
                  void onLedgerPicked(file, "fresh");
                }}
              >
                {pageFullyRecorded ? (
                  <Tri
                    bm="Halaman BAHARU — mula semakan bersih"
                    zh="新的一页帐 —— 开新的核对"
                    en="A NEW page — start a clean review"
                  />
                ) : (
                  <Tri
                    bm="AMBIL SEMULA halaman ini — ganti bacaan di skrin"
                    zh="重拍这一页 —— 取代画面上的读取"
                    en="RETAKE this page — replace what is on screen"
                  />
                )}
              </Button>
              <Button
                variant={pageFullyRecorded ? "outline" : "default"}
                size="lg"
                onClick={() => {
                  const file = askWhichPage;
                  setAskWhichPage(null);
                  // The usual append. Rows already recorded keep their marks.
                  void onLedgerPicked(file);
                }}
              >
                {pageFullyRecorded ? (
                  <Tri
                    bm="Sambungan halaman YANG SAMA — tambah di bawah"
                    zh="同一页帐的后续 —— 接在下面"
                    en="More of the SAME page — append below"
                  />
                ) : (
                  <Tri
                    bm="Halaman SETERUSNYA — tambah di bawah"
                    zh="下一页 —— 接在下面"
                    en="The NEXT page — append below"
                  />
                )}
              </Button>
              <button
                type="button"
                className="text-base text-muted-foreground underline underline-offset-4"
                onClick={() => setAskWhichPage(null)}
              >
                <Tri bm="Batal" zh="先不要" en="Cancel" />
              </button>
            </div>
            <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
              <Tri
                bm="Derma yang sudah direkodkan kekal dalam buku daftar — pilihan ini hanya mengemas skrin semakan."
                zh="已经入登记簿的捐款不会受影响 —— 这里只决定核对画面怎么继续。"
                en="Donations already recorded stay in the register — this choice only decides how this review screen continues."
              />
            </p>
          </div>
        )}

        {/* B-5③ (J #14): every page already read into this review, as
            thumbnails — so a multi-page upload can be looked back at instead
            of trusting memory about what page 2 was. */}
        {ledgerPages.length > 0 && !isSampleLedger && (
          <div className="flex flex-wrap items-center gap-2">
            {ledgerPages.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setViewPage(i)}
                className="flex w-24 flex-col items-center gap-1 rounded-lg border border-[color:var(--v2-outline-border)] bg-white/60 p-1.5 hover:bg-accent dark:bg-white/5"
                title={p.name}
              >
                {p.dataUrl ? (
                  // A data: URL from the user's own device — next/image cannot
                  // optimise it and would only add wrapper cost.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.dataUrl}
                    alt={p.name}
                    className="h-16 w-full rounded object-cover"
                  />
                ) : (
                  <span className="flex h-16 w-full items-center justify-center rounded bg-muted text-2xl">
                    📄
                  </span>
                )}
                <span className="w-full truncate text-xs text-muted-foreground">
                  {t("muka", "第", "p.")} {i + 1} · {p.name}
                </span>
              </button>
            ))}
            <span className="text-sm text-muted-foreground">
              <Tri
                bm="Tekan untuk lihat semula"
                zh="点一下可以回看"
                en="Tap to look back at a page"
              />
            </span>
          </div>
        )}
        {viewPage !== null && ledgerPages[viewPage] && (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setViewPage(null)}
          >
            <p className="max-w-full truncate text-sm font-medium text-white">
              {ledgerPages[viewPage].name}
            </p>
            {ledgerPages[viewPage].dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ledgerPages[viewPage].dataUrl}
                alt={ledgerPages[viewPage].name}
                className="max-h-[80vh] max-w-full rounded-lg object-contain"
              />
            ) : (
              <p className="rounded-lg bg-white/90 p-6 text-base">
                <Tri
                  bm="Fail PDF — pratonton tidak tersedia di sini."
                  zh="这是 PDF 文件 —— 这里没有预览。"
                  en="A PDF file — no preview here."
                />
              </p>
            )}
            <Button size="lg" variant="secondary" onClick={() => setViewPage(null)}>
              <Tri bm="Tutup" zh="关闭" en="Close" />
            </Button>
          </div>
        )}

        {/* 0-5: the paid-tier privacy notice beside the upload door. */}
        <PdpaNote />

        {/* Opt-in example, quiet and separate from the camera button. */}
        {noLedgerYet && !aiBusy && (
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => showLedgerSample(sampleLedgerExtraction)}
              className="self-start text-base text-muted-foreground underline underline-offset-4"
            >
              <Tri
                bm="Belum ada lejar di tangan? Lihat contoh"
                zh="手上还没有账页？看一个示范"
                en="Ledger not to hand? See an example"
              />
            </button>
            {/* A-3: the walkthrough entry lives on the empty states too. */}
            <HowItWorksButton variant="link" />
          </div>
        )}
        {aiError && (
          <div className="rounded-md border border-red-300 bg-red-50 p-4 text-base text-red-900">
            {aiError}
          </div>
        )}
        {isSampleLedger && (
          /* Shown only to someone who asked for the example. A small grey
             badge was too quiet for what this has to say: adding these
             invented rows to the register and issuing receipts would burn real,
             permanent, gap-free receipt numbers. (2026-07-28 audit.) */
          <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 dark:bg-amber-400/10">
            <p className="min-w-56 flex-1 text-base font-medium text-amber-900 dark:text-amber-100">
            <Tri
              bm="Baris di bawah ialah CONTOH — bukan derma sebenar, dan hanya boleh dilihat. Ia tidak boleh disahkan, dimasukkan ke daftar atau diberi resit, supaya nombor resit sebenar tidak terbakar pada derma rekaan. Ambil gambar lejar anda sendiri dahulu."
              zh="下面这些是示范用的记录，不是真实捐款，只能看。示范记录不能确认、不能加进登记簿、也不能开收据——这样真实的收据号码才不会被虚构的捐款用掉。请先拍下您自己的账页。"
              en="The rows below are an EXAMPLE, not real donations — and they are view-only. They cannot be confirmed, added to the register or given receipts, so real receipt numbers are never spent on fictional donations. Take a photo of your own ledger page first."
            />
            </p>
            {/* Stage 0-1: the way OUT of the example is the biggest thing in
                the banner — for the person who tapped it by accident. */}
            <Button size="lg" className="text-base" onClick={ledgerBackToEmpty}>
              <Tri bm="Tutup contoh" zh="关掉示范" en="Close the example" />
            </Button>
          </div>
        )}
        {duplicateGroups.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-base text-amber-900">
            ⚠ <Tri bm="Kemungkinan CATATAN BERGANDA" zh="可能是重复记录" en="Possible duplicate entry" />:{" "}
            {duplicateGroups
              .map((g) => g.map((i) => `${t("baris", "第", "row")} ${i + 1}`).join(" & "))
              .join("; ")}{" "}
            — <Tri
              bm="penderma, tarikh dan jumlah yang sama"
              zh="捐款人、日期和金额相同"
              en="same donor, date and amount"
            />.
          </div>
        )}
        {/* Compact spreadsheet-style table — one ledger row per table row */}
        <ExtractionTable
          headers={[
            { bm: "Penderma", zh: "捐款人", en: "Donor" },
            { bm: "Jumlah", zh: "金额", en: "Amount" },
            { bm: "Tarikh", zh: "日期", en: "Date" },
            { bm: "Tujuan", zh: "用途", en: "Purpose" },
          ]}
          rows={ledgerRows.map((r, i) => {
            const worst = [r.donor_name, r.amount_cents, r.donated_at]
              .map((f) => f.confidence)
              .reduce(
                (acc, c) =>
                  acc === "missing" || c === "missing"
                    ? "missing"
                    : acc === "check" || c === "check"
                      ? "check"
                      : "confirmed",
                "confirmed" as "confirmed" | "check" | "missing"
              );
            // Stage 0-1: sample rows are READ-ONLY — no confirm, no edit. A
            // cell without handlers renders as plain text (extraction-table).
            const textCell = (
              field: "donor_name" | "donated_at" | "purpose",
              kind: "text" | "date"
            ) => ({
              display: r[field].value,
              editText: r[field].value,
              confidence: r[field].confidence,
              sourceRef: r[field].source_ref,
              kind,
              ...(isSampleLedger
                ? {}
                : {
                    onConfirm: () =>
                      mutateLedger((l) => confirmTextField(l.rows[i][field])),
                    onSave: (v: string) => {
                      mutateLedger((l) => editTextField(l.rows[i][field], v));
                      return null;
                    },
                  }),
            });
            return {
              status: worst,
              // D19 (拍板 34): every income row answers cash/transfer at
              // registration. The AI never decides this — default cash, one
              // tap to change. Hidden once the row is already in the register.
              extra:
                isSampleLedger || addedRows.has(i) ? undefined : (
                  <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Tri bm="Diterima sebagai" zh="收款方式" en="Received as" />
                    <PaymentMethodToggle
                      compact
                      value={ledgerPayments[i] ?? "cash"}
                      onChange={(m) => setLedgerPayment(i, m)}
                    />
                  </span>
                ),
              warning: isSampleLedger ? (
                // Every sample row says so itself — the banner above scrolls
                // away, the label on the row does not.
                <Tri bm="CONTOH — lihat sahaja" zh="示范 —— 只能看" en="SAMPLE — view only" />
              ) : !eligibleForReceipt(r) ? (
                <Tri
                  bm="Belum layak resit — sahkan dahulu"
                  zh="暂不能开收据 —— 请先确认"
                  en="Not ready for a receipt — confirm it first"
                />
              ) : undefined,
              cells: [
                textCell("donor_name", "text"),
                {
                  display: r.amount_cents.value !== null ? formatRm(r.amount_cents.value) : "",
                  editText:
                    r.amount_cents.value !== null
                      ? (r.amount_cents.value / 100).toFixed(2)
                      : "",
                  confidence: r.amount_cents.confidence,
                  sourceRef: r.amount_cents.source_ref,
                  kind: "amount" as const,
                  ...(isSampleLedger
                    ? {}
                    : {
                        onConfirm: () =>
                          mutateLedger((l) => confirmTextField(l.rows[i].amount_cents)),
                        onSave: (v: string) => {
                          const cents = parseRmToCents(v);
                          if (cents === null) {
                            return t(
                              "Jumlah tak sah — contoh: 50 atau 12.50",
                              "金额无效 — 例如 50 或 12.50",
                              "Invalid amount — e.g. 50 or 12.50"
                            );
                          }
                          mutateLedger((l) => {
                            const f = l.rows[i].amount_cents;
                            f.value = cents;
                            f.confidence = "confirmed";
                            f.source_ref = f.source_ref ?? userSource();
                          });
                          return null;
                        },
                      }),
                },
                textCell("donated_at", "date"),
                textCell("purpose", "text"),
              ],
            };
          })}
        />
        {/* Rows only reach the register after explicit human confirmation.
            Stage 0-1: while the SAMPLE is on screen there is no button at all —
            not a greyed-out one — because there is nothing legitimate it could
            ever do; the register-store and the server refuse sample rows too. */}
        {!isSampleLedger && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={addConfirmedRowsToRegister}
              disabled={
                ledger.rows.filter((r, i) => eligibleForReceipt(r) && !addedRows.has(i)).length === 0
              }
              size="lg"
              className="text-base"
            >
              ➕{" "}
              <Tri
                bm="Masukkan baris disahkan ke daftar"
                zh="把已确认的行加入登记"
                en="Add confirmed rows to register"
              />{" "}
              ({rowsReadyToAdd})
            </Button>
          </div>
        )}
      </div>

      {/* Where this page hands off to. Before the split these two steps shared
          one scroll, so "where did my rows go?" answered itself. Now it has to
          be said out loud. */}
      <NextStepLink
        href="/money/receipts"
        labelBm="Ke daftar derma & resit"
        labelZh="去捐款登记与收据"
        labelEn="On to the register and receipts"
        blockedReason={
          donations.length === 0 ? (
            <Tri
              bm="Belum ada derma dalam daftar. Sahkan baris di atas dan masukkannya dahulu — resit dibuat daripada daftar."
              zh="登记簿里还没有捐款。请先确认上面的行，把它们加进登记簿 —— 收据是根据登记簿开的。"
              en="Nothing in the register yet. Confirm the rows above and add them first — receipts are made from the register."
            />
          ) : undefined
        }
      />
    </PageSection>
  );
}
