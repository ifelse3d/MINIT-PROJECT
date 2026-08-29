import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tri } from "@/components/language-provider";
import { getLatestConfirmedAgm } from "@/db/agm";
import { dayIsoMalaysia } from "@/lib/history";
import { getActiveOrg } from "@/lib/active-org";
import { readOrgTypeFlags } from "@/lib/org-flags";
import {
  DEADLINE_LABELS,
  daysLeftParts,
  deadlineUrgency,
  type Urgency,
} from "@/lib/deadlines";
import { computeStandardDeadlines } from "@/lib/standard-deadlines";

// /filings/eroses/tarikh — the deadlines, on their own address (H2, work
// order 69: the entry page's third card). Same computation every other
// surface uses (standard-deadlines.ts) — deterministic, never the AI.

export const dynamic = "force-dynamic";

const URGENCY_CLS: Record<Urgency, string> = {
  overdue:
    "border-red-300 bg-red-50/80 text-red-900 dark:border-red-400/40 dark:bg-red-400/10 dark:text-red-100",
  due_soon:
    "border-amber-300 bg-amber-50/80 text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-100",
  ok: "border-[color:var(--v2-border)] bg-[color:var(--v2-card)]",
  done: "border-[color:var(--v2-border)] bg-[color:var(--v2-card)] opacity-70",
};

export default async function TarikhAkhirPage() {
  const active = await getActiveOrg().catch(() => null);
  if (!active) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-10">
        <p className="v2-glass p-5 text-base">
          <Link href="/orgs" className="underline underline-offset-4">
            <Tri
              bm="Pilih atau cipta pertubuhan dahulu"
              zh="请先选择或创建机构"
              en="Choose or create an organisation first"
            />{" "}
            →
          </Link>
        </p>
      </div>
    );
  }

  const todayIso = dayIsoMalaysia(new Date().toISOString())!;
  const [agm, { orgType }] = await Promise.all([
    getLatestConfirmedAgm(),
    readOrgTypeFlags(active.id),
  ]);
  const deadlines = computeStandardDeadlines(todayIso, { agm, orgType });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            <Tri bm="Tarikh Akhir" zh="截止日" en="Deadlines" />
          </span>
        </h1>
        <p className="text-base text-muted-foreground">
          <Tri
            bm="Dikira oleh sistem daripada rekod anda — bukan AI. Penyata Tahunan: 60 hari selepas AGM disahkan."
            zh="照你们的记录由系统算出来的 —— 不是 AI。年度呈报：AGM 确认后 60 天内。"
            en="Computed by the system from your records — not the AI. Annual Return: 60 days after the confirmed AGM."
          />
        </p>
      </div>

      {!agm && orgType !== "committee" && (
        <p className="rounded-md border-2 border-amber-300 bg-amber-50/80 p-4 text-base font-medium text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Belum ada AGM yang disahkan — tarikh akhir Penyata Tahunan hanya boleh dikira selepas minit AGM disahkan. Kami tidak meneka tarikh."
            zh="还没有已确认的 AGM —— 年报截止日要等 AGM 会议记录确认后才能算。我们不猜日期。"
            en="No confirmed AGM yet — the Annual Return deadline can only be computed once the AGM minutes are confirmed. We do not guess dates."
          />
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            <Tri bm="Yang sedang berjalan" zh="正在倒数的" en="On the clock" />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {deadlines.length === 0 ? (
            <p className="text-base text-muted-foreground">
              <Tri bm="Tiada tarikh akhir aktif." zh="现在没有进行中的截止日。" en="No active deadlines." />
            </p>
          ) : (
            deadlines.map((d, i) => {
              const u = deadlineUrgency(d, todayIso);
              const left = daysLeftParts(d, todayIso);
              const label = DEADLINE_LABELS[d.kind];
              return (
                <div key={i} className={`rounded-md border-2 p-3 ${URGENCY_CLS[u]}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      <Tri bm={label.bm} zh={label.zh} en={label.en} />
                    </span>
                    <span className="font-semibold">
                      {d.dueDateIso} · <Tri bm={left.bm} zh={left.zh} en={left.en} />
                    </span>
                  </div>
                  <p className="mt-1 text-sm opacity-80">{d.source}</p>
                </div>
              );
            })
          )}
          <p className="text-sm text-muted-foreground">
            <Tri
              bm="Senarai penuh (termasuk acara pertubuhan) ada di kalendar."
              zh="完整清单（含社团活动）在日历里。"
              en="The full list (society events included) lives on the calendar."
            />{" "}
            <Link href="/calendar" className="underline underline-offset-4">
              <Tri bm="Kalendar" zh="日历" en="Calendar" /> →
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
