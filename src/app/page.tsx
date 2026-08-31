import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { getUsage } from "@/lib/ai/usage";
import { countUnfinishedMinutesDrafts } from "@/lib/home-stats";
import { dayIsoMalaysia } from "@/lib/history";
import { computeStandardDeadlines } from "@/lib/standard-deadlines";
import { readOrgTypeFlags } from "@/lib/org-flags";
import { getLatestConfirmedAgm } from "@/db/agm";
import { UpcomingBell } from "./upcoming-bell";
import { WorkbenchColumns } from "./workbench-columns";
import { HowItWorksButton } from "./how-it-works";

import { AskBox } from "./ask-box";
import { BRAND_NAME } from "@/lib/brand";

// ---------------------------------------------------------------------------
// HOME = THE AGENT WORKBENCH (work order 100 §0-1, J 2026-08-31: 「可以收掉
// 了，因為不需要了，左邊也有 sidebar 可以使用了」).
//
// The four task cards (A-1, work order 27) are gone: the sidebar names every
// job now, and the person who knows which job they came for uses it. The one
// door IS the page — a conversation that takes whatever is in the person's
// hand (photo / PDF / Office / a question), shows its work step by step,
// and lays the finished pieces out as cards (ask-box.tsx). The eROSES-test
// principle stands unchanged; what moved is only how much of the screen the
// door gets.
//
// No organisation yet → ONE card only ("tell Minit your organisation's
// name"), no workbench, and no tax deadlines — a deadline for an
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
      // §1 (109): the shell hands this route ONE viewport and no window
      // scrollbar, so the branch that is not a conversation has to carry its
      // own — a welcome card taller than a phone screen must still be
      // readable to its last line.
      <div className="v2-scroll mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-10 pt-6">
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

  // 🔴 ONE WAVE, NOT FOUR. These reads have nothing to do with each other,
  // but they used to be four awaits in a row — so on a Supabase sitting in
  // another region every visit to the home page paid four round trips end to
  // end, and the page got slower every time somebody added a fifth. J found
  // it the hard way on 2026-08-28 (「refresh 了 LOADING 超慢」). If you add
  // another read here, put it in this array; if it depends on one of these,
  // ask whether it really does.
  const [agm, orgFlags, usage, unfinishedDrafts] = await Promise.all([
    getLatestConfirmedAgm(),
    readOrgTypeFlags(active.id),
    getUsage(active.id).catch(() => null),
    // G3-3 (J #7): the unfinished-workspace reminder, now a line in the
    // workbench's greeting instead of a badge on a deleted card.
    countUnfinishedMinutesDrafts(active.id),
  ]);
  // B-5: an internal committee has no annual return — no nagging about one.
  const deadlines = computeStandardDeadlines(todayIso, { agm, orgType: orgFlags.orgType });

  return (
    // §1 (109): a chat SCREEN, not a card on a scrolling page. This column is
    // exactly as tall as the room the shell gave it; the conversation inside
    // takes whatever is left after the composer, and nothing here scrolls the
    // window. The big "MinitAI / Society paperwork, without forms." heading
    // that used to open the page now sits beside "Home" in the top bar.
    <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col gap-3">
      {/* §0-3 (work order 102, J's ruling): on a phone "Upcoming" is a
          notification bell, not a block — the workbench owns the screen.
          Container variants, not viewport ones (<main> is the @container). */}
      <UpcomingBell deadlines={deadlines} todayIso={todayIso} className="@4xl:hidden" />

      {/* §1-6 (work order 69): the old ?welcome=1 landing card is gone — a
          new organisation now lands on /orgs/welcome, the guided sequence. */}

      {/* THE WORKBENCH — photo / file / typing, mixed; type first, then
          confirm to send; MinitAI asks back when unsure, shows its steps
          while it works, and lays the finished pieces out as cards. On a
          desktop the deadlines live in the right column (§0-3): the composer
          is the main column's lowest point — no scrolling past cards to type. */}
      {/* C-11 (work order 51): the walkthrough entry sits beside the box's
          own heading — it explains exactly the flow the box starts. */}
      {/* §9 (104, J: 「home 的 upcoming 做成可以收起來，然後 CHAT 的空間要大」):
          the two columns, with the right one foldable. Folded leaves a "⏰ N"
          chip that puts it back, and the choice is remembered on the device. */}
      <WorkbenchColumns
        deadlines={deadlines}
        todayIso={todayIso}
        workbench={
          <AskBox
            hasOrg
            initialRemaining={usage?.totalRemaining ?? null}
            initialUsedPct={usage?.usedPct ?? null}
            // §5 (104): the SAME denominator every other percentage uses —
            // month's allowance plus any top-up (usage-core's quotaPool).
            monthlyQuota={usage?.quotaPool ?? null}
            unfinishedDrafts={unfinishedDrafts}
            howItWorks={<HowItWorksButton variant="link" />}
          />
        }
      />
    </div>
  );
}
