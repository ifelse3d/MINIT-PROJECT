"use client";

import { useState } from "react";
import { Tri, useLocalizedError, useTriText } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VoiceButton } from "@/components/voice-input";
import { Req } from "@/components/required-mark";
import { parseRmToCents, type RegisterDonation } from "@/lib/receipts";
import { dayIsoMalaysia } from "@/lib/history";
import { PaymentMethodToggle, type PaymentMethod } from "./payment-method-toggle";
import { TemplateChips } from "./templates";
import { uploadTransferProof } from "./transfer-proof-actions";
import { AttachIcon } from "@/components/attach-icon";

// ---------------------------------------------------------------------------
// MANUAL INCOME ENTRY — the deliberate, clearly-labelled exception to the
// eROSES test. Minit is photo-first: income normally flows in from a ledger
// photo that the AI reads and the human confirms. But a one-off cash gift or
// a fee with no paper page still needs a home. This is that home — a short
// confirm-style form, NOT a general data-entry screen. Every row it creates
// is tagged source = "manual" so an auditor can always see it was hand-typed,
// never AI-read. Money parsing is deterministic (parseRmToCents, Hard Rule 2).
// ---------------------------------------------------------------------------

/** Income categories cover more than donations: fees, rental, grants, etc. */
const INCOME_CATEGORIES: { value: string; bm: string; zh: string; en: string }[] = [
  { value: "Derma", bm: "Derma", zh: "捐款", en: "Donation" },
  { value: "Yuran ahli", bm: "Yuran ahli", zh: "会员费", en: "Membership fee" },
  { value: "Sewa dewan", bm: "Sewa dewan", zh: "礼堂租金", en: "Hall rental" },
  { value: "Pendapatan acara", bm: "Pendapatan acara", zh: "活动收入", en: "Event income" },
  { value: "Geran", bm: "Geran", zh: "拨款", en: "Grant" },
  { value: "Faedah bank", bm: "Faedah bank", zh: "银行利息", en: "Bank interest" },
  { value: "Lain-lain", bm: "Lain-lain", zh: "其他", en: "Other" },
];

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring";

type Props = {
  /** Called with a fully-formed, confirmed register row to append. */
  onAdd: (donation: RegisterDonation) => void;
  /** Default collector name (usually the logged-in collector / treasurer). */
  defaultCollector: string;
  /**
   * D-2 (work order 27): photograph the fee slip / rental receipt instead of
   * typing — runs the existing ledger-reading pipeline with the CHOSEN income
   * type pre-filling any purpose the model reads nothing for. Resolves true
   * when the read landed in the step-1 review. Absent = no photo entrance.
   */
  onSlipPhoto?: (file: File, category: string) => Promise<boolean>;
  /** True while the AI is reading (shared with the ledger reader). */
  slipBusy?: boolean;
};

export function ManualIncomeForm({ onAdd, defaultCollector, onSlipPhoto, slipBusy }: Props) {
  const t = useTriText();
  const localizeError = useLocalizedError();
  const today = dayIsoMalaysia(new Date().toISOString())!;

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(INCOME_CATEGORIES[0].value);
  const [note, setNote] = useState("");
  const [payer, setPayer] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [collector, setCollector] = useState(defaultCollector);
  const [error, setError] = useState<string | null>(null);
  /** D-2: the slip photo was read and now waits in the step-1 review. */
  const [slipDone, setSlipDone] = useState(false);
  /** D19 (拍板 34): cash in a hand, or straight into the bank account. */
  const [method, setMethod] = useState<PaymentMethod>("cash");
  /** Transfer only, optional: the screenshot to attach (Storage, no AI). */
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setCategory(INCOME_CATEGORIES[0].value);
    setNote("");
    setPayer("");
    setPhone("");
    setAmount("");
    setDate(today);
    setCollector(defaultCollector);
    setMethod("cash");
    setProofFile(null);
    setError(null);
  }

  async function submit() {
    setError(null);
    const cents = parseRmToCents(amount);
    if (cents === null) {
      setError(t("Jumlah tidak sah.", "金额无效。", "Amount is not a valid RM value."));
      return;
    }
    if (cents === 0) {
      setError(t("Jumlah mesti lebih daripada sifar.", "金额必须大于零。", "Amount must be more than zero."));
      return;
    }
    if (!payer.trim()) {
      setError(t("Isi nama penderma / pembayar.", "请填写捐款人/付款人。", "Enter a donor / payer name."));
      return;
    }
    if (!date) {
      setError(t("Isi tarikh.", "请填写日期。", "Enter a date."));
      return;
    }
    // 拍板 0-3: the label carries a red star, so a blank must be said out
    // loud — not silently patched with the default name.
    if (!collector.trim()) {
      setError(t("Isi nama pemungut.", "请填写收款人。", "Enter the collector's name."));
      return;
    }
    // F-7 (work order 31, J's old #10): "Other" with no note is a register row
    // that says nothing — the auditor (and the treasurer in December) cannot
    // tell what the money was. One sentence is required.
    if (category === "Lain-lain" && !note.trim()) {
      setError(
        t(
          "Untuk “Lain-lain”, tulis satu ayat tentang pendapatan apa ini.",
          "选了「其他」，请在备注写一句这是什么收入。",
          "For “Other”, write one sentence saying what this income is.",
        ),
      );
      return;
    }
    const purpose = note.trim() ? `${category} — ${note.trim()}` : category;

    // D19: the optional transfer screenshot goes to Storage FIRST, so the
    // register row can carry its path. A failed upload stops here and says so
    // — the person can retry, or remove the file and record without it.
    let transferProofPath: string | null = null;
    if (method === "transfer" && proofFile) {
      setSaving(true);
      try {
        const form = new FormData();
        form.append("proof", proofFile);
        const result = await uploadTransferProof(form);
        if (!result.ok) {
          setError(
            t(
              "Gambar bukti pindahan tidak dapat dimuat naik. Cuba lagi — atau buang fail itu untuk merekod tanpa bukti.",
              "转账截图没能上传。请再试一次 —— 或者把文件移除，先记录（不带截图）。",
              "The transfer screenshot could not be uploaded. Try again — or remove the file to record without it.",
            ),
          );
          return;
        }
        transferProofPath = result.path;
      } finally {
        setSaving(false);
      }
    }

    onAdd({
      id: `man-${Date.now()}`,
      donorName: payer.trim(),
      donorPhone: phone.trim() || null,
      amountCents: cents,
      purpose,
      donatedAtIso: date,
      collector: collector.trim(),
      receiptNo: null,
      custodyStatus: "collected",
      source: "manual",
      paymentMethod: method,
      transferProofPath,
      // §1-11: when the row was RECORDED (donatedAtIso is when the money
      // changed hands — the two differ whenever entry happens later).
      createdAtIso: new Date().toISOString(),
    });
    reset();
    setOpen(false);
  }

  // B-9 (J #10): one page, one job. While closed, this whole card is a single
  // quiet line — the receipts page is for issuing receipts, and a seven-field
  // form must not compete with that.
  if (!open) {
    return (
      <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>
        ＋{" "}
        <Tri
          bm="Tambah pendapatan secara manual (tiada kertas)"
          zh="手动添加收入（没有纸张时用）"
          en="Add income manually (when there is no paper)"
        />
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          + <Tri bm="Tambah pendapatan secara manual" zh="手动添加收入" en="Add income manually" />
        </CardTitle>
        <CardDescription>
          {/* 2026-07-28 audit: CLAUDE.md's design law says effort must flow from
              AI to human. A seven-field form is the opposite, so it must be
              clearly the LAST resort, not a peer of the camera. The fields stay
              hidden until the user asks for them; this copy says what to do
              instead. */}
          {/* G-5 (2026-08-25, J #17): one sentence, not a paragraph — the
              three-line version was the heaviest block on an EMPTY page. The
              "manual" audit tag is still stated, just briefly. */}
          <Tri
            bm="Untuk derma yang tiada pada mana-mana kertas. Baris di sini ditanda “manual” untuk juruaudit."
            zh="给没有记在任何纸上的捐款用。这里的记录会标「手动」，审计看得到。"
            en="For a donation that is on no paper at all. Rows here are tagged “manual” for the auditor."
          />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {
          <div className="flex flex-col gap-4">
            {/* D-2: the photo path, FIRST — the eROSES law says the camera
                beats the form whenever there IS paper. The chosen income type
                rides along and pre-fills what the model reads no purpose for;
                the rows land in the step-1 review like any ledger page. */}
            {onSlipPhoto && (
              <div className="flex flex-col gap-2 rounded-md border-2 border-[color:var(--v2-outline-border)] bg-muted/20 p-3">
                <p className="text-sm text-muted-foreground">
                  <Tri
                    bm="Ada resit / slip di tangan? Pilih jenis di bawah, kemudian ambil gambar — MinitAI membacanya dan barisnya menunggu di langkah 1 untuk disemak."
                    zh="手上有单据？先在下面选好收入类型，再拍下来 —— MinitAI 读出来的行会等在第 1 步给您核对。"
                    en="Holding a slip or receipt? Pick the income type below, then photograph it — MinitAI reads it and the rows wait in step 1 for your check."
                  />
                </p>
                <label
                  className={`inline-flex w-fit cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground shadow hover:bg-primary/90 ${
                    slipBusy ? "pointer-events-none opacity-70" : ""
                  }`}
                >
                  {slipBusy ? (
                    <>⏳ <Tri bm="AI sedang membaca…" zh="AI 读取中…" en="AI is reading…" /></>
                  ) : (
                    <><AttachIcon /> <Tri bm="Ambil gambar slip (1 tindakan AI)" zh="拍单据（用 1 次 AI 额度）" en="Photograph the slip (1 AI action)" /></>
                  )}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    disabled={slipBusy}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      if (!file) return;
                      setSlipDone(false);
                      void onSlipPhoto(file, category).then(setSlipDone);
                    }}
                  />
                </label>
                {slipDone && (
                  <p className="rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-900 dark:bg-green-400/10 dark:text-green-100">
                    ✓{" "}
                    <Tri
                      bm="Dibaca. Semak barisnya di langkah 1 (Baca lejar), kemudian tambah ke daftar."
                      zh="读好了。请到第 1 步（读账页）核对那些行，确认后加进登记簿。"
                      en="Read. Check the rows in step 1 (Read the ledger), then add them to the register."
                    />
                  </p>
                )}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri bm="Jenis pendapatan" zh="收入类型" en="Income type" />
                </span>
                <select
                  className={inputClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {INCOME_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {t(c.bm, c.zh, c.en)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri bm="Jumlah (RM)" zh="金额 (RM)" en="Amount (RM)" />
                  <Req />
                </span>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  placeholder="50.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              {/* D19 (拍板 34): asked AT registration, not discovered later.
                  Cash goes on to custody ("in whose hands"); a transfer went
                  straight to the bank and never will. */}
              <div className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-base font-semibold">
                  <Tri
                    bm="Bagaimana wang ini diterima?"
                    zh="这笔钱是怎么收的？"
                    en="How did the money arrive?"
                  />
                </span>
                <PaymentMethodToggle value={method} onChange={setMethod} />
                {method === "cash" ? (
                  <span className="text-sm text-muted-foreground">
                    <Tri
                      bm="Tunai direkod sebagai “dalam tangan pemungut” sehingga diserahkan kepada HQ."
                      zh="现金会记成「在收款人手上」，直到交给总会。"
                      en="Cash is recorded as “in the collector's hands” until it is handed to HQ."
                    />
                  </span>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm text-muted-foreground">
                      <Tri
                        bm="Pindahan terus masuk akaun bank — ia tidak melalui simpanan tunai."
                        zh="转账直接进银行账户 —— 不经过现金保管。"
                        en="A transfer goes straight into the bank account — it never enters cash custody."
                      />
                    </span>
                    <label className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border-2 border-[color:var(--v2-outline-border)] px-3 py-1.5 font-medium hover:bg-accent">
                        📎{" "}
                        {proofFile ? (
                          <Tri bm="Tukar gambar bukti" zh="换一张截图" en="Change the screenshot" />
                        ) : (
                          <Tri
                            bm="Lampirkan gambar bukti pindahan"
                            zh="附上转账截图"
                            en="Attach the transfer screenshot"
                          />
                        )}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            setProofFile(e.target.files?.[0] ?? null);
                            e.target.value = "";
                          }}
                        />
                      </span>
                      {proofFile && (
                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                          <span className="max-w-48 truncate">{proofFile.name}</span>
                          <button
                            type="button"
                            className="underline underline-offset-4"
                            onClick={() => setProofFile(null)}
                          >
                            <Tri bm="Buang" zh="移除" en="Remove" />
                          </button>
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        <Tri
                          bm="Disimpan sahaja — tidak dibaca oleh AI, tidak guna kuota."
                          zh="只存档 —— 不经过 AI，不用 AI 额度。"
                          en="Stored only — no AI reads it, no AI quota used."
                        />
                      </span>
                    </label>
                  </div>
                )}
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri bm="Penderma / Pembayar" zh="捐款人 / 付款人" en="Donor / Payer" />
                  <Req />
                </span>
                <span className="flex items-center gap-1">
                  <input
                    className={inputClass}
                    value={payer}
                    onChange={(e) => setPayer(e.target.value)}
                  />
                  {/* C-4: speak the name instead of typing it. Renders
                      nothing where the browser has no speech support. */}
                  <VoiceButton
                    onText={(text) =>
                      setPayer((p) => (p.trim() ? `${p.trim()} ${text}` : text))
                    }
                  />
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri bm="Telefon" zh="电话" en="Phone" />
                </span>
                <input
                  className={inputClass}
                  placeholder="012-345 6789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri bm="Tarikh" zh="日期" en="Date" />
                  <Req />
                </span>
                <input
                  type="date"
                  className={inputClass}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri bm="Pemungut" zh="收款人" en="Collector" />
                  <Req />
                </span>
                <input
                  className={inputClass}
                  value={collector}
                  onChange={(e) => setCollector(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-base font-semibold">
                  {/* F-7 + 拍板 0-3: for "Other" the note is REQUIRED — the
                      red star appears the moment the category is picked, and
                      the sentence below says why. */}
                  <Tri bm="Catatan" zh="备注" en="Note" />
                  {category === "Lain-lain" && <Req />}
                </span>
                {category === "Lain-lain" && (
                  <span className="text-sm text-muted-foreground">
                    <Tri
                      bm="Tulis satu ayat tentang pendapatan apa ini — juruaudit perlu tahu."
                      zh="请写一句这是什么收入 —— 审计要看得懂。"
                      en="Write one sentence saying what this income is — the auditor needs to know."
                    />
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <input
                    className={inputClass}
                    placeholder={t("cth: tabung bumbung", "例：屋顶基金", "e.g. roof fund")}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  {/* C-4: speak the note instead of typing it. */}
                  <VoiceButton
                    onText={(text) =>
                      setNote((n) => (n.trim() ? `${n.trim()} ${text}` : text))
                    }
                  />
                </span>
              </label>
              {/* #5: the organisation's own wordings, one tap. Outside the
                  label so chip taps and the popup never yank focus around. */}
              <div className="sm:col-span-2">
                <TemplateChips
                  kind="income_purpose"
                  currentValue={note}
                  onPick={setNote}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-base text-red-900">
                {localizeError(error)}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void submit()}
                size="lg"
                className="text-base"
                disabled={saving}
              >
                {saving ? (
                  <Tri bm="Menyimpan…" zh="保存中…" en="Saving…" />
                ) : (
                  <Tri bm="Tambah ke daftar" zh="加入登记" en="Add to register" />
                )}
              </Button>
              <Button
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
                size="lg"
                variant="ghost"
                className="text-base"
              >
                <Tri bm="Batal" zh="取消" en="Cancel" />
              </Button>
            </div>
          </div>
        }
      </CardContent>
    </Card>
  );
}
