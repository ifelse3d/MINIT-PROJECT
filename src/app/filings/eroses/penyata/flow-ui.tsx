"use client";

// Client pieces of the Penyata Tahunan flow (H2, work order 69).
//
// The RAIL mirrors the portal's own "Langkah penyata tahunan" checklist, so
// the person sees the same nine names here and there. Every link keeps the
// flow's query (?doc/?dari/?hingga) — the layout owns nothing, the URL is
// the shared state, and a refresh lands exactly where you were.
//
// §1-2 (J): a missing value is filled RIGHT HERE with a small form that
// writes to the same table the Settings/Members pages write to — the
// "go to Settings, hunt, come back" road is gone. The forms reuse those
// pages' own server actions, then router.refresh() re-reads this page.

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tri, useLocalizedError, useTriText } from "@/components/language-provider";
import { hasCjk } from "@/lib/bm-guard";
import {
  saveMaklumatAm,
  addBankAccount,
  type MaklumatActionState,
} from "@/app/settings/maklumat-actions";
import { addAuditor, type AuditorActionState } from "@/app/members/auditor-actions";
import {
  fillCommitteeErosesGaps,
  type MemberActionState,
} from "@/app/members/actions";
import {
  EROSES_COMMITTEE_FIELD_LABELS,
  type ErosesCommitteeField,
} from "@/lib/eroses-committee";

import { LANGKAH } from "./langkah-meta";

function keepQuery(searchParams: URLSearchParams): string {
  const parts: string[] = [];
  for (const k of ["doc", "dari", "hingga"]) {
    const v = searchParams.get(k);
    if (v) parts.push(`${k}=${encodeURIComponent(v)}`);
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/** The flow's own step rail — the portal's checklist, clickable. */
export function LangkahRail() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const q = keepQuery(searchParams);
  const m = /\/langkah\/(\d)/.exec(pathname);
  const current = m ? Number(m[1]) : 0;

  return (
    <nav
      aria-label="Langkah penyata tahunan"
      className="rounded-md border border-[color:var(--v2-border)] bg-[color:var(--v2-card)] p-3"
      data-probe="langkah-rail"
    >
      <div className="mb-2 text-sm font-semibold text-[color:var(--v2-primary)]">
        Langkah penyata tahunan
      </div>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <li>
          <Link
            href={`/filings/eroses/penyata${q}`}
            className={
              current === 0
                ? "font-semibold text-[color:var(--v2-primary)] underline underline-offset-4"
                : "text-muted-foreground hover:underline"
            }
          >
            ⌂ <Tri bm="Mula" zh="起点" en="Start" />
          </Link>
        </li>
        {LANGKAH.map((s) => (
          <li key={s.n}>
            <Link
              href={`/filings/eroses/penyata/langkah/${s.n}${q}`}
              className={
                current === s.n
                  ? "font-semibold text-[color:var(--v2-primary)] underline underline-offset-4"
                  : current > s.n
                    ? "text-[color:var(--v2-text)] hover:underline"
                    : "text-muted-foreground hover:underline"
              }
            >
              {current > s.n ? "✓ " : ""}
              {s.n} · {s.bm}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Previous / next step, query preserved. The LAST step closes the loop. */
export function StepNav({ n }: { n: number }) {
  const searchParams = useSearchParams();
  const q = keepQuery(searchParams);
  const prevHref =
    n <= 1 ? `/filings/eroses/penyata${q}` : `/filings/eroses/penyata/langkah/${n - 1}${q}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" data-probe="step-nav">
      <Button asChild variant="outline">
        <Link href={prevHref}>
          ← <Tri bm="Sebelumnya" zh="上一步" en="Back" />
        </Link>
      </Button>
      {n < 9 ? (
        <Button asChild>
          <Link href={`/filings/eroses/penyata/langkah/${n + 1}${q}`}>
            <Tri bm="Langkah seterusnya" zh="下一步" en="Next step" /> →
          </Link>
        </Button>
      ) : (
        <Button asChild variant="outline">
          {/* Straight to the card entry — /filings is only a redirect now. */}
          <Link href="/filings/eroses">
            ✓ <Tri bm="Selesai — kembali ke Pemfailan" zh="完成 —— 回申报页" en="Done — back to Filings" />
          </Link>
        </Button>
      )}
    </div>
  );
}

/** The meeting select on the start page — routing state, nothing local. */
export function FlowMeetingPicker({
  meetings,
  selectedId,
  basePath = "/filings/eroses/penyata",
}: {
  meetings: { id: number; label: string }[];
  selectedId: number | null;
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTriText();
  return (
    <select
      className="w-full max-w-xl rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm"
      value={selectedId ?? undefined}
      onChange={(e) => {
        const next = new URLSearchParams(searchParams.toString());
        next.set("doc", e.target.value);
        router.push(`${basePath}?${next.toString()}`);
      }}
      aria-label={t("Pilih mesyuarat", "选会议", "Pick the meeting")}
    >
      {meetings.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}

/** One value row: label → value → COPY (or the fix-it content).
 *
 *  `locked` (D44, work order 78 — J 8/30 拍板): a free-plan org sees the
 *  value but cannot take it — the copy button is the paid door and the text
 *  itself is select-none with copy/cut/context-menu intercepted, the same
 *  REAL lock §1-11 gave the old /filings page (a disabled button next to
 *  freely-selectable text was a fake lock). Demo/CONTOH orgs never get
 *  locked=true (fence state is null for them upstream). */
export function ValueRow({
  id,
  labelBm,
  labelSub,
  value,
  fix,
  mono = false,
  locked = false,
  copyBlocked = false,
}: {
  id: string;
  labelBm: string;
  labelSub?: React.ReactNode;
  /** null/"" = missing → render `fix` instead of a copy button. */
  value: string | null;
  fix?: React.ReactNode;
  mono?: boolean;
  locked?: boolean;
  /** D48 (⑦, work order 89): the HARD gate — true when this value must not
   *  ship yet (committee rows missing eROSES fields). The value stays
   *  visible but select-none, and the copy button becomes a refusal; the
   *  caller renders the gap list + fill-right-here forms beside the row. */
  copyBlocked?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const missing = value === null || value.trim() === "" || value === "—";
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-[color:var(--v2-border)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">{labelBm}</div>
          {labelSub && <div className="text-sm text-muted-foreground">{labelSub}</div>}
        </div>
        {!missing &&
          (copyBlocked ? (
            <Button size="sm" variant="outline" disabled data-probe="ajk-copy-blocked">
              🛑 <Tri bm="Salin dikunci — lengkapkan dahulu" zh="先填齐才能复制" en="Copy locked — complete it first" />
            </Button>
          ) : locked ? (
            <Button size="sm" variant="outline" disabled>
              🔒 <Tri bm="Salin (pelan berbayar)" zh="复制（付费版）" en="Copy (paid plan)" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              data-copy-id={id}
              onClick={() => {
                // clipboard blocked (insecure origin / permission) — the value
                // is still on screen and selectable, so degrade, never break.
                void navigator.clipboard
                  ?.writeText(value)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  })
                  .catch(() => {});
              }}
            >
              {copied ? (
                <>✓ <Tri bm="Disalin" zh="已复制" en="Copied" /></>
              ) : (
                <Tri bm="Salin" zh="复制" en="Copy" />
              )}
            </Button>
          ))}
      </div>
      {missing ? (
        <div className="text-base text-amber-900 dark:text-amber-100">{fix ?? "—"}</div>
      ) : copyBlocked ? (
        // Same REAL lock treatment as the fence (§1-11): a gate whose text
        // still selects freely is a fake gate.
        <span
          className={`whitespace-pre-wrap select-none ${mono ? "font-mono" : ""}`}
          onCopy={(e) => e.preventDefault()}
          onCut={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {value}
        </span>
      ) : locked ? (
        <span
          className={`whitespace-pre-wrap select-none ${mono ? "font-mono" : ""}`}
          onCopy={(e) => e.preventDefault()}
          onCut={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {value}
        </span>
      ) : (
        <div className={`whitespace-pre-wrap ${mono ? "font-mono" : ""}`}>{value}</div>
      )}
      {!missing && hasCjk(value) && (
        <div className="text-sm font-medium text-red-700 dark:text-red-300">
          🛑{" "}
          <Tri
            bm="Nilai ini masih berbahasa Cina — eROSES perlukan Bahasa Malaysia."
            zh="这一格还有华语 —— eROSES 要马来文。"
            en="This value still contains Chinese — eROSES needs Bahasa Malaysia."
          />
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-sm border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-3 py-2 text-base text-[color:var(--v2-text)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[color:var(--v2-primary)]";
const errorCls =
  "rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100";

/** Wire an action-state form to "refresh this page when it lands". */
function useRefreshOnOk(ok: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!ok) return;
    const timer = setTimeout(() => router.refresh(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok]);
}

const MAKLUMAT_INITIAL: MaklumatActionState = { ok: false, error: null };

/** §1-2: the Maklumat Am gaps, filled here — same table Settings writes. */
export function MaklumatInlineForm({
  phone,
  financialYearStart,
  membersRegistered,
  membersVoting,
}: {
  phone: string | null;
  financialYearStart: string | null;
  membersRegistered: number | null;
  membersVoting: number | null;
}) {
  const [state, formAction, pending] = useActionState(saveMaklumatAm, MAKLUMAT_INITIAL);
  const localizeError = useLocalizedError();
  useRefreshOnOk(state.ok);
  const [values, setValues] = useState({
    phone: phone ?? "",
    financialYearStart: financialYearStart ?? "",
    membersRegistered: membersRegistered === null ? "" : String(membersRegistered),
    membersVoting: membersVoting === null ? "" : String(membersVoting),
  });
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-md border border-[color:var(--v2-outline-border)] bg-black/[0.02] p-3 dark:bg-white/5"
      data-probe="maklumat-inline"
    >
      <p className="text-sm font-medium">
        ✏️{" "}
        <Tri
          bm="Isi yang kosong DI SINI — disimpan terus ke rekod pertubuhan, kemudian teruskan."
          zh="缺的就在这里填 —— 直接存进机构档案，填完接着走。"
          en="Fill the gaps RIGHT HERE — saved straight to the organisation's record, then carry on."
        />
      </p>
      <div className="grid gap-3 @2xl:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            <Tri bm="No. telefon" zh="电话" en="Phone" />
          </span>
          <input name="phone" value={values.phone} onChange={set("phone")} className={inputCls} maxLength={32} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            <Tri bm="Tahun kewangan bermula" zh="财政年度开始日" en="Financial year starts" />
          </span>
          <input
            name="financialYearStart"
            value={values.financialYearStart}
            onChange={set("financialYearStart")}
            className={inputCls}
            placeholder="2026-01-01"
            inputMode="numeric"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            <Tri bm="Bilangan ahli berdaftar" zh="注册会员数" en="Registered members" />
          </span>
          <input
            name="membersRegistered"
            value={values.membersRegistered}
            onChange={set("membersRegistered")}
            className={inputCls}
            inputMode="numeric"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            <Tri bm="Bilangan ahli layak mengundi" zh="有投票权人数" en="Voting members" />
          </span>
          <input
            name="membersVoting"
            value={values.membersVoting}
            onChange={set("membersVoting")}
            className={inputCls}
            inputMode="numeric"
          />
        </label>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Tri bm="Menyimpan…" zh="保存中…" en="Saving…" /> : <Tri bm="Simpan" zh="保存" en="Save" />}
        </Button>
      </div>
      {state.ok && (
        <p className="text-base font-medium text-green-700 dark:text-green-300">
          ✓ <Tri bm="Disimpan" zh="存好了" en="Saved" />
        </p>
      )}
      {state.error && <p className={errorCls}>{localizeError(state.error)}</p>}
    </form>
  );
}

/** §1-2: add a bank account without leaving the flow. */
export function BankInlineForm() {
  const [state, formAction, pending] = useActionState(addBankAccount, MAKLUMAT_INITIAL);
  const localizeError = useLocalizedError();
  useRefreshOnOk(state.ok);
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  useEffect(() => {
    if (!state.ok) return;
    const timer = setTimeout(() => {
      setBankName("");
      setAccountNo("");
    }, 0);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-probe="bank-inline">
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
        <span className="text-sm text-muted-foreground">
          <Tri bm="Nama bank" zh="银行名称" en="Bank name" />
        </span>
        <input
          name="bankName"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          className={inputCls}
          maxLength={120}
        />
      </label>
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
        <span className="text-sm text-muted-foreground">
          <Tri bm="No. akaun" zh="账号" en="Account no." />
        </span>
        <input
          name="accountNo"
          value={accountNo}
          onChange={(e) => setAccountNo(e.target.value)}
          className={inputCls}
          maxLength={40}
          inputMode="numeric"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? <Tri bm="…" zh="…" en="…" /> : <Tri bm="＋ Tambah akaun" zh="＋ 加户口" en="＋ Add account" />}
      </Button>
      {state.error && <p className={"w-full " + errorCls}>{localizeError(state.error)}</p>}
    </form>
  );
}

const AUDITOR_INITIAL: AuditorActionState = { ok: false, error: null };

/** §1-2: record an auditor without leaving the flow (same table as /members). */
export function AuditorInlineForm() {
  const [state, formAction, pending] = useActionState(addAuditor, AUDITOR_INITIAL);
  const localizeError = useLocalizedError();
  useRefreshOnOk(state.ok);
  const [values, setValues] = useState({ personName: "", nameOfficial: "", email: "", appointedOn: "" });
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));
  useEffect(() => {
    if (!state.ok) return;
    const timer = setTimeout(
      () => setValues({ personName: "", nameOfficial: "", email: "", appointedOn: "" }),
      0,
    );
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-md border border-[color:var(--v2-outline-border)] bg-black/[0.02] p-3 dark:bg-white/5"
      data-probe="auditor-inline"
    >
      <p className="text-sm font-medium">
        ✏️{" "}
        <Tri
          bm="Tambah juruaudit DI SINI — masuk terus ke senarai Juruaudit pertubuhan."
          zh="就在这里加审计员 —— 直接进机构的审计员名单。"
          en="Add the auditor RIGHT HERE — it goes straight onto the society's auditors list."
        />
      </p>
      <div className="grid gap-3 @2xl:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            <Tri bm="Nama" zh="姓名" en="Name" />
          </span>
          <input
            name="personName"
            value={values.personName}
            onChange={set("personName")}
            className={inputCls}
            maxLength={120}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            <Tri bm="Nama dalam IC" zh="身份证上的名字" en="Name on IC" />
          </span>
          <input
            name="nameOfficial"
            value={values.nameOfficial}
            onChange={set("nameOfficial")}
            className={inputCls}
            maxLength={160}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            <Tri bm="E-mel" zh="电邮" en="Email" />
          </span>
          <input name="email" value={values.email} onChange={set("email")} className={inputCls} maxLength={160} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            <Tri bm="Tarikh lantikan" zh="任命日期" en="Appointed on" />
          </span>
          <input
            name="appointedOn"
            value={values.appointedOn}
            onChange={set("appointedOn")}
            className={inputCls}
            placeholder="2026-01-01"
            inputMode="numeric"
          />
        </label>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Tri bm="…" zh="…" en="…" /> : <Tri bm="＋ Tambah juruaudit" zh="＋ 加审计员" en="＋ Add auditor" />}
        </Button>
      </div>
      {state.ok && (
        <p className="text-base font-medium text-green-700 dark:text-green-300">
          ✓ <Tri bm="Ditambah" zh="加好了" en="Added" />
        </p>
      )}
      {state.error && <p className={errorCls}>{localizeError(state.error)}</p>}
    </form>
  );
}

const MEMBER_INITIAL: MemberActionState = { ok: false, error: null };

/**
 * D48 (⑦, work order 89): H2's "fill one missing IC name" road, widened —
 * one small form per person, showing an input for EACH eROSES field that
 * row still lacks (name for a seeded row, IC name, state, appointment
 * date). Saves through fillCommitteeErosesGaps into the same table the
 * Members page writes; router.refresh() then re-reads the step, and when
 * the last gap closes the copy button above unlocks.
 * data-probe stays "ic-inline": probe-h2-69 walks this row by that name.
 */
export function ErosesGapInlineRow({
  id,
  personName,
  position,
  missing,
}: {
  id: number;
  personName: string;
  position: string;
  missing: ErosesCommitteeField[];
}) {
  const [state, formAction, pending] = useActionState(fillCommitteeErosesGaps, MEMBER_INITIAL);
  const localizeError = useLocalizedError();
  const t = useTriText();
  useRefreshOnOk(state.ok);
  const [values, setValues] = useState<Record<ErosesCommitteeField, string>>({
    personName: "",
    nameOfficial: "",
    state: "",
    termStart: "",
  });
  const set =
    (k: ErosesCommitteeField) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((v) => ({ ...v, [k]: e.target.value }));
  const filled = missing.every((f) => values[f].trim() !== "");

  const placeholder: Record<ErosesCommitteeField, string> = {
    personName: t("Nama", "姓名", "Name"),
    nameOfficial: "TAN TAI BENG",
    state: "Selangor",
    termStart: "2026-01-01",
  };

  return (
    <form action={formAction} className="flex flex-col gap-2" data-probe="ic-inline">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[8rem] font-medium">
          {personName.trim() !== "" ? personName : `(${position})`}
        </span>
        {missing.map((f) => (
          <label key={f} className="flex min-w-[10rem] flex-1 flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              {t(
                EROSES_COMMITTEE_FIELD_LABELS[f].bm,
                EROSES_COMMITTEE_FIELD_LABELS[f].zh,
                EROSES_COMMITTEE_FIELD_LABELS[f].en,
              )}
            </span>
            <input
              name={f}
              value={values[f]}
              onChange={set(f)}
              className={inputCls}
              maxLength={160}
              placeholder={placeholder[f]}
              inputMode={f === "termStart" ? "numeric" : undefined}
            />
          </label>
        ))}
        <Button type="submit" size="sm" disabled={pending || !filled}>
          {pending ? <Tri bm="…" zh="…" en="…" /> : <Tri bm="Simpan" zh="保存" en="Save" />}
        </Button>
      </div>
      {state.error && <p className={"w-full " + errorCls}>{localizeError(state.error)}</p>}
    </form>
  );
}

// (IcNameInlineRow retired with D48 — ErosesGapInlineRow above is the same
// road widened to every eROSES field, and carries its data-probe name.)
