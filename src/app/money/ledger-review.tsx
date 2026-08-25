"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { ExtractionTable } from "@/components/extraction-table";
import { NextStepLink, PageSection } from "@/components/page-section";
import { PdpaNote } from "@/components/pdpa-note";
import { sampleLedgerExtraction } from "@/lib/sample-ledger";
import {
  eligibleForReceipt,
  findDuplicateDonations,
  parseRmToCents,
} from "@/lib/receipts";
import { formatRm } from "@/lib/minutes-draft";
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
    onLedgerPicked,
    showLedgerSample,
    ledgerBackToEmpty,
    mutateLedger,
    addConfirmedRowsToRegister,
    rowsReadyToAdd,
    donations,
  } = useRegister();

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
                onLedgerPicked(e.target.files?.[0] ?? null);
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
                  onLedgerPicked(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
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

        {/* 0-5: the paid-tier privacy notice beside the upload door. */}
        <PdpaNote />

        {/* Opt-in example, quiet and separate from the camera button. */}
        {noLedgerYet && !aiBusy && (
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
