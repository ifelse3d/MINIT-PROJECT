"use client";

import { useEffect, useMemo, useState } from "react";
import { Tri, useTriText } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { VoiceButton } from "@/components/voice-input";
import { Req } from "@/components/required-mark";
import { parseRmToCents, type RegisterDonation } from "@/lib/receipts";
import { dayIsoMalaysia } from "@/lib/history";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useScopedKey } from "@/lib/storage-scope";
import { PaymentMethodToggle } from "./payment-method-toggle";

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
// Every row is tagged source: "manual", same as the single-entry form, so an
// auditor can always see which rows had no original page.
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
};

/** Shape guard for a draft read back out of localStorage (B-5②): a wrong-
 *  shaped blob must fall back to a fresh grid, never crash the typing. */
function isDraftArray(parsed: unknown): boolean {
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
function problemWith(row: Draft): "empty" | "name" | "amount" | "item" | "estValue" | null {
  const blank =
    !row.name.trim() &&
    !row.amount.trim() &&
    !row.phone.trim() &&
    !(row.inKind && row.item.trim());
  if (blank) return "empty";
  if (!row.name.trim()) return "name";
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

function blankRow(purpose: string, date: string): Draft {
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
  };
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-2 py-2 text-base shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring";

export function TypeDonations({
  onAddMany,
  defaultCollector,
  defaultPurpose = "Derma am",
  defaultOpen = false,
}: {
  /** Called once with every completed row — one batch, one confirmation. */
  onAddMany: (donations: RegisterDonation[]) => void;
  defaultCollector: string;
  defaultPurpose?: string;
  /** G-1 (2026-08-25): true when the person arrived through the "type it in"
   *  door on step 1 — the grid opens ready instead of hiding behind its own
   *  button on the page they were just sent to. */
  defaultOpen?: boolean;
}) {
  const t = useTriText();
  const today = dayIsoMalaysia(new Date().toISOString())!;
  // null = the person has not chosen yet. The grid then opens BY ITSELF when
  // a saved draft with real content comes back (B-5②) — an invisible saved
  // draft is as good as a lost one. Derived, not set in an effect.
  const [openChoice, setOpenChoice] = useState<boolean | null>(
    defaultOpen ? true : null,
  );
  const [collector, setCollector] = useState(defaultCollector);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);

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
      const next = current.map((r) => (r.key === key ? { ...r, ...patch } : r));
      // Always one empty row waiting at the bottom, so typing never stops to
      // press a button. The date and purpose of the row above carry over —
      // a collection is one afternoon, one purpose, forty names.
      const last = next[next.length - 1]!;
      if (problemWith(last) !== "empty") {
        next.push(blankRow(last.purpose, last.date));
      }
      return next;
    });
  }

  function removeRow(key: number) {
    setRows((current) => {
      const next = current.filter((r) => r.key !== key);
      return next.length ? next : [blankRow(defaultPurpose, today)];
    });
  }

  function addAll() {
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
                  "Nilai anggaran tidak sah. Contoh yang betul: 100, 100.50 — atau kosongkan.",
                  "估值无效。正确的写法：100、100.50 —— 也可以留空。",
                  "The estimated value is not valid. Correct examples: 100, 100.50 — or leave it empty.",
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
        purpose: r.purpose.trim() || defaultPurpose,
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
          <Tri
            bm="Ramai penderma, tiada kertas — taip senarai"
            zh="很多人捐款、没有账页 —— 打字输入整份名单"
            en="Many donors, no ledger page — type the list"
          />
        </Button>
        {added !== null && (
          <p className="rounded-xl border-2 border-green-400 bg-green-50 px-3 py-2 text-sm font-medium text-green-900 dark:bg-green-400/10 dark:text-green-100">
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
    <div className="flex flex-col gap-4 rounded-2xl border border-[color:var(--v2-border)] p-4">
      <div>
        <p className="text-base font-semibold">
          <Tri
            bm="Taip senarai derma"
            zh="打字输入捐款名单"
            en="Type the donation list"
          />
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          <Tri
            bm="Untuk kutipan yang tiada halaman lejar — meja derma pada hari perayaan, contohnya. Taip satu baris seorang; baris baharu muncul sendiri. Tarikh dan tujuan baris sebelumnya diikut, jadi biasanya anda hanya menaip nama dan jumlah. Resit dikeluarkan sekali gus selepas ini."
            zh="给没有账页的收款用 —— 例如庙会当天的捐款桌。一个人一行，打完会自己多出一行。日期和用途会跟着上一行，所以通常只需要打名字和金额。加进名册之后，收据在下面一次过开。"
            en="For a collection with no ledger page — a festival donation table, for example. One line per person; a new line appears by itself. The date and purpose carry over from the line above, so usually you only type a name and an amount. Receipts are issued in one batch afterwards."
          />
        </p>
      </div>

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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
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
                    <input
                      className={inputClass}
                      value={row.purpose}
                      onChange={(e) => update(row.key, { purpose: e.target.value })}
                      aria-label={t(
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
        <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={addAll} disabled={ready.length === 0}>
          <Tri
            bm={`Tambah ${ready.length} baris ke daftar`}
            zh={`把这 ${ready.length} 笔加进名册`}
            en={`Add ${ready.length} row(s) to the register`}
          />
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
          <Button
            type="button"
            variant="ghost"
            className="text-red-700"
            onClick={() => {
              if (
                !window.confirm(
                  t(
                    "Buang draf yang ditaip ini? Tidak boleh dibatalkan.",
                    "要把打了一半的草稿整份删掉吗？删了无法复原。",
                    "Discard this typed draft? This cannot be undone.",
                  ),
                )
              ) {
                return;
              }
              setRows(freshRows());
              setError(null);
            }}
          >
            🗑 <Tri bm="Buang draf" zh="清空草稿" en="Discard draft" />
          </Button>
        )}
      </div>
    </div>
  );
}
