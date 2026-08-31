"use client";

// §0-6 (work order 102): the plan-quota dials + the org-plan switch — J's
// console replacement for report 83 §7's SQL. Two small forms over the two
// audited RPCs (migration 42). Trilingual like the rest of /admin; the
// database is the authority, this card only shapes input.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import {
  adminSetOrgPlan,
  adminSetPlanQuota,
  type PlanAdminResult,
} from "./actions";

const PLAN_IDS = ["trial", "standard", "plus", "hq"] as const;

export function PlanQuotasCard({
  quotas,
}: {
  /** Current pools, DB-first with compiled fallback (loadPlanQuotas). */
  quotas: Record<(typeof PLAN_IDS)[number], number>;
}) {
  const t = useTriText();
  const [pools, setPools] = useState<Record<string, string>>(
    Object.fromEntries(PLAN_IDS.map((id) => [id, String(quotas[id])])),
  );
  const [orgId, setOrgId] = useState("");
  const [orgPlan, setOrgPlan] = useState<(typeof PLAN_IDS)[number]>("standard");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reasonText(r: Exclude<PlanAdminResult, { ok: true }>["reason"]): string {
    switch (r) {
      case "no_session":
        return t("Sila log masuk semula.", "请重新登录一次。", "Sign in again.");
      case "not_admin":
        return t(
          "Akaun ini tiada dalam senarai pentadbir platform — pangkalan data menolak.",
          "这个账号不在平台管理员名单里 —— 数据库拒绝了。",
          "This account is not on the platform-admin list — the database refused.",
        );
      case "db_behind":
        return t(
          "Pangkalan data belum sedia (migrasi 42 belum dijalankan). Tiada apa-apa berubah.",
          "数据库还没准备好（migration 42 还没贴）。什么都没有变。",
          "The database is not ready (migration 42 not applied). Nothing changed.",
        );
      case "invalid":
        return t(
          "Semak medan: nombor bulat sahaja, pelan yang wujud sahaja.",
          "请检查栏位：只收整数、只收存在的方案。",
          "Check the fields: whole numbers only, existing plans only.",
        );
      default:
        return t(
          "Panggilan gagal — tiada apa-apa berubah. Cuba lagi.",
          "这次没有成功 —— 什么都没有变。请再试一次。",
          "The call failed — nothing changed. Try again.",
        );
    }
  }

  async function savePool(plan: (typeof PLAN_IDS)[number]) {
    setError(null);
    setResult(null);
    const quota = Number(pools[plan]);
    setBusy(plan);
    try {
      const r = await adminSetPlanQuota({ plan, quota });
      if (r.ok) {
        setResult(
          t(
            `Kolam ${plan} kini ${quota} tindakan/bulan. Semua % dikira semula serta-merta.`,
            `「${plan}」的用量池已改为每月 ${quota} 个动作。全站的 % 立即按新池换算。`,
            `The ${plan} pool is now ${quota} actions/month. Every % converts from it immediately.`,
          ),
        );
      } else setError(reasonText(r.reason));
    } finally {
      setBusy(null);
    }
  }

  async function saveOrgPlan() {
    setError(null);
    setResult(null);
    const idNum = Number(orgId);
    setBusy("org");
    try {
      const r = await adminSetOrgPlan({ orgId: idNum, plan: orgPlan });
      if (r.ok) {
        setResult(
          t(
            `Siap: ${r.message}. Kuota bulanan pertubuhan itu kini mengikut kolam pelan.`,
            `完成：${r.message}。该机构的每月额度已按新方案的池子重设。`,
            `Done: ${r.message}. That organisation's monthly quota now follows the plan's pool.`,
          ),
        );
      } else setError(reasonText(r.reason));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="v2-glass flex flex-col gap-4 p-5">
      <div>
        <p className="text-lg font-semibold">
          <Tri
            bm="Kolam kuota setiap pelan"
            zh="各方案的用量池"
            en="Per-plan quota pools"
          />
        </p>
        <p className="text-sm text-[color:var(--v2-text-soft)]">
          <Tri
            bm="Berapa banyak tindakan AI sebulan setiap pelan dapat. Semua peratus yang pengguna nampak dikira daripada nombor ini. (Migrasi 42 mesti dijalankan dahulu.)"
            zh="每个方案每月有多少 AI 动作。用户看到的所有百分比都从这些数字换算。（要先贴 migration 42。）"
            en="How many AI actions per month each plan gets. Every percentage users see converts from these numbers. (Migration 42 must be applied first.)"
          />
        </p>
        {/* §6 (104): one line of plain speech at the top of the panel. J
            reads this page to press something, and 「改這裡＝…」 is the
            sentence that tells him what pressing does. */}
        <p className="mt-1 text-sm font-medium">
          <Tri
            bm="Menukar di sini = kuota atau pelan pertubuhan itu bertukar terus, serta-merta."
            zh="改这里＝把某个 org 的方案／额度直接换掉，立刻生效。"
            en="Changing things here = that organisation's plan or allowance is swapped straight away, immediately."
          />
        </p>
      </div>
      <div className="grid gap-3 @xl:grid-cols-2">
        {PLAN_IDS.map((id) => (
          <div key={id} className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-semibold capitalize">{id}</span>
              <input
                type="number"
                min={0}
                value={pools[id]}
                onChange={(e) => setPools((p) => ({ ...p, [id]: e.target.value }))}
                className="rounded-md border-2 border-input bg-white p-2.5 text-base dark:bg-white/5"
              />
            </label>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void savePool(id)}
            >
              {busy === id ? (
                <Tri bm="Menyimpan…" zh="保存中…" en="Saving…" />
              ) : (
                <Tri bm="Simpan" zh="保存" en="Save" />
              )}
            </Button>
          </div>
        ))}
      </div>

      <div className="border-t-2 border-[color:var(--v2-border)] pt-4">
        <p className="text-base font-semibold">
          <Tri
            bm="Tukar pelan SATU pertubuhan"
            zh="改单一机构的方案"
            en="Change ONE organisation's plan"
          />
        </p>
        <p className="text-sm text-[color:var(--v2-text-soft)]">
          <Tri
            bm="Menetapkan pelan DAN kuota bulanannya mengikut kolam di atas — pengganti SQL laporan 83 §7."
            zh="会同时把该机构的方案和每月额度按上面的池子重设 —— 取代 83 号报告 §7 的 SQL。"
            en="Sets the plan AND its monthly quota from the pools above — replaces report 83 §7's SQL."
          />
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">
              <Tri bm="ID pertubuhan" zh="机构编号" en="Org ID" />
            </span>
            <input
              type="number"
              min={1}
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              placeholder="91"
              className="w-32 rounded-md border-2 border-input bg-white p-2.5 text-base dark:bg-white/5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">
              <Tri bm="Pelan" zh="方案" en="Plan" />
            </span>
            <select
              value={orgPlan}
              onChange={(e) =>
                setOrgPlan(e.target.value as (typeof PLAN_IDS)[number])
              }
              className="min-w-0 rounded-md border-2 border-input bg-white p-2.5 text-base dark:bg-white/5"
            >
              {PLAN_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={busy !== null || orgId.trim() === ""} onClick={() => void saveOrgPlan()}>
            {busy === "org" ? (
              <Tri bm="Menukar…" zh="更改中…" en="Changing…" />
            ) : (
              <Tri bm="Tukar pelan" zh="更改方案" en="Change plan" />
            )}
          </Button>
        </div>
      </div>

      {result && (
        <p className="rounded-md border-2 border-green-300 bg-green-50 p-3 text-sm font-medium text-green-900 dark:bg-green-400/10 dark:text-green-100">
          {result}
        </p>
      )}
      {error && (
        <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
          {error}
        </p>
      )}
    </div>
  );
}
