import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { getUsage } from "@/lib/ai/usage";
import {
  countUnfinishedMinutesDrafts,
  getHomeFigures,
  homeStats,
} from "@/lib/home-stats";
import { dayIsoMalaysia } from "@/lib/history";
import { computeStandardDeadlines } from "@/lib/standard-deadlines";
import { readOrgTypeFlags } from "@/lib/org-flags";
import { getLatestConfirmedAgm } from "@/db/agm";
import { HomeUpcoming } from "./home-upcoming";
import { HowItWorksButton } from "./how-it-works";

import { AskBox } from "./ask-box";
import { TaskCards } from "./task-cards";
import { BRAND_NAME } from "@/lib/brand";

// ---------------------------------------------------------------------------
// HOME = four task cards, then the chat box (A-1, work order 27 — J 8/26 #1).
//
// 2026-08-25 made the chat box the whole page with three quiet chips under
// it; J walked the system the next day and the box alone did not say what
// Minit MAKES. So the four jobs are named up top as big cards (minutes /
// money / financial statement / hand-to-AI — see task-cards.tsx), and the box
// stays right below them, permanent: the "hand it to AI" card focuses it
// rather than opening some fourth page. The eROSES-test principle stands —
// the box still takes whatever is in the person's hand and works out where
// it goes; the cards are for the person who already knows which job they
// came to do.
//
// No organisation yet → ONE card only ("tell Minit your organisation's
// name"), no task cards, and no tax deadlines — a deadline for an
// organisation that does not exist is noise (J's brief; A-2 of order 27).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

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
              bm={`Mulakan di sini: beritahu ${BRAND_NAME} nama pertubuhan anda.`}
              zh={`从这里开始：告诉 ${BRAND_NAME} 您机构的名字。`}
              en={`Start here: tell ${BRAND_NAME} your organisation's name.`}
            />
          </p>
          <p className="text-base text-[color:var(--v2-text-soft)]">
            <Tri
              bm={`${BRAND_NAME} perlu tahu dokumen ini untuk pertubuhan yang mana, supaya nama yang betul tercetak pada resit dan minit anda. Ia mengambil masa kira-kira satu minit.`}
              zh={`${BRAND_NAME} 需要知道这些文件属于哪个机构，收据和会议记录上才会印出正确的名字。大约只要一分钟。`}
              en={`${BRAND_NAME} needs to know which organisation these documents belong to, so the right name is printed on your receipts and minutes. It takes about a minute.`}
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
            {/* B-2: the second door — joining an existing society by code. */}
            <Button asChild size="lg" variant="outline" className="text-base">
              <Link href="/orgs/join">
                <Tri
                  bm="Saya ada kod jemputan"
                  zh="我有邀请码"
                  en="I have an invite code"
                />
              </Link>
            </Button>
            <HowItWorksButton variant="link" />
          </div>
        </div>
      </div>
    );
  }

  // 🔴 ONE WAVE, NOT FOUR. These four reads have nothing to do with each
  // other, but they used to be four awaits in a row — so on a Supabase sitting
  // in another region every visit to the home page paid four round trips end
  // to end, and the page got slower every time somebody added a fifth. J found
  // it the hard way on 2026-08-28 (「refresh 了 LOADING 超慢」) right after the
  // status lines became the fourth. If you add another read here, put it in
  // this array; if it depends on one of these, ask whether it really does.
  const [agm, orgFlags, usage, figures, unfinishedDrafts] = await Promise.all([
    getLatestConfirmedAgm(),
    readOrgTypeFlags(active.id),
    getUsage(active.id).catch(() => null),
    // Carries its own deadline: the status lines may never hold up the page.
    getHomeFigures(active.id),
    // G3-3 (J #7): the unfinished-workspace reminder on the minutes card.
    countUnfinishedMinutesDrafts(active.id),
  ]);
  // B-5: an internal committee has no annual return — no nagging about one.
  const deadlines = computeStandardDeadlines(todayIso, { agm, orgType: orgFlags.orgType });
  const stats = homeStats(figures, usage);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 pb-10">
      <Header />

      {/* §1-6 (work order 69): the old ?welcome=1 landing card is gone — a
          new organisation now lands on /orgs/welcome, the guided sequence. */}

      {/* 1 — the four task cards: what MinitAI makes, one tap each (A-1). */}
      <TaskCards stats={stats} unfinishedDrafts={unfinishedDrafts} />

      {/* 2 — THE box: photo / file / typing, mixed; type first, then
          confirm to send; MinitAI asks back when unsure. Card ④ focuses it. */}
      {/* C-11 (work order 51): the walkthrough entry sits beside the box's
          own heading — it explains exactly the flow the box starts. */}
      <AskBox
        hasOrg
        initialRemaining={usage?.totalRemaining ?? null}
        initialUsedPct={usage?.usedPct ?? null}
        howItWorks={<HowItWorksButton variant="link" />}
      />

      {/* 3 — what is due (this org's own deadlines, never invented ones) */}
      <HomeUpcoming deadlines={deadlines} todayIso={todayIso} />
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{BRAND_NAME}</h1>
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
