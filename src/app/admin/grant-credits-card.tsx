"use client";

// K-3 (work order 27): the grant-credits form. §1-1 (work order 32): now
// trilingual like the rest of /admin — the operator is J, and J reads
// Chinese first. Internal names (the RPC, migration numbers) live in code
// comments, not on screen. The server-side RPC is the authority; this form
// is a convenience over it. (Routes through minit_admin.grant_ai_credits()
// and writes a credit_grants audit row — the ONE path, per STATE §6.)

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { Req } from "@/components/required-mark";
import { adminGrantCredits, type GrantResult } from "./actions";

export function GrantCreditsCard() {
  const t = useTriText();
  const [orgId, setOrgId] = useState("");
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reasonText: Record<Exclude<GrantResult, { ok: true }>["reason"], string> = {
    no_session: t("Sila log masuk semula.", "请重新登录一次。", "Sign in again."),
    not_admin: t(
      "Akaun ini tiada dalam senarai pentadbir platform — pangkalan data menolak. Tiada apa-apa diberikan.",
      "这个账号不在平台管理员名单里 —— 数据库拒绝了，什么都没有发生。",
      "This account is not on the platform-admin list — the database refused. Nothing was granted.",
    ),
    invalid: t(
      "Semak medan: ID pertubuhan dan jumlah mesti nombor bulat, jumlah bukan sifar.",
      "请检查栏位：机构编号和数量都要是整数，数量不能是 0。",
      "Check the fields: org ID and amount must be whole numbers, amount non-zero.",
    ),
    db_behind: t(
      "Pangkalan data belum sedia untuk ciri ini (migrasi belum dijalankan). Tiada apa-apa diberikan.",
      "数据库还没准备好这个功能（migration 还没跑）。什么都没有发生。",
      "The database is not ready for this yet (migration not applied). Nothing was granted.",
    ),
    db: t(
      "Panggilan gagal — tiada apa-apa diberikan. Cuba lagi.",
      "这次没有成功 —— 什么都没有发生。请再试一次。",
      "The call failed — nothing was granted. Try again.",
    ),
  };

  async function grant() {
    setError(null);
    setResult(null);
    const orgIdNum = Number(orgId);
    const deltaNum = Number(delta);
    if (!Number.isInteger(orgIdNum) || !Number.isInteger(deltaNum)) {
      setError(reasonText.invalid);
      return;
    }
    setBusy(true);
    try {
      const r = await adminGrantCredits({ orgId: orgIdNum, delta: deltaNum, note });
      if (r.ok) {
        setResult(
          t(
            `Berjaya: ${r.orgName} (#${orgIdNum}) — kredit tambahan ${r.creditsBefore} → ${r.creditsAfter}. Sudah direkod dalam log audit.`,
            `成功：${r.orgName}（#${orgIdNum}）—— 额外额度 ${r.creditsBefore} → ${r.creditsAfter}。已写入审计记录。`,
            `Done: ${r.orgName} (#${orgIdNum}) — extra credits ${r.creditsBefore} → ${r.creditsAfter}. Recorded in the audit log.`,
          ),
        );
        setDelta("");
        setNote("");
      } else {
        setError(reasonText[r.reason]);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="v2-glass flex flex-col gap-3 p-5">
      <div>
        <h2 className="text-xl font-semibold">
          <Tri bm="Beri kredit AI tambahan" zh="加 AI 额度" en="Grant extra AI credits" />
        </h2>
        <p className="text-sm text-[color:var(--v2-text-soft)]">
          <Tri
            bm="Untuk satu pertubuhan. Setiap pemberian direkodkan dalam log audit; nombor negatif menolak (tidak bawah 0)."
            zh="给某个机构加（或扣）本月之外的额外额度。每次都会留审计记录；填负数是扣，最低扣到 0。"
            en="For one organisation. Every grant is written to the audit log; a negative number deducts (floored at 0)."
          />
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>
            <Tri bm="ID pertubuhan" zh="机构编号" en="Org ID" />
            <Req />
          </span>
          <span className="text-xs text-[color:var(--v2-text-soft)]">
            <Tri bm="Nombor # dalam jadual di atas" zh="上面表格里的 # 号" en="The # in the table above" />
          </span>
          <input
            className="w-28 rounded-md border border-input bg-background px-3 py-2 text-base"
            inputMode="numeric"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>
            <Tri bm="Jumlah" zh="数量" en="Amount" />
            <Req />
          </span>
          <span className="text-xs text-[color:var(--v2-text-soft)]">
            <Tri bm="cth: 100, atau -50 untuk tolak" zh="例：100；扣就填 -50" en="e.g. 100, or -50 to deduct" />
          </span>
          <input
            className="w-36 rounded-md border border-input bg-background px-3 py-2 text-base"
            inputMode="numeric"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span>
            <Tri bm="Sebab" zh="原因" en="Reason" />
          </span>
          <span className="text-xs text-[color:var(--v2-text-soft)]">
            <Tri
              bm="Kenapa — masuk ke log audit"
              zh="为什么加 —— 会写进审计记录"
              en="Why — lands in the audit log"
            />
          </span>
          <input
            className="min-w-48 rounded-md border border-input bg-background px-3 py-2 text-base"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <Button onClick={() => void grant()} disabled={busy || orgId === "" || delta === ""}>
          {busy ? (
            <Tri bm="Memberi…" zh="处理中…" en="Granting…" />
          ) : (
            <Tri bm="Beri" zh="确认加额度" en="Grant" />
          )}
        </Button>
      </div>
      {result && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-900 dark:bg-green-400/10 dark:text-green-100">
          ✓ {result}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">{error}</p>
      )}
    </div>
  );
}
