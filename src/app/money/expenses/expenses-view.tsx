"use client";

// ---------------------------------------------------------------------------
// The expenses & claims screen (Stage E, work order 27).
//
// Three audiences on one page, decided by ROLE (resolved server-side):
//   * money writers (treasurer / hq_admin): record the society's own
//     spending, decide the pending claims, mark them paid;
//   * every other writing member: submit a claim, watch its status here —
//     v1 has NO notifications, and the page says so honestly ("上來看");
//   * the auditor: sees the book, touches nothing.
//
// The photo path reads ONE receipt/invoice (1 AI action, said on the button)
// and PRE-FILLS the form — the human confirms every field by saving, and the
// row is tagged source "photo" for the auditor. Typing is free and tagged
// "manual". Money parsing is parseRmToCents only (Hard Rule 2).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { PageSection } from "@/components/page-section";
import { VoiceButton } from "@/components/voice-input";
import { canDecideClaim, canSubmitClaim, type ExpenseStatus } from "@/lib/claims";
import { formatRm } from "@/lib/minutes-draft";
import { parseRmToCents } from "@/lib/receipts";
import { dayIsoMalaysia } from "@/lib/history";
import { consumeExpensePhoto } from "@/lib/expense-handoff";
import type { ExpenseExtraction } from "@/lib/extraction";
import {
  decideClaim,
  loadExpenses,
  recordExpense,
  submitClaim,
  type ExpenseOutcome,
  type ExpenseRow,
} from "./actions";

const EXPENSE_CATEGORIES: { value: string; bm: string; zh: string; en: string }[] = [
  { value: "Perbelanjaan acara", bm: "Perbelanjaan acara", zh: "活动开支", en: "Event spending" },
  { value: "Utiliti", bm: "Utiliti (air/elektrik)", zh: "水电杂费", en: "Utilities" },
  { value: "Penyelenggaraan", bm: "Penyelenggaraan", zh: "维修保养", en: "Maintenance" },
  { value: "Alat tulis", bm: "Alat tulis & pejabat", zh: "文具与办公", en: "Stationery & office" },
  { value: "Sewa", bm: "Sewa", zh: "租金", en: "Rent" },
  { value: "Pengangkutan", bm: "Pengangkutan", zh: "交通", en: "Transport" },
  { value: "Lain-lain", bm: "Lain-lain", zh: "其他", en: "Other" },
];

const STATUS_BADGE: Record<ExpenseStatus, { cls: string; bm: string; zh: string; en: string }> = {
  recorded: { cls: "border-slate-300 bg-slate-100 text-slate-800", bm: "Direkod", zh: "已记录", en: "Recorded" },
  submitted: { cls: "border-amber-300 bg-amber-100 text-amber-900", bm: "Menunggu kelulusan", zh: "待批准", en: "Awaiting approval" },
  approved: { cls: "border-blue-300 bg-blue-100 text-blue-900", bm: "Diluluskan — belum dibayar", zh: "已批准 · 等付款", en: "Approved — unpaid" },
  paid: { cls: "border-green-300 bg-green-100 text-green-800", bm: "Sudah dibayar", zh: "已付款", en: "Paid" },
  rejected: { cls: "border-red-300 bg-red-100 text-red-900", bm: "Ditolak", zh: "已退回", en: "Rejected" },
};

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * B-8 (J #9): where a claim IS in its life, drawn as the three stops it
 * passes — submitted → approved → paid. Words, not a state-machine enum.
 */
function ClaimProgress({ status }: { status: ExpenseStatus }) {
  if (status === "recorded" || status === "rejected") return null;
  const reached = status === "submitted" ? 0 : status === "approved" ? 1 : 2;
  const stops = [
    { bm: "Dihantar", zh: "交上去了", en: "Submitted" },
    { bm: "Diluluskan", zh: "批准了", en: "Approved" },
    { bm: "Dibayar", zh: "付款了", en: "Paid" },
  ];
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1 text-sm">
      {stops.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground">→</span>}
          <span
            className={
              i <= reached
                ? "font-medium text-green-800 dark:text-green-300"
                : "text-muted-foreground"
            }
          >
            {i <= reached ? "✓ " : "○ "}
            <Tri {...s} />
          </span>
        </span>
      ))}
    </span>
  );
}

function newClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `exp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ExpensesView({ role }: { role: string }) {
  const t = useTriText();
  const today = dayIsoMalaysia(new Date().toISOString())!;
  const decider = canDecideClaim(role);
  const submitter = canSubmitClaim(role);

  // --- the book -------------------------------------------------------------
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [loadIssue, setLoadIssue] = useState<"db_behind" | "db" | null>(null);
  // Bumping the tick re-runs the load effect — the state updates live in the
  // promise callback, never the effect body.
  const [reloadTick, setReloadTick] = useState(0);
  const refresh = useCallback(() => setReloadTick((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    void loadExpenses().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setRows(result.rows);
        setLoadIssue(null);
      } else {
        setRows([]);
        setLoadIssue(
          result.reason === "db_behind" || result.reason === "db" ? result.reason : null,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  // --- the form (record OR claim — one form, the mode names the intent) -----
  const [mode, setMode] = useState<"record" | "claim">(decider ? "record" : "claim");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0].value);
  const [date, setDate] = useState(today);
  const [source, setSource] = useState<"photo" | "manual">("manual");
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState(newClientId);

  // --- the photo reader (pre-fills the form; the human confirms by saving) --
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);

  // B-5④: the ledger page's "this is spending" answer sends its photo here.
  // It waits behind an explicit, priced button — never read automatically.
  const [handedPhoto, setHandedPhoto] = useState<File | null>(null);
  useEffect(() => {
    // Deferred a tick: the hand-off is an external (module-level) mailbox and
    // the read must happen once after mount, not during the render pass.
    const id = setTimeout(() => {
      const file = consumeExpensePhoto();
      if (file) setHandedPhoto(file);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  async function readReceipt(file: File | null) {
    if (!file || reading) return;
    setReadNote(null);
    setFormError(null);
    setReading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch("/api/extract-expense", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(body?.error ?? t("Tidak berjaya dibaca.", "读取失败。", "Could not read it."));
        return;
      }
      const ex = body.extraction as ExpenseExtraction;
      const desc = [ex.vendor.value, ex.description.value].filter(Boolean).join(" — ");
      if (desc) setDescription(desc);
      if (ex.amount_cents.value !== null) {
        setAmount((ex.amount_cents.value / 100).toFixed(2));
      }
      if (ex.spent_at.value) setDate(ex.spent_at.value);
      setSource("photo");
      setReadNote(
        t(
          "Dibaca oleh AI — semak setiap medan sebelum menyimpan.",
          "AI 读出来的 —— 保存前请逐项核对。",
          "Read by AI — check every field before saving.",
        ),
      );
    } catch {
      setFormError(t("Sambungan terputus.", "网络断了。", "The connection dropped."));
    } finally {
      setReading(false);
    }
  }

  function sayOutcome(result: ExpenseOutcome, successNote: string) {
    if (result.ok) {
      setFormNotice(successNote);
      setDescription("");
      setAmount("");
      setDate(today);
      setSource("manual");
      setClientId(newClientId());
      void refresh();
      return;
    }
    setFormError(
      result.reason === "permission"
        ? t(
            "Peranan anda tidak boleh membuat ini — minta bendahari atau pentadbir.",
            "您的角色不能做这个操作 —— 请找财政或管理员。",
            "Your role cannot do this — ask the treasurer or an administrator.",
          )
        : result.reason === "db_behind"
          ? t(
              "Pangkalan data belum dikemas kini untuk bahagian ini (migration 25). Tiada apa-apa disimpan — cuba lagi selepas ia dijalankan.",
              "数据库还没更新到支持这一区（migration 25）。没有写入任何东西 —— 跑完那支 migration 再试。",
              "The database has not been updated for this yet (migration 25). Nothing was saved — try again once it has been applied.",
            )
          : result.reason === "invalid"
            ? t(
                "Semak medan: perihal dan jumlah (RM) diperlukan, tarikh mesti sah.",
                "请检查栏位：说明和金额（RM）必填，日期要有效。",
                "Check the fields: description and amount (RM) are required, and the date must be valid.",
              )
            : t(
                "Tidak berjaya disimpan — tiada apa-apa ditulis. Cuba lagi.",
                "没有保存成功 —— 什么都没写入。请再试一次。",
                "Could not save — nothing was written. Try again.",
              ),
    );
  }

  async function save() {
    setFormError(null);
    setFormNotice(null);
    const cents = parseRmToCents(amount);
    if (!description.trim() || cents === null || cents <= 0) {
      setFormError(
        t(
          "Perihal dan jumlah (RM) diperlukan. Contoh jumlah: 120, 120.50.",
          "说明和金额（RM）必填。金额写法：120、120.50。",
          "Description and amount (RM) are required. Amount examples: 120, 120.50.",
        ),
      );
      return;
    }
    setSaving(true);
    try {
      const input = {
        clientId,
        description: description.trim(),
        amountCents: cents,
        category,
        spentAtIso: date || today,
        source,
      };
      if (mode === "record") {
        sayOutcome(
          await recordExpense(input),
          t("Direkodkan dalam buku perbelanjaan.", "已记进开支簿。", "Recorded in the expense book."),
        );
      } else {
        sayOutcome(
          await submitClaim(input),
          t(
            "Tuntutan dihantar. Statusnya sentiasa di halaman ini — datang semula untuk melihatnya (tiada notifikasi buat masa ini).",
            "报销交上去了。状态就在这一页 —— 之后上来看就行（目前不会另外通知）。",
            "Claim submitted. Its status lives on this page — come back to check it (no notifications yet).",
          ),
        );
      }
    } finally {
      setSaving(false);
    }
  }

  // --- deciding (treasurer) -------------------------------------------------
  const [decideBusy, setDecideBusy] = useState<number | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function decide(id: number, decision: "approve" | "reject" | "mark_paid", reason?: string) {
    setDecideError(null);
    setDecideBusy(id);
    try {
      const result = await decideClaim({ expenseId: id, decision, rejectReason: reason });
      if (result.ok) {
        setRejecting(null);
        setRejectReason("");
        void refresh();
        return;
      }
      setDecideError(
        result.reason === "conflict"
          ? t(
              "Tuntutan ini sudah diputuskan oleh orang lain — senarai dimuat semula.",
              "这张报销已经被别人处理过了 —— 清单已刷新。",
              "This claim was already decided by someone else — the list has been refreshed.",
            )
          : result.reason === "invalid" && decision === "reject"
            ? t(
                "Tulis sebab penolakan — orang itu perlu tahu kenapa.",
                "请写退回的理由 —— 交的人需要知道为什么。",
                "Write the reason for rejecting — the person needs to know why.",
              )
            : t(
                "Tidak berjaya — tiada apa-apa diubah. Cuba lagi.",
                "没有成功 —— 什么都没改。请再试一次。",
                "It did not go through — nothing changed. Try again.",
              ),
      );
      if (result.reason === "conflict") void refresh();
    } finally {
      setDecideBusy(null);
    }
  }

  const pending = (rows ?? []).filter((r) => r.status === "submitted");
  const approvedUnpaid = (rows ?? []).filter((r) => r.status === "approved");
  const mine = (rows ?? []).filter((r) => r.mine);

  return (
    <div className="flex flex-col gap-6">
      {loadIssue === "db_behind" && (
        <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Bahagian perbelanjaan menunggu kemas kini pangkalan data (migration 25). Tiada apa-apa hilang — halaman ini mula berfungsi sebaik sahaja ia dijalankan."
            zh="开支这一区在等数据库更新（migration 25）。什么都不会丢 —— 那支 migration 跑完，这一页就能用了。"
            en="The expenses area is waiting for a database update (migration 25). Nothing is lost — this page starts working the moment it is applied."
          />
        </p>
      )}

      {/* --- record / claim ---------------------------------------------- */}
      {submitter && (
        <PageSection
          titleBm={mode === "record" ? "Rekod perbelanjaan" : "Hantar tuntutan (claim)"}
          titleZh={mode === "record" ? "记开支" : "交报销（Claim）"}
          titleEn={mode === "record" ? "Record spending" : "Submit a claim"}
          summary={
            mode === "record" ? (
              <Tri
                bm="Wang yang pertubuhan sendiri bayar — bil, sewa, perbelanjaan acara."
                zh="社团自己付出去的钱 —— 账单、租金、活动开支。"
                en="Money the society itself paid — bills, rent, event spending."
              />
            ) : (
              <Tri
                bm="Anda bayar dahulu untuk pertubuhan? Hantar di sini; bendahari meluluskan dan membayar balik. Status sentiasa di halaman ini."
                zh="替社团垫了钱？在这里交上去，财政批准后付还。状态就在这一页，随时上来看。"
                en="Paid for the society out of pocket? Submit it here; the treasurer approves and pays you back. The status lives on this page."
              />
            )
          }
        >
          <div className="flex flex-col gap-4">
            {decider && (
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={mode === "record" ? "default" : "outline"}
                    onClick={() => setMode("record")}
                  >
                    <Tri bm="Perbelanjaan pertubuhan" zh="社团开支" en="Society spending" />
                  </Button>
                  <Button
                    variant={mode === "claim" ? "default" : "outline"}
                    onClick={() => setMode("claim")}
                  >
                    <Tri bm="Tuntutan saya sendiri" zh="我自己的报销" en="My own claim" />
                  </Button>
                </div>
                {/* B-8 (J #9): the difference, in one plain sentence. */}
                <p className="text-sm text-muted-foreground">
                  <Tri
                    bm="Anda keluarkan wang sendiri untuk pertubuhan dan mahu dituntut balik → “Tuntutan saya sendiri”. Pertubuhan yang bayar terus → “Perbelanjaan pertubuhan”."
                    zh="帮社团垫了钱、要跟社团拿回来 → 用「我自己的报销」；社团直接付的 → 用「社团开支」。"
                    en="You paid out of your own pocket and want it back → “My own claim”. The society paid directly → “Society spending”."
                  />
                </p>
              </div>
            )}

            {/* B-5④: the photo that came over from the ledger page. */}
            {handedPhoto && (
              <div className="flex flex-col gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                <p className="font-medium">
                  📷{" "}
                  <Tri
                    bm={`Gambar dari halaman lejar dibawa ke sini: ${handedPhoto.name}`}
                    zh={`刚才在读账页选「这是开支」的那张照片带过来了：${handedPhoto.name}`}
                    en={`The photo from the ledger page came along: ${handedPhoto.name}`}
                  />
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={reading}
                    onClick={() => {
                      const file = handedPhoto;
                      setHandedPhoto(null);
                      void readReceipt(file);
                    }}
                  >
                    <Tri
                      bm="Baca resit ini (1 tindakan AI)"
                      zh="读取这张单据（用 1 次 AI 额度）"
                      en="Read this receipt (1 AI action)"
                    />
                  </Button>
                  <Button variant="ghost" onClick={() => setHandedPhoto(null)}>
                    <Tri bm="Tidak perlu" zh="不用了" en="No need" />
                  </Button>
                </div>
              </div>
            )}

            {/* Photo first (the eROSES law): the receipt in the hand beats
                seven fields. Cost said ON the button. */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-4">
              <label
                className={`inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground shadow hover:bg-primary/90 ${
                  reading ? "pointer-events-none opacity-70" : ""
                }`}
              >
                {reading ? (
                  <>⏳ <Tri bm="AI sedang membaca…" zh="AI 读取中…" en="AI is reading…" /></>
                ) : (
                  <>📷 <Tri bm="Ambil gambar resit (1 tindakan AI)" zh="拍收据/发票（用 1 次 AI 额度）" en="Photograph the receipt (1 AI action)" /></>
                )}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  disabled={reading}
                  onChange={(e) => {
                    void readReceipt(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="text-sm text-muted-foreground">
                {mode === "claim" ? (
                  /* B-8: a claim WANTS its receipt attached — say so here,
                     at the entrance, not in a help page. */
                  <Tri
                    bm="Tuntutan lebih mudah diluluskan dengan resitnya — ambil gambar di sini dan AI mengisi borang untuk anda. Atau taip sendiri di bawah (percuma, ditanda “manual”)."
                    zh="报销附上单据更容易批 —— 在这里拍下收据，AI 会帮你把表格填好。也可以直接在下面打字（免费，会标「手动」）。"
                    en="A claim is easier to approve with its receipt — photograph it here and the AI fills the form for you. Or just type below (free, tagged “manual”)."
                  />
                ) : (
                  <Tri
                    bm="Atau taip sendiri di bawah — percuma, ditanda “manual”."
                    zh="或者直接在下面打字 —— 免费，会标「手动」。"
                    en="Or just type below — free, tagged “manual”."
                  />
                )}
              </span>
            </div>
            {readNote && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                {readNote}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-base font-semibold">
                  <Tri bm="Perihal" zh="说明（买了什么/付了什么）" en="Description" />
                </span>
                <span className="flex items-center gap-1">
                  <input
                    className={inputClass}
                    value={description}
                    placeholder={t("cth: Cat dinding dewan", "例：礼堂墙漆", "e.g. paint for the hall")}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <VoiceButton
                    onText={(text) =>
                      setDescription((d) => (d.trim() ? `${d.trim()} ${text}` : text))
                    }
                  />
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri bm="Jumlah (RM)" zh="金额 (RM)" en="Amount (RM)" />
                </span>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  placeholder="120.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri bm="Kategori" zh="类别" en="Category" />
                </span>
                <select
                  className={inputClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {t(c.bm, c.zh, c.en)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  <Tri bm="Tarikh" zh="日期" en="Date" />
                </span>
                <input
                  type="date"
                  className={inputClass}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            </div>

            {formError && (
              <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
                {formError}
              </p>
            )}
            {formNotice && (
              <p className="rounded-xl border-2 border-green-400 bg-green-50 p-3 text-base font-medium text-green-900 dark:bg-green-400/10 dark:text-green-100">
                ✓ {formNotice}
              </p>
            )}

            <Button size="lg" className="self-start" onClick={() => void save()} disabled={saving}>
              {saving ? (
                <Tri bm="Menyimpan…" zh="保存中…" en="Saving…" />
              ) : mode === "record" ? (
                <Tri bm="Rekodkan" zh="记进开支簿" en="Record it" />
              ) : (
                <Tri bm="Hantar tuntutan" zh="交上去" en="Submit the claim" />
              )}
            </Button>
          </div>
        </PageSection>
      )}

      {/* --- the treasurer's pending list --------------------------------- */}
      {decider && (pending.length > 0 || approvedUnpaid.length > 0) && (
        <PageSection
          titleBm="Menunggu keputusan anda"
          titleZh="等您处理"
          titleEn="Waiting on you"
          summary={
            <Tri
              bm="Tuntutan ahli: luluskan atau tolak (dengan sebab), kemudian tanda sudah dibayar."
              zh="成员的报销：批准或退回（要写理由），付了钱之后标「已付款」。"
              en="Members' claims: approve or reject (with a reason), then mark them paid."
            />
          }
        >
          <div className="flex flex-col gap-3">
            {decideError && (
              <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
                {decideError}
              </p>
            )}
            {[...pending, ...approvedUnpaid].map((r) => (
              <div key={r.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{r.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.claimantName ?? "—"} · {r.category ?? "—"} · {r.spentAtIso ?? "—"}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatRm(r.amountCents)}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={STATUS_BADGE[r.status].cls}>
                    <Tri {...STATUS_BADGE[r.status]} />
                  </Badge>
                  {r.status === "submitted" && (
                    <>
                      <Button
                        size="sm"
                        disabled={decideBusy === r.id}
                        onClick={() => void decide(r.id, "approve")}
                      >
                        ✓ <Tri bm="Luluskan" zh="批准" en="Approve" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={decideBusy === r.id}
                        onClick={() => {
                          setRejecting(rejecting === r.id ? null : r.id);
                          setRejectReason("");
                        }}
                      >
                        <Tri bm="Tolak…" zh="退回…" en="Reject…" />
                      </Button>
                    </>
                  )}
                  {r.status === "approved" && (
                    <Button
                      size="sm"
                      disabled={decideBusy === r.id}
                      onClick={() => void decide(r.id, "mark_paid")}
                    >
                      💸 <Tri bm="Tanda sudah dibayar" zh="标「已付款」" en="Mark paid" />
                    </Button>
                  )}
                </div>
                {rejecting === r.id && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      className={`${inputClass} max-w-md`}
                      value={rejectReason}
                      placeholder={t(
                        "Sebab penolakan (wajib)",
                        "退回理由（必填）",
                        "Reason for rejecting (required)",
                      )}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-700"
                      disabled={decideBusy === r.id}
                      onClick={() => void decide(r.id, "reject", rejectReason)}
                    >
                      <Tri bm="Sahkan tolak" zh="确认退回" en="Confirm reject" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </PageSection>
      )}

      {/* --- my claims ----------------------------------------------------- */}
      {submitter && !decider && mine.length > 0 && (
        <PageSection
          titleBm="Tuntutan saya"
          titleZh="我的报销"
          titleEn="My claims"
          summary={
            <Tri
              bm="Status setiap tuntutan anda. Tiada notifikasi buat masa ini — datang semula ke halaman ini untuk melihatnya."
              zh="您每一张报销的状态。目前不会另外通知 —— 上来这一页看就行。"
              en="The status of each of your claims. No notifications yet — come back to this page to check."
            />
          }
        >
          <div className="flex flex-col gap-2">
            {mine.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div>
                  <p className="font-medium">{r.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.spentAtIso ?? "—"} · {formatRm(r.amountCents)}
                  </p>
                  {r.status === "rejected" && r.rejectReason && (
                    <p className="mt-1 text-sm font-medium text-red-800 dark:text-red-300">
                      <Tri bm="Sebab" zh="理由" en="Reason" />: {r.rejectReason}
                    </p>
                  )}
                  <ClaimProgress status={r.status} />
                </div>
                <Badge variant="outline" className={STATUS_BADGE[r.status].cls}>
                  <Tri {...STATUS_BADGE[r.status]} />
                </Badge>
              </div>
            ))}
          </div>
        </PageSection>
      )}

      {/* --- the book ------------------------------------------------------ */}
      <PageSection
        titleBm="Buku perbelanjaan"
        titleZh="开支簿"
        titleEn="The expense book"
        summary={
          <Tri
            bm="Semua perbelanjaan pertubuhan, terbaru dahulu. Jumlah dikira oleh kod, bukan AI."
            zh="社团的全部开支，最新的在上面。加总由程序算，不是 AI。"
            en="All of the society's spending, newest first. Sums are computed by code, never AI."
          />
        }
      >
        {rows === null ? (
          <p className="text-base text-muted-foreground">
            <Tri bm="Memuatkan…" zh="载入中…" en="Loading…" />
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed p-4 text-base text-muted-foreground">
            {loadIssue === null ? (
              <Tri
                bm="Belum ada perbelanjaan direkodkan."
                zh="还没有记录任何开支。"
                en="No spending recorded yet."
              />
            ) : (
              <Tri
                bm="Senarai tidak dapat dimuatkan sekarang."
                zh="目前载入不了清单。"
                en="The list could not be loaded right now."
              />
            )}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div>
                  <p className="font-medium">
                    {r.description}
                    {r.source === "manual" && (
                      <Badge variant="outline" className="ml-2 border-slate-300 bg-slate-100 text-slate-700">
                        <Tri bm="manual" zh="手动" en="manual" />
                      </Badge>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {r.category ?? "—"} · {r.spentAtIso ?? "—"}
                    {r.claimantName ? ` · ${r.claimantName}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={STATUS_BADGE[r.status].cls}>
                    <Tri {...STATUS_BADGE[r.status]} />
                  </Badge>
                  <span className="font-semibold tabular-nums">{formatRm(r.amountCents)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
