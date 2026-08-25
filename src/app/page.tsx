import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { getUsage } from "@/lib/ai/usage";
import { dayIsoMalaysia } from "@/lib/history";
import { computeStandardDeadlines } from "@/lib/standard-deadlines";
import { getLatestConfirmedAgm } from "@/db/agm";
import { HomeUpcoming } from "./home-upcoming";
import { HowItWorksButton } from "./how-it-works";
import { WelcomeCard } from "./welcome-card";
import { AskBox } from "./ask-box";

// ---------------------------------------------------------------------------
// HOME = the chat box IS the page (A-2, 2026-08-25, J's #12 #17).
//
// One big box — drop a photo, choose a file, or type; you can type first and
// confirm before anything is sent; Minit asks back when it cannot place a
// page. The three task cards are DEMOTED to quick chips under the box: the
// principle is "the user brings whatever is in their hand, Minit works out
// where it goes" (the eROSES test, J's #16), and three cards asking them to
// self-classify were the old model.
//
// No organisation yet → ONE card only ("tell Minit your organisation's
// name"), and no tax deadlines — a deadline for an organisation that does not
// exist is noise (J's brief).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

const QUICK_CHIPS = [
  {
    href: "/minutes",
    icon: "📝",
    bm: "Minit mesyuarat",
    zh: "会议记录",
    en: "Meeting minutes",
  },
  {
    href: "/money",
    icon: "🧾",
    bm: "Derma & resit",
    zh: "捐款与收据",
    en: "Donations & receipts",
  },
  {
    href: "/filings",
    icon: "📋",
    bm: "eROSES bulan ini",
    zh: "本月 eROSES",
    en: "eROSES this month",
  },
] as const;

export default async function Home() {
  const todayIso = dayIsoMalaysia(new Date().toISOString())!;
  const active = await getActiveOrg();

  // No organisation: ONE card. Nothing here works until Minit knows whose
  // records these are — but "see how it works" is exactly for this moment.
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
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="text-base">
              <Link href="/orgs/new">
                <Tri
                  bm="Namakan pertubuhan saya →"
                  zh="填写我的机构名称 →"
                  en="Name my organisation →"
                />
              </Link>
            </Button>
            <HowItWorksButton variant="link" />
          </div>
        </div>
      </div>
    );
  }

  const agm = await getLatestConfirmedAgm();
  const deadlines = computeStandardDeadlines(todayIso, { agm });
  const usage = await getUsage(active.id).catch(() => null);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 pb-10">
      <Header />

      {/* A-4: the just-created-an-organisation landing note. Reads ?welcome=1,
          so it needs a Suspense boundary (useSearchParams in a server tree). */}
      <Suspense fallback={null}>
        <WelcomeCard />
      </Suspense>

      {/* 1 — THE box (A-2): photo / file / typing, mixed; type first, then
          confirm to send; Minit asks back when unsure. */}
      <AskBox
        hasOrg
        initialRemaining={usage?.totalRemaining ?? null}
        initialUsedPct={usage?.usedPct ?? null}
      />

      {/* Quick chips — the three task pages, one tap away, no longer the hero. */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_CHIPS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-4 text-base font-medium hover:border-[color:var(--v2-primary)] hover:bg-[color:var(--v2-primary-soft)]"
            >
              <span aria-hidden>{c.icon}</span>
              <Tri bm={c.bm} zh={c.zh} en={c.en} />
            </Link>
          ))}
          <HowItWorksButton variant="link" />
        </div>
      </section>

      {/* 2 — what is due (this org's own deadlines, never invented ones) */}
      <HomeUpcoming deadlines={deadlines} todayIso={todayIso} />
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
