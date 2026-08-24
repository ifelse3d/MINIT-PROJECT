import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { getUsage } from "@/lib/ai/usage";
import { dayIsoMalaysia } from "@/lib/history";
import { computeStandardDeadlines } from "@/lib/standard-deadlines";
import { getLatestConfirmedAgm } from "@/db/agm";
import { orgHasAnyActivity } from "@/db/first-run";
import { HomeUpcoming } from "./home-upcoming";
import { HowItWorks } from "./how-it-works";
import { AskBox } from "./ask-box";

// ---------------------------------------------------------------------------
// HOME = "what do I do today" (Stage R, 2026-08-25).
//
// Three big task cards — submit meeting minutes / record donations & issue
// receipts / what to file with eROSES this month — then what is due, then the
// question box, DEMOTED to the bottom (it used to be the hero; J's brief makes
// the tasks the hero and the chat secondary).
//
// No organisation yet → ONE card only ("tell Minit your organisation's name"),
// and no tax deadlines — a deadline for an organisation that does not exist is
// noise (J's brief).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

const TASKS = [
  {
    href: "/minutes",
    icon: "📝",
    tint: "bg-amber-100 dark:bg-amber-100",
    bm: "Hantar minit mesyuarat",
    zh: "上交会议记录",
    en: "Submit meeting minutes",
    subBm: "Ambil gambar nota tulisan tangan — Minit tulis dokumennya.",
    subZh: "拍下手写笔记，Minit 帮您写成正式记录。",
    subEn: "Photograph the handwritten notes — Minit writes the document.",
  },
  {
    href: "/money",
    icon: "🧾",
    tint: "bg-green-100 dark:bg-green-100",
    bm: "Rekod derma & jana resit",
    zh: "记录捐款、开收据",
    en: "Record donations & issue receipts",
    subBm: "Gambar lejar atau taip terus; nombor resit dijana oleh sistem.",
    subZh: "拍账页或直接打字；收据号码由系统按顺序生成。",
    subEn: "Photograph the ledger or type it in; receipt numbers come from the system.",
  },
  {
    href: "/filings",
    icon: "📋",
    tint: "bg-blue-100 dark:bg-blue-100",
    bm: "Apa nak hantar ke eROSES bulan ini",
    zh: "本月要交什么 eROSES",
    en: "What to file with eROSES this month",
    subBm: "Pek tampal daripada minit yang disahkan, dan tarikh akhir anda.",
    subZh: "已确认记录做成的粘贴包，和您的截止日期。",
    subEn: "The paste-pack from confirmed minutes, and your deadlines.",
  },
] as const;

export default async function Home() {
  const todayIso = dayIsoMalaysia(new Date().toISOString())!;
  const active = await getActiveOrg();

  // No organisation: ONE card. No task grid, no deadlines, no question box —
  // nothing here works until Minit knows whose records these are.
  if (!active) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-10 pt-6">
        <Header />
        <div className="v2-glass flex flex-col gap-3 border-2 border-[color:var(--v2-primary)]/40 p-6">
          <p className="text-xl font-semibold">
            <Tri
              bm="Mulakan di sini: beritahu Minit nama pertubuhan anda."
              zh="从这里开始：告诉 Minit 您机构的名字。"
              en="Start here: tell Minit your organisation's name."
            />
          </p>
          <p className="text-base text-[color:var(--v2-text-soft)]">
            <Tri
              bm="Minit perlu tahu dokumen ini untuk pertubuhan yang mana, supaya nama yang betul tercetak pada resit dan minit anda. Ia mengambil masa kira-kira satu minit."
              zh="Minit 需要知道这些文件属于哪个机构，收据和会议记录上才会印出正确的名字。大约只要一分钟。"
              en="Minit needs to know which organisation these documents belong to, so the right name is printed on your receipts and minutes. It takes about a minute."
            />
          </p>
          <Button asChild size="lg" className="self-start text-base">
            <Link href="/orgs/new">
              <Tri
                bm="Namakan pertubuhan saya →"
                zh="填写我的机构名称 →"
                en="Name my organisation →"
              />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const agm = await getLatestConfirmedAgm();
  const deadlines = computeStandardDeadlines(todayIso, { agm });
  const hasActivity = await orgHasAnyActivity(active.id);
  const usage = await getUsage(active.id).catch(() => null);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 pb-10">
      <Header />

      {/* 1 — today's three jobs. THE page, per J's brief. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">
          <Tri bm="Apa nak buat hari ini?" zh="今天要做什么？" en="What needs doing today?" />
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {TASKS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="v2-glass flex min-h-40 flex-col gap-3 p-5 transition-shadow duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--v2-primary)] focus-visible:ring-offset-2"
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${c.tint}`}
                aria-hidden
              >
                {c.icon}
              </span>
              <span className="text-lg font-semibold leading-snug">
                <Tri bm={c.bm} zh={c.zh} en={c.en} />
              </span>
              <span className="text-sm leading-snug text-[color:var(--v2-text-soft)]">
                <Tri bm={c.subBm} zh={c.subZh} en={c.subEn} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* First run: how the whole thing works, until something is recorded. */}
      {!hasActivity && <HowItWorks />}

      {/* 2 — what is due (this org's own deadlines, never invented ones) */}
      <HomeUpcoming deadlines={deadlines} todayIso={todayIso} />

      {/* 3 — the question box, demoted to the bottom (J's brief). */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">
          <Tri bm="Ada soalan?" zh="有问题想问？" en="Have a question?" />
        </h2>
        <AskBox
          hasOrg
          initialRemaining={usage?.totalRemaining ?? null}
          initialUsedPct={usage?.usedPct ?? null}
        />
      </section>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Minit</h1>
      <p className="mt-1 text-lg text-[color:var(--v2-text-soft)]">
        <Tri
          bm="Dokumen persatuan, tanpa borang."
          zh="社团文件，不用填表。"
          en="Society paperwork, without forms."
        />
      </p>
    </div>
  );
}
