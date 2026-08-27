"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import { Tri, useTriText } from "@/components/language-provider";
import { PageSection } from "@/components/page-section";
import { Req } from "@/components/required-mark";
import { collectorBalances, type RemittanceBatch } from "@/lib/custody";
import { holdsCash, type RegisterDonation } from "@/lib/receipts";
import { formatMytDateTime, todayIsoMalaysia } from "@/lib/history";
import { formatRm } from "@/lib/minutes-draft";
import { useRegister } from "./register-store";

// ---------------------------------------------------------------------------
// /money/custody — the CASH CUSTODY RECORD, redone per 拍板 0-6 (work order
// 32 §1-6, J's biggest launch-day complaint).
//
// What was wrong: the page's headline total counted UNRECEIPTED cash while
// the hand-over button only saw RECEIPTED cash — so it said "RM160 in hand"
// and "no cash is sitting in anyone's hands" at the same time. And the only
// action was "hand over EVERYTHING", one tap, dated today, uneditable.
//
// Now: one register of every cash row with its own status; tick the rows
// actually being handed over; a dialog shows the itemised list, the total,
// an editable hand-over date (people record later than they hand over) and
// who carried it; a pending batch can have its date/note edited or be
// cancelled until HQ confirms; after that it is locked forever.
//
// 口徑 (0-6 #5): "in hand" counts ONLY receipted, still-collected cash —
// the money that can actually be handed over. Unreceipted rows are listed
// (not tickable) with their own line and a door to the receipts page.
//
// Bank transfers never appear here (D19); goods never appear (D-1).
// The donations state machine stays forward-only; cancelling a batch voids
// a RECORD, not money (see lib/custody.ts).
// ---------------------------------------------------------------------------

type RowStatus = "handable" | "unreceipted" | "waiting_hq" | "settled";

function rowStatus(d: RegisterDonation): RowStatus {
  if (d.custodyStatus === "settled") return "settled";
  if (d.custodyStatus === "pending_remittance") return "waiting_hq";
  return d.receiptNo === null ? "unreceipted" : "handable";
}

const STATUS_BADGE: Record<RowStatus, { cls: string; bm: string; zh: string; en: string }> = {
  handable: {
    cls: "border-amber-300 bg-amber-100 text-amber-900",
    bm: "Di tangan — boleh diserah",
    zh: "在手上，可交",
    en: "In hand — can be handed over",
  },
  unreceipted: {
    cls: "border-red-300 bg-red-50 text-red-900",
    bm: "Belum ada resit",
    zh: "还没开收据",
    en: "No receipt yet",
  },
  waiting_hq: {
    cls: "border-blue-300 bg-blue-100 text-blue-900",
    bm: "Diserah — tunggu HQ",
    zh: "已交出，等总会",
    en: "Handed over — waiting for HQ",
  },
  settled: {
    cls: "border-green-300 bg-green-100 text-green-800",
    bm: "Disahkan HQ",
    zh: "总会已确认",
    en: "Confirmed by HQ",
  },
};

export function CashCustody() {
  const t = useTriText();
  const {
    donations,
    batches,
    registerCollector,
    handOverSelected,
    updateBatch,
    cancelBatch,
    hqConfirm,
    custodyLocalOnly,
    error,
  } = useRegister();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"list" | "card">("list");
  const [dialogOpen, setDialogOpen] = useState(false);
  // Dialog fields (拍板 0-6: date editable — no network on collection day).
  const [dateIso, setDateIso] = useState(todayIsoMalaysia());
  const [carrier, setCarrier] = useState(registerCollector);
  const [note, setNote] = useState("");

  // Every physical-cash row, whatever its stage — this page IS that record.
  const cashRows = useMemo(() => donations.filter(holdsCash), [donations]);
  const handable = useMemo(
    () => cashRows.filter((d) => rowStatus(d) === "handable"),
    [cashRows],
  );
  const unreceipted = useMemo(
    () => cashRows.filter((d) => rowStatus(d) === "unreceipted"),
    [cashRows],
  );
  // 口徑 (0-6 #5): "in hand" = money that can actually be handed over.
  const handableCents = handable.reduce((s, d) => s + d.amountCents, 0);
  const unreceiptedCents = unreceipted.reduce((s, d) => s + d.amountCents, 0);
  // Per-collector balances over RECEIPTED rows only — same 口徑 as the list,
  // so the two can never contradict each other again (§1-6 真相).
  const balances = useMemo(
    () => collectorBalances(donations.filter((d) => d.receiptNo !== null)),
    [donations],
  );

  const chosen = handable.filter((d) => selected.has(d.id));
  const chosenCents = chosen.reduce((s, d) => s + d.amountCents, 0);

  const pending = batches.filter((b) => b.status === "pending");
  const settled = batches.filter((b) => b.status === "settled");
  const cancelled = batches.filter((b) => b.status === "cancelled");

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openDialog = () => {
    setDateIso(todayIsoMalaysia());
    setCarrier(chosen[0]?.collector ?? registerCollector);
    setNote("");
    setDialogOpen(true);
  };

  const confirmHandOver = () => {
    if (chosen.length === 0 || !dateIso || !carrier.trim()) return;
    handOverSelected(
      chosen.map((d) => d.id),
      { dateIso, collector: carrier.trim(), note },
    );
    setSelected(new Set());
    setDialogOpen(false);
  };

  return (
    <PageSection
      titleBm="Rekod simpanan tunai"
      titleZh="现金保管记录"
      titleEn="Cash custody record"
      summary={
        handableCents > 0 ? (
          <Tri
            bm={`${formatRm(handableCents)} tunai beresit sedia diserahkan kepada HQ.`}
            zh={`${formatRm(handableCents)} 已开收据的现金在手上，可交给总会。`}
            en={`${formatRm(handableCents)} in receipted cash is in hand, ready to hand to HQ.`}
          />
        ) : (
          <Tri
            bm="Siapa memegang berapa tunai, serahan mana menunggu pengesahan HQ — supaya tiada wang hilang di tengah jalan. Pindahan bank tidak melalui halaman ini."
            zh="谁手上有多少现金、哪笔交接还在等总会确认 —— 避免中间不见钱。转账不经过这一页。"
            en="Who is holding how much cash, and which hand-overs await HQ's confirmation — so no money goes missing in between. Bank transfers never pass through this page."
          />
        )
      }
    >
      {/* A hand-over is one person's claim that they gave money to another
          person. It is worth what the record BOTH of them can see — so if it
          only reached this device, that has to be on screen, not swallowed. */}
      {custodyLocalOnly && (
        <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Perubahan ini tercatat pada peranti ini sahaja — ia belum sampai ke rekod pertubuhan, jadi HQ tidak dapat melihatnya lagi. Pilih pertubuhan anda, atau buka halaman ini semula apabila ada talian."
            zh="这次改动只记在这台设备上 —— 还没有进到机构的记录里，所以总会那边看不到。请选好您的机构，或者等有网络时再打开这一页一次。"
            en="This change is recorded on this device only — it has not reached the organisation's records, so HQ cannot see it yet. Choose your organisation, or open this page again when you have a signal."
          />
        </p>
      )}
      {error && (
        <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base text-red-900">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-5">
        {/* How cash moves — a legend, not steps of a form. */}
        <div className="flex flex-col gap-2 rounded-sm border bg-muted/30 p-4 sm:flex-row sm:items-center sm:gap-3">
          <span className="rounded-md bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">
            <Tri bm="Tunai di tangan pemungut" zh="钱在收款人手上" en="Cash with collector" />
          </span>
          <span className="hidden text-muted-foreground sm:inline">→</span>
          <span className="rounded-md bg-blue-100 px-3 py-1 text-sm font-medium text-blue-900">
            <Tri bm="Diserah, tunggu HQ" zh="已交出，等待总会" en="Handed over, waiting for HQ" />
          </span>
          <span className="hidden text-muted-foreground sm:inline">→</span>
          <span className="rounded-md bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
            <Tri bm="Disahkan HQ" zh="总会已确认" en="Confirmed by HQ" />
          </span>
        </div>

        {/* THE PER-ITEM REGISTER (拍板 0-6): every cash row, its own status,
            tick the ones being handed over. */}
        <div className="flex flex-col gap-3 rounded-sm border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-semibold">
              <Tri bm="Tunai, sekeping demi sekeping" zh="现金逐笔" en="Cash, row by row" />
            </p>
            <div className="flex items-center gap-1 rounded-sm border p-0.5 text-sm">
              <button
                type="button"
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  view === "list" ? "bg-[color:var(--v2-primary-soft)]" : "text-muted-foreground"
                }`}
              >
                <Tri bm="Senarai" zh="列表" en="List" />
              </button>
              <button
                type="button"
                onClick={() => setView("card")}
                aria-pressed={view === "card"}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  view === "card" ? "bg-[color:var(--v2-primary-soft)]" : "text-muted-foreground"
                }`}
              >
                <Tri bm="Kad" zh="卡片" en="Cards" />
              </button>
            </div>
          </div>

          {cashRows.length === 0 ? (
            <p className="rounded-md border-2 border-dashed p-4 text-base text-muted-foreground">
              <Tri
                bm="Tiada tunai dalam rekod lagi. Derma tunai akan muncul di sini, sekeping demi sekeping."
                zh="记录里还没有现金。现金捐款会逐笔出现在这里。"
                en="No cash on record yet. Cash donations appear here, row by row."
              />
            </p>
          ) : view === "list" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="w-10 px-2 py-2" aria-label={t("Pilih", "选择", "Select")} />
                    <th className="px-2 py-2"><Tri bm="Resit" zh="收据号" en="Receipt" /></th>
                    <th className="px-2 py-2"><Tri bm="Penderma" zh="捐款人" en="Donor" /></th>
                    <th className="px-2 py-2 text-right"><Tri bm="Jumlah" zh="金额" en="Amount" /></th>
                    <th className="px-2 py-2"><Tri bm="Tarikh kutip" zh="收款日期" en="Collected" /></th>
                    <th className="px-2 py-2"><Tri bm="Status" zh="状态" en="Status" /></th>
                  </tr>
                </thead>
                <tbody>
                  {cashRows.map((d) => (
                    <CashRowTr key={d.id} d={d} selected={selected.has(d.id)} onToggle={toggle} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {cashRows.map((d) => (
                <CashRowCard key={d.id} d={d} selected={selected.has(d.id)} onToggle={toggle} />
              ))}
            </div>
          )}

          {/* 口徑 (0-6 #5): one honest pair of numbers. */}
          <div className="flex flex-col gap-1 rounded-md bg-muted/40 p-3 text-base">
            <p>
              <Tri bm="Di tangan (boleh diserah)" zh="手上（可交）" en="In hand (can be handed over)" />
              {": "}
              <span className="font-semibold">{formatRm(handableCents)}</span>
            </p>
            {unreceipted.length > 0 && (
              <p className="text-muted-foreground">
                <Tri
                  bm={`${unreceipted.length} lagi (${formatRm(unreceiptedCents)}) belum ada resit — belum boleh diserah.`}
                  zh={`另有 ${unreceipted.length} 笔（${formatRm(unreceiptedCents)}）未开收据 —— 还不能交。`}
                  en={`${unreceipted.length} more (${formatRm(unreceiptedCents)}) have no receipt yet — cannot be handed over.`}
                />{" "}
                <Link href="/money/receipts" className="font-medium underline underline-offset-4">
                  <Tri bm="Pergi jana resit" zh="去开收据" en="Go issue receipts" /> →
                </Link>
              </p>
            )}
          </div>

          <Button
            size="lg"
            className="self-start text-base"
            disabled={chosen.length === 0}
            onClick={openDialog}
          >
            <Tri
              bm={`Rekod serahan ${chosen.length} keping (${formatRm(chosenCents)})`}
              zh={`记录交接 ${chosen.length} 笔（${formatRm(chosenCents)}）`}
              en={`Record hand-over of ${chosen.length} row(s) (${formatRm(chosenCents)})`}
            />
          </Button>
        </div>

        {/* WHO IS HOLDING HOW MUCH — receipted rows only, same 口徑 as above. */}
        {balances.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {balances.map((b) => (
              <div key={b.collector} className="rounded-sm border p-4">
                <p className="font-medium">{b.collector}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-amber-50 p-2">
                    <div className="text-sm text-muted-foreground">
                      <Tri bm="Di tangan" zh="手上" en="In hand" />
                    </div>
                    <div className="font-semibold tabular-nums">{formatRm(b.collectedCents)}</div>
                  </div>
                  <div className="rounded-md bg-blue-50 p-2">
                    <div className="text-sm text-muted-foreground">
                      <Tri bm="Tunggu HQ" zh="等待总会" en="Waiting HQ" />
                    </div>
                    <div className="font-semibold tabular-nums">{formatRm(b.pendingCents)}</div>
                  </div>
                  <div className="rounded-md bg-green-50 p-2">
                    <div className="text-sm text-muted-foreground">
                      <Tri bm="Selesai" zh="已完成" en="Done" />
                    </div>
                    <div className="font-semibold tabular-nums">{formatRm(b.settledCents)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* WAITING FOR HQ: editable + cancellable until the tick (拍板 0-6). */}
        {pending.map((batch) => (
          <PendingBatchCard
            key={batch.id}
            batch={batch}
            onConfirm={() => hqConfirm(batch.id)}
            onUpdate={(patch) => updateBatch(batch.id, patch)}
            onCancel={() => cancelBatch(batch.id)}
          />
        ))}

        {/* THE HISTORY: locked forever once HQ confirmed. */}
        {settled.map((batch) => (
          <div
            key={batch.id}
            className="rounded-sm border border-green-300 bg-green-50 p-4 text-base"
          >
            <div className="font-medium">
              ✅ {t("HQ sudah sahkan wang ini", "总会已确认这笔钱", "HQ has confirmed this money")}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {batch.collector} · {t("diserah", "交接日期", "handed over")} {batch.handedOverAtIso} ·{" "}
              {t("jumlah", "金额", "total")} {formatRm(batch.totalCents)} ·{" "}
              {t("resit", "收据", "receipts")} {batch.receiptNos.join(", ")}
              {batch.note ? ` · ${batch.note}` : ""}
            </div>
            {/* §1-11: all four moments of a ringgit are on record — this card
                carries the last two. */}
            <div className="mt-1 text-sm text-muted-foreground">
              {batch.recordedAtIso
                ? `${t("direkod", "记录于", "recorded")} ${formatMytDateTime(batch.recordedAtIso)} · `
                : ""}
              {t("disahkan", "确认于", "confirmed")}{" "}
              {batch.confirmedAtIso ? formatMytDateTime(batch.confirmedAtIso) : "—"}
              {batch.confirmedByHq
                ? ` · ${t("oleh", "确认人", "by")} ${batch.confirmedByHq}`
                : ""}
            </div>
          </div>
        ))}

        {/* Voided records stay on file — an audit trail nobody can quietly
            empty (拍板 0-6). */}
        {cancelled.map((batch) => (
          <div
            key={batch.id}
            className="rounded-sm border border-dashed p-4 text-base text-muted-foreground"
          >
            <div className="font-medium">
              ✖ {t("Serahan dibatalkan", "已取消的交接记录", "Hand-over cancelled")}
            </div>
            <div className="mt-1 text-sm">
              {batch.collector} · {batch.handedOverAtIso} ·{" "}
              {t("jumlah", "金额", "total")} {formatRm(batch.totalCents)} ·{" "}
              {t("resit", "收据", "receipts")} {batch.receiptNos.join(", ")}
              {batch.note ? ` · ${batch.note}` : ""}
            </div>
          </div>
        ))}
      </div>

      {/* THE HAND-OVER DIALOG (拍板 0-6): itemised list + total + editable
          date + who carries it. Nothing moves until the confirm button. */}
      <Modal open={dialogOpen} onClose={() => setDialogOpen(false)} labelledBy="handover-title" wide>
        <div className="flex flex-col gap-4">
          <h2 id="handover-title" className="text-xl font-semibold">
            <Tri bm="Rekod serahan tunai" zh="记录这次交接" en="Record this hand-over" />
          </h2>
          <ul className="flex flex-col gap-1 rounded-sm border p-3 text-base">
            {chosen.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  <span className="font-mono text-sm">{d.receiptNo}</span> · {d.donorName}
                </span>
                <span className="tabular-nums">{formatRm(d.amountCents)}</span>
              </li>
            ))}
            <li className="mt-1 flex justify-between border-t pt-2 font-semibold">
              <span>
                <Tri bm="Jumlah" zh="合计" en="Total" />
              </span>
              <span className="tabular-nums">{formatRm(chosenCents)}</span>
            </li>
          </ul>
          <label className="flex flex-col gap-1">
            <span className="text-base font-semibold">
              <Tri bm="Tarikh serahan" zh="交接日期" en="Hand-over date" />
              <Req />
            </span>
            <span className="text-sm text-muted-foreground">
              <Tri
                bm="Boleh ditukar — orang selalu merekod kemudian daripada menyerah."
                zh="可以改 —— 交钱当天不一定有网络，之后补记也要写真实日期。"
                en="Editable — people often record later than they hand over."
              />
            </span>
            <input
              type="date"
              value={dateIso}
              onChange={(e) => setDateIso(e.target.value)}
              className="w-fit rounded-md border border-input bg-background px-3 py-2 text-base"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-base font-semibold">
              <Tri bm="Siapa yang menyerah" zh="经手人" en="Who hands it over" />
              <Req />
            </span>
            <input
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-base"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-base font-semibold">
              <Tri bm="Catatan" zh="备注" en="Note" />
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("cth: kiraan malam pesta", "例：庙会晚上点算", "e.g. festival night count")}
              className="rounded-md border border-input bg-background px-3 py-2 text-base"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              className="text-base"
              disabled={!dateIso || !carrier.trim()}
              onClick={confirmHandOver}
            >
              ✓{" "}
              <Tri
                bm={`Sahkan serahan ${formatRm(chosenCents)}`}
                zh={`确认交接 ${formatRm(chosenCents)}`}
                en={`Confirm hand-over of ${formatRm(chosenCents)}`}
              />
            </Button>
            <Button size="lg" variant="ghost" className="text-base" onClick={() => setDialogOpen(false)}>
              <Tri bm="Batal" zh="取消" en="Cancel" />
            </Button>
          </div>
        </div>
      </Modal>
    </PageSection>
  );
}

// --- row renderers -----------------------------------------------------------

function RowBadge({ d }: { d: RegisterDonation }) {
  const s = STATUS_BADGE[rowStatus(d)];
  return (
    <Badge variant="outline" className={s.cls}>
      <Tri bm={s.bm} zh={s.zh} en={s.en} />
    </Badge>
  );
}

function RowTimes({ d }: { d: RegisterDonation }) {
  return (
    <>
      {d.donatedAtIso}
      {/* §1-11: the record moment, where it exists. */}
      {d.createdAtIso && (
        <span className="block text-xs text-muted-foreground">
          <Tri bm="direkod" zh="记录于" en="recorded" /> {formatMytDateTime(d.createdAtIso)}
        </span>
      )}
    </>
  );
}

function UnreceiptedHint() {
  return (
    <span className="block text-xs">
      <Tri
        bm="Jana resit dahulu sebelum diserah"
        zh="先开收据才能交"
        en="Issue the receipt before handing over"
      />{" "}
      →{" "}
      <Link href="/money/receipts" className="underline underline-offset-4">
        <Tri bm="pergi" zh="去开收据" en="go" />
      </Link>
    </span>
  );
}

function CashRowTr({
  d,
  selected,
  onToggle,
}: {
  d: RegisterDonation;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const status = rowStatus(d);
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-2 py-2">
        {status === "handable" && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(d.id)}
            aria-label={`${d.receiptNo} ${d.donorName}`}
            className="h-5 w-5 accent-[color:var(--v2-primary)]"
          />
        )}
      </td>
      <td className="px-2 py-2 font-mono text-sm">{d.receiptNo ?? "—"}</td>
      <td className="px-2 py-2 font-medium">{d.donorName}</td>
      <td className="px-2 py-2 text-right font-semibold tabular-nums">
        {formatRm(d.amountCents)}
      </td>
      <td className="px-2 py-2 text-sm tabular-nums">
        <RowTimes d={d} />
      </td>
      <td className="px-2 py-2">
        <RowBadge d={d} />
        {status === "unreceipted" && <UnreceiptedHint />}
      </td>
    </tr>
  );
}

function CashRowCard({
  d,
  selected,
  onToggle,
}: {
  d: RegisterDonation;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const status = rowStatus(d);
  return (
    <div className={`rounded-sm border p-3 ${selected ? "border-[color:var(--v2-primary)]" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{d.donorName}</p>
          <p className="font-mono text-sm text-muted-foreground">{d.receiptNo ?? "—"}</p>
        </div>
        {status === "handable" && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(d.id)}
            aria-label={`${d.receiptNo} ${d.donorName}`}
            className="mt-1 h-5 w-5 accent-[color:var(--v2-primary)]"
          />
        )}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{formatRm(d.amountCents)}</p>
      <p className="text-sm tabular-nums text-muted-foreground">
        <RowTimes d={d} />
      </p>
      <div className="mt-2">
        <RowBadge d={d} />
        {status === "unreceipted" && <UnreceiptedHint />}
      </div>
    </div>
  );
}

// --- the pending batch card --------------------------------------------------

function PendingBatchCard({
  batch,
  onConfirm,
  onUpdate,
  onCancel,
}: {
  batch: RemittanceBatch;
  onConfirm: () => void;
  onUpdate: (patch: { handedOverAtIso?: string; note?: string | null }) => void;
  onCancel: () => void;
}) {
  const t = useTriText();
  const [editing, setEditing] = useState(false);
  const [dateIso, setDateIso] = useState(batch.handedOverAtIso);
  const [note, setNote] = useState(batch.note ?? "");
  const [confirmCancel, setConfirmCancel] = useState(false);

  return (
    <div className="rounded-sm border border-blue-300 bg-blue-50 p-4 text-base dark:bg-blue-400/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">
            ⏳ {t("Menunggu HQ sahkan", "等待总会确认", "Waiting for HQ to confirm")}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {batch.collector} · {t("diserah", "交接日期", "handed over")} {batch.handedOverAtIso} ·{" "}
            {t("jumlah", "金额", "total")} {formatRm(batch.totalCents)} ·{" "}
            {t("resit", "收据", "receipts")} {batch.receiptNos.join(", ")}
            {batch.note ? ` · ${batch.note}` : ""}
          </div>
          {batch.recordedAtIso && (
            <div className="mt-0.5 text-sm text-muted-foreground">
              {t("direkod", "记录于", "recorded")} {formatMytDateTime(batch.recordedAtIso)}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" className="text-base" onClick={onConfirm}>
            ✓ <Tri bm="Wang sampai — sahkan" zh="钱到了 —— 确认" en="Money arrived — confirm" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="text-base"
            onClick={() => {
              setDateIso(batch.handedOverAtIso);
              setNote(batch.note ?? "");
              setEditing((v) => !v);
            }}
          >
            ✏️ <Tri bm="Ubah" zh="修改" en="Edit" />
          </Button>
        </div>
      </div>

      {/* 拍板 0-6 #4: date and note stay editable until HQ's tick. */}
      {editing && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-md bg-white/70 p-3 dark:bg-white/5">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">
              <Tri bm="Tarikh serahan" zh="交接日期" en="Hand-over date" />
            </span>
            <input
              type="date"
              value={dateIso}
              onChange={(e) => setDateIso(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-base"
            />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1">
            <span className="text-sm font-semibold">
              <Tri bm="Catatan" zh="备注" en="Note" />
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-base"
            />
          </label>
          <Button
            className="text-base"
            disabled={!dateIso}
            onClick={() => {
              onUpdate({ handedOverAtIso: dateIso, note: note.trim() ? note.trim() : null });
              setEditing(false);
            }}
          >
            <Tri bm="Simpan" zh="保存" en="Save" />
          </Button>
          {/* Cancelling is a two-tap action — it voids a money record. */}
          {confirmCancel ? (
            <span className="flex items-center gap-2">
              <span className="text-sm font-medium text-red-800">
                <Tri bm="Pasti batalkan rekod ini?" zh="确定取消这条交接记录？" en="Really cancel this record?" />
              </span>
              <Button
                variant="destructive"
                className="text-base"
                onClick={() => {
                  setConfirmCancel(false);
                  setEditing(false);
                  onCancel();
                }}
              >
                <Tri bm="Ya, batalkan" zh="是，取消" en="Yes, cancel it" />
              </Button>
              <Button variant="ghost" className="text-base" onClick={() => setConfirmCancel(false)}>
                <Tri bm="Tidak" zh="不" en="No" />
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              className="text-base text-red-700"
              onClick={() => setConfirmCancel(true)}
            >
              ✖ <Tri bm="Batalkan serahan ini" zh="取消这条交接" en="Cancel this hand-over" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
