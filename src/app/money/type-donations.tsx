"use client";

import { useEffect, useMemo, useState } from "react";
import { Tri, useLocalizedError, useTriText } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { ConfirmedAction } from "@/components/confirm-delete";
import { VoiceButton } from "@/components/voice-input";
import { Req } from "@/components/required-mark";
import { parseRmToCents, type RegisterDonation } from "@/lib/receipts";
import { dayIsoMalaysia } from "@/lib/history";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useScopedKey } from "@/lib/storage-scope";
import { INCOME_CATEGORIES, incomeCategoryFromPurpose } from "@/lib/money-categories";
import {
  isTooLargeToUpload,
  shrinkPhotoForUpload,
  tooLargeToUploadMessage,
} from "@/lib/shrink-photo";
import { AttachIcon, ChooseFileLabel, UsesOneAiAction } from "@/components/attach-icon";
import { PaymentMethodToggle } from "./payment-method-toggle";
import { TemplateChips, useTemplates } from "./templates";
import { uploadTransferProof } from "./transfer-proof-actions";

// ---------------------------------------------------------------------------
// TYPE A WHOLE COLLECTION IN ONE GO (2026-08-22)
//
// J: 「那些收捐款要記錄的可能可以有一個 PAGE 專門讓他們 TYPE，做好後再一次過發
//     RECEIPT，類似這樣的功能，可以方便很多」— and the reason, from the same
// message: 「賬單如果捐錢人多的話會到很多，因爲可能有些出小筆都有可能」.
//
// WHY THIS IS NOT A VIOLATION OF THE eROSES DESIGN LAW
// CLAUDE.md says effort must flow from AI to human, and a data-entry form is
// normally the wrong answer. It is the right answer here, and the difference is
// worth stating so nobody "fixes" this later:
//
//   * The photo path already exists and stays first. This is for the case where
//     THERE IS NO PAPER — a festival table where forty people hand over RM10
//     and nobody wrote a ledger page at all. Photographing nothing is not an
//     option, and the existing manual form asks for seven fields, opens a card,
//     and closes again after ONE row. Forty donations through that form is
//     forty open-close cycles.
//   * The confirmation is still one action for the whole batch: type, look at
//     the total, add them all, issue every receipt at once.
//
// SHAPE: a spreadsheet, deliberately. Name, amount, purpose, date, and a
// keyboard that goes where a person's hands already expect — Enter at the end
// of a row starts the next one, and there is always one blank row waiting.
//
// Money is parsed by parseRmToCents and the total is summed in TypeScript
// (Hard Rule 2). Nothing here is sent to a model.
//
// Every row is tagged source: "manual", so an auditor can always see which
// rows had no original page.
//
// D1-1 (work order 56, 拍板 8): THIS GRID IS NOW THE ONLY TYPED-INCOME DOOR.
// The old single-row "Add income manually" card (manual-income.tsx) asked
// seven fields to record one gift and closed again; forty gifts were forty
// open-close cycles, and the two doors drifted (only the card had income
// types and transfer proofs). The card's unique pieces moved HERE:
//   * an income TYPE per row (the categories now live in
//     src/lib/money-categories.ts, mapped to eROSES Penyata Kewangan cells);
//   * a transfer-proof attachment per transfer row (Storage only, no AI —
//     proofs are NOT part of the auto-saved draft: a File cannot live in
//     localStorage, so an attached screenshot lasts until the page closes
//     and the row says so);
//   * the slip-photo entrance (pick the type, photograph the fee slip, the
//     ledger reader pre-fills that type as the purpose).
// ---------------------------------------------------------------------------

type Draft = {
  key: number;
  name: string;
  phone: string;
  amount: string;
  purpose: string;
  date: string;
  /** D-1 (拍板③): this row is goods (Derma Barangan), not money. */
  inKind: boolean;
  /** In-kind only: what was donated — REQUIRED (it goes on the receipt). */
  item: string;
  /** In-kind only, OPTIONAL: estimated value (RM string; ledger only). */
  estValue: string;
  /** D19 (拍板 34): cash in a hand, or straight into the bank. Older saved
   *  drafts have no value — treated as cash. */
  method?: "cash" | "transfer";
  /** D1-1: income type (a value from INCOME_CATEGORIES). Older saved drafts
   *  have no value — treated as Derma, which is what they always were. */
  category?: string;
};

/** Shape guard for a draft read back out of localStorage (B-5②): a wrong-
 *  shaped blob must fall back to a fresh grid, never crash the typing.
 *  Exported for the D1-1 migration test: a draft saved BEFORE the merge
 *  (rows without `category`) must still pass — forty typed rows must never
 *  be thrown away by an upgrade. */
export function isDraftArray(parsed: unknown): boolean {
  if (!Array.isArray(parsed)) return false;
  return parsed.every((r) => {
    if (typeof r !== "object" || r === null) return false;
    const d = r as Record<string, unknown>;
    return (
      typeof d.key === "number" &&
      typeof d.name === "string" &&
      typeof d.amount === "string" &&
      typeof d.purpose === "string" &&
      typeof d.date === "string" &&
      typeof d.inKind === "boolean"
    );
  });
}

/** What a row is missing, or null when it is ready. Never blocks typing — a
 *  half-typed row is normal; it only decides what "add them all" takes. */
function problemWith(row: Draft): "empty" | "name" | "amount" | "item" | "estValue" | "note" | null {
  const blank =
    !row.name.trim() &&
    !row.amount.trim() &&
    !row.phone.trim() &&
    !(row.inKind && row.item.trim());
  if (blank) return "empty";
  if (!row.name.trim()) return "name";
  // F-7 (kept from the single-row form): an "Other" income with no note is a
  // register row that says nothing — the auditor cannot tell what it was.
  if (!row.inKind && row.category === "Lain-lain" && !row.purpose.trim()) return "note";
  if (row.inKind) {
    // Goods: the item is what the receipt prints, so it is the required half;
    // the estimate is optional but must parse when present (Hard Rule 2 —
    // deterministic parsing, no guessing).
    if (!row.item.trim()) return "item";
    if (row.estValue.trim() !== "") {
      const est = parseRmToCents(row.estValue);
      if (est === null || est < 0) return "estValue";
    }
    return null;
  }
  const cents = parseRmToCents(row.amount);
  if (cents === null || cents <= 0) return "amount";
  return null;
}

/**
 * Row identity, and only that: React needs a stable key so a row does not lose
 * focus when the list changes shape. A module-level counter rather than a ref
 * because the first rows are built inside useState's initialiser, i.e. during
 * render, where reading a ref is not allowed. The value is never rendered, so
 * it does not matter that the server and the browser start from different
 * numbers.
 */
let keySeq = 0;

function blankRow(purpose: string, date: string, category = "Derma"): Draft {
  return {
    key: ++keySeq,
    name: "",
    phone: "",
    amount: "",
    purpose,
    date,
    inKind: false,
    item: "",
    estValue: "",
    method: "cash",
    category,
  };
}

/**
 * What gets STORED as the row's purpose (and later classified back into an
 * eROSES cell — see src/lib/eroses-penyata.ts): the old single-row form's
 * convention, kept exactly. Derma rows keep their free wording ("Derma am");
 * any other type prints as "Type" or "Type — note".
 */
export function storedPurposeFor(category: string, note: string, fallback: string): string {
  const n = note.trim();
  if (category === "Derma" || category === "") return n || fallback;
  return n === "" ? category : `${category} — ${n}`;
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-2 py-2 text-base shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * C-14 (work order 51, 拍板 9②): the PURPOSE box on every row is a dropdown
 * fed by the society's own templates — one tap per row, each row its own
 * purpose. Free typing stays one option away ("✏️ …"), because the templates
 * are suggestions, never a closed list. With no templates yet the row is the
 * plain input it always was.
 */
function PurposeCell({
  value,
  onChange,
  templates,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  templates: string[];
  ariaLabel: string;
}) {
  const t = useTriText();
  const [custom, setCustom] = useState(false);
  if (templates.length === 0 || custom) {
    return (
      <span className="flex items-center gap-1">
        <input
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
        />
        {templates.length > 0 && (
          <button
            type="button"
            className="rounded-md px-1.5 py-1 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setCustom(false)}
            title={t("Pilih daripada templat", "改成从模板选", "Pick from templates")}
          >
            ▾
          </button>
        )}
      </span>
    );
  }
  // The row's current wording is always a valid option, even when it is not
  // (or no longer) a template — a select must never blank a value it holds.
  const options = templates.includes(value.trim()) || value.trim() === ""
    ? templates
    : [value.trim(), ...templates];
  return (
    <select
      className={inputClass}
      value={value.trim() === "" ? templates[0] : value}
      onChange={(e) => {
        if (e.target.value === "__custom__") {
          setCustom(true);
          return;
        }
        onChange(e.target.value);
      }}
      aria-label={ariaLabel}
    >
      {options.map((label) => (
        <option key={label} value={label}>
          {label}
        </option>
      ))}
      <option value="__custom__">
        ✏️ {t("Taip sendiri…", "自己写…", "Type your own…")}
      </option>
    </select>
  );
}

export function TypeDonations({
  onAddMany,
  defaultCollector,
  defaultPurpose = "Derma am",
  defaultOpen = false,
  onSlipPhoto,
  slipBusy,
}: {
  /** Called once with every completed row — one batch, one confirmation. */
  onAddMany: (donations: RegisterDonation[]) => void;
  defaultCollector: string;
  defaultPurpose?: string;
  /** G-1 (2026-08-25): true when the person arrived through the "type it in"
   *  door on step 1 — the grid opens ready instead of hiding behind its own
   *  button on the page they were just sent to. */
  defaultOpen?: boolean;
  /**
   * D-2, moved here with the merge (D1-1): photograph the fee slip / rental
   * receipt instead of typing — runs the ledger-reading pipeline with the
   * CHOSEN income type pre-filling any purpose the model reads nothing for.
   * Absent = no photo entrance.
   */
  onSlipPhoto?: (file: File, category: string) => Promise<boolean>;
  /** True while the AI is reading (shared with the ledger reader). */
  slipBusy?: boolean;
}) {
  const t = useTriText();
  const localizeError = useLocalizedError();
  const today = dayIsoMalaysia(new Date().toISOString())!;
  // C-14 (拍板 9②): the same template list feeds every row's purpose dropdown.
  const { labels: purposeTemplates } = useTemplates("income_purpose");
  // null = the person has not chosen yet. The grid then opens BY ITSELF when
  // a saved draft with real content comes back (B-5②) — an invisible saved
  // draft is as good as a lost one. Derived, not set in an effect.
  const [openChoice, setOpenChoice] = useState<boolean | null>(
    defaultOpen ? true : null,
  );
  const [collector, setCollector] = useState(defaultCollector);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  /** D1-1: transfer proofs by row key. NOT in the persisted draft — a File
   *  cannot live in localStorage, so these last only as long as the page. */
  const [proofs, setProofs] = useState<Map<number, File>>(new Map());
  /** True while addAll uploads proofs — the buttons say so. */
  const [saving, setSaving] = useState(false);
  /** D-2: the income type the slip-photo door will pre-fill. */
  const [slipCategory, setSlipCategory] = useState(INCOME_CATEGORIES[0].value);
  /** The slip photo was read and now waits in the step-1 review. */
  const [slipDone, setSlipDone] = useState(false);

  const freshRows = (): Draft[] => [
    blankRow(defaultPurpose, today),
    blankRow(defaultPurpose, today),
    blankRow(defaultPurpose, today),
  ];
  // B-5② (J #13): the half-typed grid AUTO-SAVES, scoped per user+org — forty
  // rows typed at a festival table must survive a page hop or a closed tab.
  // Same mechanism as the meeting-notes draft.
  const draftKey = useScopedKey("money:typed-draft:v1");
  const [rows, setRows, draftStore] = usePersistentState<Draft[]>(
    draftKey,
    freshRows(),
    isDraftArray,
  );
  // Restored rows carry keys from an earlier session; the module counter must
  // never hand those keys out again (React keys + the update() patcher).
  useEffect(() => {
    for (const r of rows) if (r.key > keySeq) keySeq = r.key;
  }, [rows]);
  const draftHasContent = rows.some((r) => problemWith(r) !== "empty");
  const open = openChoice ?? (draftStore.loaded && draftHasContent);

  const ready = useMemo(() => rows.filter((r) => problemWith(r) === null), [rows]);
  const totalCents = useMemo(
    () => ready.reduce((sum, r) => sum + (parseRmToCents(r.amount) ?? 0), 0),
    [ready],
  );

  function update(key: number, patch: Partial<Draft>) {
    setAdded(null);
    setRows((current) => {
      const next = current.map((r) => {
        if (r.key !== key) return r;
        const merged = { ...r, ...patch };
        // Changing the TYPE clears a purpose that names a DIFFERENT type —
        // otherwise "Yuran ahli" + leftover "Derma am" would store the
        // contradiction "Yuran ahli — Derma am". A purpose the person wrote
        // for this type (or plain words) stays.
        if (
          patch.category !== undefined &&
          patch.category !== r.category &&
          merged.purpose.trim() !== ""
        ) {
          const named = incomeCategoryFromPurpose(merged.purpose)?.value;
          if (named !== undefined && named !== patch.category) merged.purpose = "";
        }
        return merged;
      });
      // Always one empty row waiting at the bottom, so typing never stops to
      // press a button. The date, purpose and type of the row above carry
      // over — a collection is one afternoon, one purpose, forty names.
      const last = next[next.length - 1]!;
      if (problemWith(last) !== "empty") {
        next.push(blankRow(last.purpose, last.date, last.category ?? "Derma"));
      }
      return next;
    });
  }

  function removeRow(key: number) {
    setProofs((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    setRows((current) => {
      const next = current.filter((r) => r.key !== key);
      return next.length ? next : [blankRow(defaultPurpose, today)];
    });
  }

  async function addAll() {
    setError(null);
    const broken = rows.find((r) => {
      const p = problemWith(r);
      return p !== null && p !== "empty";
    });
    if (broken) {
      const p = problemWith(broken);
      setError(
        p === "name"
          ? t(
              "Ada baris tanpa nama. Isi nama, atau kosongkan baris itu sepenuhnya.",
              "有一行没有名字。请填上名字，或者把那一行整行清空。",
              "A row has no name. Fill in the name, or clear that row completely.",
            )
          : p === "item"
            ? t(
                "Baris derma barangan perlu menyatakan barangan itu (ia dicetak pada resit).",
                "实物捐赠那一行要写清楚是什么物品（会印在收据上）。",
                "An in-kind row must say what the items are (it is printed on the receipt).",
              )
            : p === "estValue"
              ? t(
                  "Nilai anggaran tidak sah. Contoh yang betul: 100, 100.50 (ruangan ini pilihan).",
                  "估值无效。正确的写法：100、100.50（这格是选填）。",
                  "The estimated value is not valid. Correct examples: 100, 100.50 (this box is optional).",
                )
              : p === "note"
                ? t(
                    "Untuk jenis “Lain-lain”, tulis satu ayat dalam ruang tujuan tentang pendapatan apa ini — juruaudit perlu tahu.",
                    "选了「其他」的那一行，请在用途格写一句这是什么收入 —— 审计要看得懂。",
                    "A row typed “Other” needs one sentence in its purpose box saying what the income is — the auditor needs to know.",
                  )
                : t(
                    "Ada jumlah yang tidak sah. Contoh yang betul: 10, 10.50, RM 10.50",
                    "有一行的金额无效。正确的写法：10、10.50、RM 10.50",
                    "A row has an amount that is not valid. Correct examples: 10, 10.50, RM 10.50",
                  ),
      );
      return;
    }
    if (ready.length === 0) {
      setError(t("Belum ada baris untuk ditambah.", "还没有可以加入的行。", "No rows to add yet."));
      return;
    }

    // D1-1: transfer screenshots go to Storage FIRST, so the register rows
    // can carry their paths. A failed upload stops the WHOLE batch and says
    // which row — the person can retry, or remove that file and add without
    // it. Nothing is added until every attached proof has landed.
    const proofPaths = new Map<number, string>();
    setSaving(true);
    try {
      for (const r of ready) {
        const file = r.method === "transfer" && !r.inKind ? proofs.get(r.key) : undefined;
        if (!file) continue;
        // 48: shrink in the browser; server actions ride the request body.
        const proof = await shrinkPhotoForUpload(file);
        if (isTooLargeToUpload(proof.size)) {
          setError(`📄 ${r.name.trim()}: ${tooLargeToUploadMessage()}`);
          return;
        }
        const form = new FormData();
        form.append("proof", proof);
        const result = await uploadTransferProof(form).catch(
          () => ({ ok: false }) as const,
        );
        if (!result.ok) {
          setError(
            t(
              `Gambar bukti pindahan untuk "${r.name.trim()}" tidak dapat dimuat naik. Cuba lagi — atau buang fail itu untuk merekod tanpa bukti.`,
              `「${r.name.trim()}」那一行的转账截图没能上传。请再试一次 —— 或者把文件移除，先记录（不带截图）。`,
              `The transfer screenshot for "${r.name.trim()}" could not be uploaded. Try again — or remove the file to record without it.`,
            ),
          );
          return;
        }
        proofPaths.set(r.key, result.path);
      }
    } finally {
      setSaving(false);
    }

    // One timestamp for the batch, plus the row's own index: `Date.now()` alone
    // would give twenty rows added in the same millisecond the same id, and the
    // register keys on it.
    const stamp = Date.now();
    onAddMany(
      ready.map((r, i) => ({
        id: `man-${stamp}-${i}`,
        donorName: r.name.trim(),
        donorPhone: r.phone.trim() || null,
        // D-1: goods rows carry 0 money BY CONVENTION — the estimate lives in
        // estValueCents and enters the ledger only, never any money path.
        amountCents: r.inKind ? 0 : parseRmToCents(r.amount)!,
        // D1-1: the income TYPE rides in the purpose, the way the old
        // single-row form always stored it — eroses-penyata.ts reads it back.
        purpose: storedPurposeFor(
          r.inKind ? "Derma" : (r.category ?? "Derma"),
          r.purpose,
          defaultPurpose,
        ),
        donatedAtIso: r.date || today,
        collector: collector.trim() || defaultCollector,
        receiptNo: null,
        custodyStatus: "collected" as const,
        source: "manual" as const,
        // D19: the typed answer rides along; goods have no payment method.
        paymentMethod:
          !r.inKind && r.method === "transfer"
            ? ("transfer" as const)
            : ("cash" as const),
        transferProofPath: proofPaths.get(r.key) ?? null,
        kind: r.inKind ? ("in_kind" as const) : ("cash" as const),
        itemDesc: r.inKind ? r.item.trim() : null,
        estValueCents:
          r.inKind && r.estValue.trim() !== ""
            ? parseRmToCents(r.estValue)
            : null,
        // §1-11: when the row was recorded.
        createdAtIso: new Date().toISOString(),
      })),
    );
    setAdded(ready.length);
    setProofs(new Map());
    setRows(freshRows());
  }

  if (!open) {
    return (
      <div className="flex flex-col items-start gap-2">
        {/* C-6: h-auto + whitespace-normal — the long label must WRAP on a
            375px phone; nowrap made this one button drag the page sideways. */}
        <Button
          variant="outline"
          className="h-auto min-h-11 max-w-full whitespace-normal text-left"
          onClick={() => setOpenChoice(true)}
        >
          {/* D1-1: the one typed door — one gift or a whole list, same grid. */}
          <Tri
            bm="Tiada kertas — taip pendapatan (satu baris atau satu senarai)"
            zh="没有账页 —— 打字记收入（一笔或整份名单）"
            en="No ledger page — type the income (one row or a whole list)"
          />
        </Button>
        {added !== null && (
          <p className="rounded-md border-2 border-green-400 bg-green-50 px-3 py-2 text-sm font-medium text-green-900 dark:bg-green-400/10 dark:text-green-100">
            ✓{" "}
            <Tri
              bm={`${added} baris ditambah ke daftar. Jana resitnya sekali gus di halaman “Resit”.`}
              zh={`已经把 ${added} 笔加进登记簿了。到「开收据」那一页一次过开收据。`}
              en={`${added} row(s) added to the register. Issue their receipts in one go on the “Receipts” page.`}
            />
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-[color:var(--v2-border)] p-4">
      <div>
        <p className="text-base font-semibold">
          <Tri
            bm="Taip pendapatan — satu baris atau satu senarai"
            zh="打字记收入 —— 一笔或整份名单"
            en="Type the income — one row or a whole list"
          />
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {/* D1-1: this grid took over the single-row form's job too. */}
          <Tri
            bm="Untuk wang masuk yang tiada pada mana-mana kertas — meja derma pada hari perayaan, atau satu yuran tunggal. Taip satu baris satu; baris baharu muncul sendiri (tarikh, jenis dan tujuan diikut dari baris sebelumnya). Baris di sini ditanda “manual” untuk juruaudit. Resit dikeluarkan sekali gus selepas ini."
            zh="给没有记在任何纸上的收入用 —— 例如庙会当天的捐款桌，或单独一笔会员费。一笔一行，打完会自己多出一行（日期、类型、用途都跟着上一行）。这里的记录会标「手动」，审计看得到。加进名册之后，收据在下面一次过开。"
            en="For money in that is on no paper at all — a festival donation table, or a single membership fee. One line each; a new line appears by itself (date, type and purpose carry over). Rows here are tagged “manual” for the auditor. Receipts are issued in one batch afterwards."
          />
        </p>
      </div>

      {/* D-2 (moved here by the merge): the photo path FIRST — the eROSES law
          says the camera beats the form whenever there IS paper. The chosen
          income type rides along and pre-fills what the model reads no
          purpose for; the rows land in the step-1 review like any ledger. */}
      {onSlipPhoto && (
        <div className="flex flex-col gap-2 rounded-md border-2 border-[color:var(--v2-outline-border)] bg-muted/20 p-3">
          <p className="text-sm text-muted-foreground">
            <Tri
              bm="Ada resit / slip di tangan? Pilih jenis, kemudian ambil gambar — MinitAI membacanya dan barisnya menunggu di langkah 1 untuk disemak."
              zh="手上有单据？先选好收入类型，再拍下来 —— MinitAI 读出来的行会等在第 1 步给您核对。"
              en="Holding a slip or receipt? Pick the income type, then photograph it — MinitAI reads it and the rows wait in step 1 for your check."
            />
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className={`${inputClass} w-auto`}
              value={slipCategory}
              onChange={(e) => setSlipCategory(e.target.value)}
              aria-label={t("Jenis pendapatan", "收入类型", "Income type")}
            >
              {INCOME_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {t(c.bm, c.zh, c.en)}
                </option>
              ))}
            </select>
            <label
              className={`inline-flex w-fit cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground shadow hover:bg-primary/90 ${
                slipBusy ? "pointer-events-none opacity-70" : ""
              }`}
            >
              {slipBusy ? (
                <>⏳ <Tri bm="AI sedang membaca…" zh="AI 读取中…" en="AI is reading…" /></>
              ) : (
                <><AttachIcon /> <ChooseFileLabel /></>
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
                  void onSlipPhoto(file, slipCategory).then(setSlipDone);
                }}
              />
            </label>
            <UsesOneAiAction />
          </div>
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

      <label className="flex max-w-xs flex-col gap-1">
        <span className="text-sm font-semibold">
          <Tri bm="Dikutip oleh" zh="收款人" en="Collected by" />
        </span>
        <input
          className={inputClass}
          value={collector}
          onChange={(e) => setCollector(e.target.value)}
          placeholder={defaultCollector}
        />
      </label>

      {/* #5 + C-14 (拍板 9②): the organisation's own purpose wordings. A chip
          fills ONLY the still-empty rows (rows already filled in keep their
          own purpose — a chip must never rewrite the whole table), and the
          hint SAYS so; each row also has its own dropdown below. */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">
            <Tri bm="Tujuan biasa" zh="常用用途" en="Usual purposes" />:
          </span>
          <TemplateChips
            kind="income_purpose"
            onPick={(label) =>
              setRows((current) =>
                current.map((r) =>
                  r.name.trim() === "" &&
                  r.amount.trim() === "" &&
                  r.phone.trim() === ""
                    ? { ...r, purpose: label }
                    : r,
                ),
              )
            }
          />
        </div>
        <p className="text-sm text-muted-foreground">
          <Tri
            bm="Tekan satu templat = baris KOSONG sahaja diisi; baris yang sudah ditaip tidak diubah. Setiap baris juga boleh pilih tujuannya sendiri dalam jadual."
            zh="点一下模板 = 只填还空着的行；已经打好的行不会被改。每一行也可以在表格里自己选用途。"
            en="Tap a template = only EMPTY rows are filled; rows already typed keep their own. Each row can also pick its purpose in the table."
          />
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <thead>
            <tr className="text-left">
              {/* 拍板 0-3 (D22): required = red star, optional = unmarked. */}
              <th className="p-2 font-semibold">
                <Tri bm="Nama penderma" zh="捐款人" en="Donor" />
                <Req />
              </th>
              <th className="p-2 font-semibold">
                <Tri bm="Telefon" zh="电话" en="Phone" />
              </th>
              <th className="p-2 font-semibold">
                <Tri bm="Jumlah (RM)" zh="金额 (RM)" en="Amount (RM)" />
                <Req />
              </th>
              {/* D1-1: the income TYPE — the categories the old single-row
                  form had, now on every row (money-categories.ts). */}
              <th className="p-2 font-semibold">
                <Tri bm="Jenis" zh="类型" en="Type" />
              </th>
              <th className="p-2 font-semibold">
                <Tri bm="Tujuan" zh="用途" en="Purpose" />
              </th>
              <th className="p-2 font-semibold">
                <Tri bm="Tarikh" zh="日期" en="Date" />
              </th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const problem = problemWith(row);
              return (
                <tr key={row.key} className="border-t border-[color:var(--v2-border)]">
                  <td className="p-1">
                    <span className="flex items-center gap-1">
                      <input
                        className={inputClass}
                        value={row.name}
                        onChange={(e) => update(row.key, { name: e.target.value })}
                        // A screen reader announces the row; sighted users have
                        // the column header.
                        aria-label={t(
                          `Nama penderma, baris ${index + 1}`,
                          `捐款人，第 ${index + 1} 行`,
                          `Donor name, row ${index + 1}`,
                        )}
                      />
                      {/* C-4: names are the slow part of a forty-row list —
                          speak one instead. Renders nothing where the browser
                          has no speech support. */}
                      <VoiceButton
                        onText={(text) =>
                          update(row.key, {
                            name: row.name.trim()
                              ? `${row.name.trim()} ${text}`
                              : text,
                          })
                        }
                      />
                    </span>
                  </td>
                  <td className="p-1">
                    <input
                      className={inputClass}
                      inputMode="tel"
                      value={row.phone}
                      onChange={(e) => update(row.key, { phone: e.target.value })}
                      aria-label={t(
                        `Telefon, baris ${index + 1}`,
                        `电话，第 ${index + 1} 行`,
                        `Phone, row ${index + 1}`,
                      )}
                    />
                  </td>
                  <td className="p-1">
                    {row.inKind ? (
                      // D-1: a goods row records the ITEMS (required — they go
                      // on the receipt) and an OPTIONAL estimate (ledger only).
                      <span className="flex flex-col gap-1">
                        <input
                          className={`${inputClass} ${
                            problem === "item" ? "border-red-400" : ""
                          }`}
                          value={row.item}
                          placeholder={t("cth: 20 kampit beras", "例：白米 20 包", "e.g. 20 bags of rice")}
                          onChange={(e) => update(row.key, { item: e.target.value })}
                          aria-label={t(
                            `Barangan, baris ${index + 1}`,
                            `物品，第 ${index + 1} 行`,
                            `Items, row ${index + 1}`,
                          )}
                        />
                        <input
                          className={`${inputClass} text-right font-mono ${
                            problem === "estValue" ? "border-red-400" : ""
                          }`}
                          inputMode="decimal"
                          value={row.estValue}
                          placeholder={t("anggaran RM", "估值 RM", "est. RM")}
                          onChange={(e) => update(row.key, { estValue: e.target.value })}
                          aria-label={t(
                            `Nilai anggaran RM, baris ${index + 1}`,
                            `估值 RM，第 ${index + 1} 行`,
                            `Estimated value RM, row ${index + 1}`,
                          )}
                        />
                      </span>
                    ) : (
                      <input
                        className={`${inputClass} text-right font-mono ${
                          problem === "amount" ? "border-red-400" : ""
                        }`}
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(e) => update(row.key, { amount: e.target.value })}
                        onKeyDown={(e) => {
                          // Enter = "done with this person, next one". The blank
                          // row already exists, so this only moves the cursor.
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const inputs = Array.from(
                              e.currentTarget
                                .closest("table")!
                                .querySelectorAll<HTMLInputElement>("tbody tr td:first-child input"),
                            );
                            inputs[index + 1]?.focus();
                          }
                        }}
                        aria-label={t(
                          `Jumlah RM, baris ${index + 1}`,
                          `金额 RM，第 ${index + 1} 行`,
                          `Amount RM, row ${index + 1}`,
                        )}
                      />
                    )}
                    {/* D19: cash or bank transfer — one tap, per row. */}
                    {!row.inKind && (
                      <div className="mt-1">
                        <PaymentMethodToggle
                          compact
                          value={row.method === "transfer" ? "transfer" : "cash"}
                          onChange={(m) => update(row.key, { method: m })}
                        />
                      </div>
                    )}
                    {/* D1-1: the transfer screenshot, per row — Storage only,
                        no AI. Not part of the auto-saved draft (a File cannot
                        live in localStorage), and the label says so. */}
                    {!row.inKind && row.method === "transfer" && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border-2 border-[color:var(--v2-outline-border)] px-2 py-1 font-medium hover:bg-accent">
                          <AttachIcon className="h-3.5 w-3.5" />{" "}
                          {proofs.has(row.key) ? (
                            <Tri bm="Tukar bukti" zh="换截图" en="Change proof" />
                          ) : (
                            <Tri bm="Bukti pindahan" zh="转账截图" en="Transfer proof" />
                          )}
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              e.target.value = "";
                              if (!f) return;
                              setProofs((prev) => new Map(prev).set(row.key, f));
                            }}
                          />
                        </label>
                        {proofs.has(row.key) ? (
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <span className="max-w-28 truncate">
                              {proofs.get(row.key)!.name}
                            </span>
                            <button
                              type="button"
                              className="underline underline-offset-2"
                              onClick={() =>
                                setProofs((prev) => {
                                  const next = new Map(prev);
                                  next.delete(row.key);
                                  return next;
                                })
                              }
                            >
                              <Tri bm="Buang" zh="移除" en="Remove" />
                            </button>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            <Tri
                              bm="pilihan · simpan sahaja, tiada AI"
                              zh="可选 · 只存档，不经过 AI"
                              en="optional · stored only, no AI"
                            />
                          </span>
                        )}
                      </div>
                    )}
                    <label className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={row.inKind}
                        onChange={(e) => update(row.key, { inKind: e.target.checked })}
                        className="h-3.5 w-3.5 accent-[color:var(--v2-primary)]"
                      />
                      <Tri bm="Derma barangan" zh="实物捐赠" en="In-kind (goods)" />
                    </label>
                  </td>
                  <td className="p-1">
                    {/* D1-1: the income type. Goods rows are Derma Barangan
                        by definition — no select to mis-set. */}
                    {row.inKind ? (
                      <span className="px-1 text-sm text-muted-foreground">
                        <Tri bm="Derma barangan" zh="实物捐赠" en="In-kind" />
                      </span>
                    ) : (
                      <select
                        className={`${inputClass} min-w-0`}
                        value={row.category ?? "Derma"}
                        onChange={(e) => update(row.key, { category: e.target.value })}
                        aria-label={t(
                          `Jenis pendapatan, baris ${index + 1}`,
                          `收入类型，第 ${index + 1} 行`,
                          `Income type, row ${index + 1}`,
                        )}
                      >
                        {INCOME_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {t(c.bm, c.zh, c.en)}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="p-1">
                    {/* C-14 (拍板 9②): a dropdown per ROW — rows can carry
                        different purposes; typing your own is one option in. */}
                    <PurposeCell
                      value={row.purpose}
                      onChange={(v) => update(row.key, { purpose: v })}
                      templates={purposeTemplates}
                      ariaLabel={t(
                        `Tujuan, baris ${index + 1}`,
                        `用途，第 ${index + 1} 行`,
                        `Purpose, row ${index + 1}`,
                      )}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="date"
                      className={inputClass}
                      value={row.date}
                      onChange={(e) => update(row.key, { date: e.target.value })}
                      aria-label={t(
                        `Tarikh, baris ${index + 1}`,
                        `日期，第 ${index + 1} 行`,
                        `Date, row ${index + 1}`,
                      )}
                    />
                  </td>
                  <td className="p-1 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className="rounded-md px-2 py-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      aria-label={t(
                        `Buang baris ${index + 1}`,
                        `删掉第 ${index + 1} 行`,
                        `Remove row ${index + 1}`,
                      )}
                    >
                      <Tri bm="Buang" zh="删掉" en="Remove" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* B-5②: the auto-add mechanism stays, but a VISIBLE button says so —
          "a new line appears by itself" in the intro was the only clue. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setRows((current) => {
              const last = current[current.length - 1];
              return [
                ...current,
                blankRow(last?.purpose ?? defaultPurpose, last?.date ?? today),
              ];
            });
          }}
        >
          ＋ <Tri bm="Tambah satu baris" zh="自己加一行" en="Add a row" />
        </Button>
        <span className="text-sm text-muted-foreground">
          💾{" "}
          <Tri
            bm="Draf disimpan sendiri pada peranti ini — tutup atau tukar halaman pun tidak hilang."
            zh="草稿会自动保存在这台设备上 —— 关掉或跳页都不会不见。"
            en="The draft saves itself on this device — closing or changing pages loses nothing."
          />
        </span>
      </div>

      {/* The running total is the check a treasurer actually does: it has to
          match the cash in the tin before anything is added. Summed in
          TypeScript, never by a model (Hard Rule 2). */}
      <p className="text-base font-semibold">
        <Tri
          bm={`${ready.length} baris siap · jumlah RM ${(totalCents / 100).toFixed(2)}`}
          zh={`${ready.length} 笔已填好 · 合计 RM ${(totalCents / 100).toFixed(2)}`}
          en={`${ready.length} row(s) ready · total RM ${(totalCents / 100).toFixed(2)}`}
        />
      </p>

      {error && (
        <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
          {localizeError(error)}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void addAll()}
          disabled={ready.length === 0 || saving}
        >
          {saving ? (
            <Tri bm="Menyimpan…" zh="保存中…" en="Saving…" />
          ) : (
            <Tri
              bm={`Tambah ${ready.length} baris ke daftar`}
              zh={`把这 ${ready.length} 笔加进名册`}
              en={`Add ${ready.length} row(s) to the register`}
            />
          )}
        </Button>
        {/* B-5②: closing KEEPS the draft (it is auto-saved); discarding it is
            its own, clearly-worded button. The old Close wiped 40 rows. */}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setError(null);
            setOpenChoice(false);
          }}
        >
          <Tri bm="Tutup (draf disimpan)" zh="收起（草稿保留）" en="Close (draft kept)" />
        </Button>
        {rows.some((r) => problemWith(r) !== "empty") && (
          /* §1-10: the app's own dialog, never window.confirm. */
          <ConfirmedAction
            body={
              <Tri
                bm="Buang draf yang ditaip ini? Tidak boleh dibatalkan."
                zh="要把打了一半的草稿整份删掉吗？删了无法复原。"
                en="Discard this typed draft? This cannot be undone."
              />
            }
            confirmLabel={<Tri bm="Buang" zh="清空" en="Discard" />}
            onConfirm={() => {
              setRows(freshRows());
              setError(null);
            }}
            trigger={(open) => (
              <Button type="button" variant="ghost" className="text-red-700" onClick={open}>
                🗑 <Tri bm="Buang draf" zh="清空草稿" en="Discard draft" />
              </Button>
            )}
          />
        )}
      </div>
    </div>
  );
}
