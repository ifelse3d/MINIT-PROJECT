import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { getUsage } from "@/lib/ai/usage";
import { dayIsoMalaysia } from "@/lib/history";
import { computeStandardDeadlines } from "@/lib/standard-deadlines";
import { getLatestConfirmedAgm } from "@/db/agm";
import { orgHasAnyActivity } from "@/db/first-run";
import { BlurIn } from "@/components/v2/motion";
import { HomeUpcoming } from "./home-upcoming";
import { HowItWorks } from "./how-it-works";
import { AskBox } from "./ask-box";

// ---------------------------------------------------------------------------
// HOME — one door in, then what is due.
//
//   1. THE ONE DOOR   AskBox: send a photo/PDF of anything and Minit works out
//                     what it is and reads it; or type a question and get a real
//                     answer. See app/ask-box.tsx and api/intake + api/chat.
//   2. THE SHORTCUTS  For people who already know where their paper goes.
//                     Secondary on purpose — the door above needs no knowledge.
//   3. WHAT IS DUE    The deadline list → /calendar.
//
// 2026-07-28, user request. The page used to open with the question "What did
// you photograph?" and three cards. That asks the person to classify their own
// paperwork before Minit will help them — the exact knowledge they do not have.
// The heading now asks nothing and the box accepts anything.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

/**
 * Direct routes for someone who already knows. Kept because a treasurer who does
 * the same job every month should not have to wait for a classify call — but
 * demoted below the one door, and no longer phrased as a question.
 */
const SHORTCUTS = [
  {
    href: "/minutes",
    icon: "📝",
    tint: "bg-amber-100 dark:bg-amber-100",
    bm: "Nota mesyuarat",
    zh: "会议笔记",
    en: "Meeting notes",
  },
  {
    href: "/money",
    icon: "🧾",
    tint: "bg-green-100 dark:bg-green-100",
    bm: "Derma & resit",
    zh: "捐款与收据",
    en: "Donations & receipts",
  },
  {
    href: "/constitution",
    icon: "📜",
    tint: "bg-purple-100 dark:bg-purple-100",
    bm: "Perlembagaan",
    zh: "章程",
    en: "Constitution",
  },
];

export default async function Home() {
  const todayIso = dayIsoMalaysia(new Date().toISOString())!;
  const active = await getActiveOrg();
  // The annual-return deadline comes from this organisation's own confirmed AGM.
  // It used to be computed from a fictional sample meeting, so every org saw the
  // same invented due date. (2026-07-28 audit.)
  const agm = await getLatestConfirmedAgm();
  const deadlines = computeStandardDeadlines(todayIso, { agm });
  // "First run" = this organisation has never recorded anything. Cheap check:
  // one confirmed AGM or one saved upload is enough to stop showing onboarding.
  const hasActivity = active ? await orgHasAnyActivity(active.id) : false;
  const usage = active ? await getUsage(active.id).catch(() => null) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10">
      <BlurIn>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          <span className="v2-gradient-text">Minit</span>
        </h1>
        <p className="mt-2 text-lg text-[color:var(--v2-text-soft)]">
          <Tri
            bm="Dokumen persatuan, tanpa borang."
            zh="社团文件，不用填表。"
            en="Society paperwork, without forms."
          />
        </p>
      </BlurIn>

      {/* 1 — the one door */}
      <AskBox
        hasOrg={Boolean(active)}
        initialRemaining={usage?.totalRemaining ?? null}
      />

      {!active ? <OrgPrompt /> : null}

      {/* `HowItWorks` was written for exactly this moment and then never imported
          by anything, so the shipped app had no onboarding at all. Shown until
          the organisation has recorded something. (2026-07-28 audit.) */}
      {!hasActivity && <HowItWorks />}

      {/* 2 — shortcuts for people who already know where their paper goes */}
      <Shortcuts />

      {/* 3 — what is due */}
      <HomeUpcoming deadlines={deadlines} todayIso={todayIso} />
    </div>
  );
}

function Shortcuts() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">
        {/* Was "What did you photograph?" — a question the person cannot answer,
            phrased in a word ("photograph" as a verb) nobody says out loud. */}
        <Tri
          bm="Atau pergi terus ke:"
          zh="或者直接去："
          en="Or go straight to:"
        />
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {SHORTCUTS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="v2-glass flex min-h-28 items-center gap-4 rounded-3xl p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_70px_-24px_rgba(124,108,245,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6cf5] focus-visible:ring-offset-2"
          >
            <span
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl ${c.tint}`}
              aria-hidden
            >
              {c.icon}
            </span>
            <span className="text-lg font-semibold leading-snug">
              <Tri bm={c.bm} zh={c.zh} en={c.en} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Logged in but no organisation chosen yet.
 *  This is the most important sentence a new user ever reads, and it used to be
 *  a single 14px grey line at ~4.2:1 contrast inside a glass box — the least
 *  legible thing on the page. (2026-07-28 audit.) */
function OrgPrompt() {
  return (
    <div className="v2-glass flex flex-col gap-3 rounded-2xl border-2 border-[#7c6cf5]/40 p-5">
      <p className="text-lg font-semibold">
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
      <Button asChild size="lg" className="self-start">
        <Link href="/orgs">
          <Tri
            bm="Namakan pertubuhan saya →"
            zh="填写我的机构名称 →"
            en="Name my organisation →"
          />
        </Link>
      </Button>
    </div>
  );
}
