"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Banknote, ChartColumn, FilePen, Sparkles } from "lucide-react";
import { Tri } from "@/components/language-provider";
import {
  aiLine,
  minutesLine,
  moneyLine,
  statementLine,
  unfinishedDraftsLine,
  type Line,
} from "@/lib/home-card-lines";
// TYPE-ONLY on purpose: home-stats.ts is "server-only", and importing any
// runtime value from it here would drag the Supabase server client into the
// browser bundle (which is exactly what next build refuses to do). A type
// import is erased at compile time, so the contract is shared and the code
// is not.
import type { HomeStats } from "@/lib/home-stats";

// ---------------------------------------------------------------------------
// THE FOUR TASK CARDS (A-1, work order 27 — J 2026-08-26 #1, 拍板①).
//
// The home page's entrances, above the chat box. J walked the system and the
// chips were too quiet: a first-time secretary looked at one box and did not
// know Minit makes DOCUMENTS. Four big cards name the four jobs:
//
//   ① Meeting minutes — "交报告" IS making minutes: many meeting kinds exist
//     and whether a society files eROSES is their own business; Minit's job is
//     a formal, usable meeting report (J 8/26 #1).
//   ② Record money & donations.
//   ③ Financial statement (an honest stub page until Stage F builds it —
//     CLAUDE.md #13: a step that cannot be done yet is still a real page).
//   ④ Hand it to AI — NOT a page: it focuses the chat box right below,
//     because the box is already the answer and a fourth route would be a
//     second copy of it.
//
// The chat box stays put underneath (拍板①: "聊天框保留在卡下方常驻").
//
// 2026-08-28 design pass. The cards were a 2px near-black outline with no
// shadow and no hover state — boxy, and nothing said they could be clicked.
// Now: a 4px accent band, the emoji replaced by a line icon in a tinted tile,
// a hover lift with a sliding arrow, and ONE live status line each. The
// styling lives in globals.css (.home-card) with the rules about how far each
// accent hue is allowed to reach.
//
// 🔴 The emoji had to go for a reason beyond taste: 📝📋📊✨ are drawn by the
// operating system, so the first screen of the product looked like three
// different products across Windows, Android and iOS.
//
// The status lines are the part that keeps the page alive — the bands are a
// one-time lift, the numbers change every week. A figure that cannot be read
// renders NO line at all (see home-stats.ts): never a 0, never a placeholder.
// ---------------------------------------------------------------------------

/** The chat box textarea carries this id so card ④ can hand focus to it. */
export const ASK_INPUT_ID = "minit-ask-input";

/**
 * Each card's accent, light and dark.
 *
 * FOUR VIOLETS, not four different colours (J, 2026-08-28: 「我覺得可以放不同
 * 的紫」). The design pack shipped teal / blue / magenta beside the brand
 * violet and flagged the trade itself — four hues plus the brand is five
 * colours on one screen. J took the exit it offered, but a step further than
 * "all four the same": the cards walk the purple family from deep indigo
 * violet to fuchsia, so they stay tellable apart while the page stays one
 * colour. Nothing else changes — the hue still only touches the band, the
 * tile and the dot.
 *
 * Four literal pairs rather than a color-mix() derivation: the light hues are
 * all dark colours, so on the dark card they would be a glyph nobody can see,
 * and the tints are the exact values checked (glyph-on-tile clears 3:1 in
 * both modes). An old Android WebView gets the same colours as everyone else.
 */
type Hue = { light: string; lightSoft: string; dark: string; darkSoft: string };

// Deep indigo violet -> brand violet -> purple -> fuchsia. Every light value
// clears 4.3:1 on white, so the glyph is safe on its own 13% tint; every dark
// value is the light one's readable counterpart on the dark card.
const HUE_MINUTES: Hue = {
  light: "#4C1D95",
  lightSoft: "#E8E2F1",
  dark: "#C4B5FD",
  darkSoft: "rgba(196,181,253,0.16)",
};
const HUE_MONEY: Hue = {
  light: "#7029E5", // the brand violet itself
  lightSoft: "#ECE3FC",
  dark: "#A78BFA",
  darkSoft: "rgba(167,139,250,0.16)",
};
const HUE_STATEMENT: Hue = {
  light: "#9333EA",
  lightSoft: "#F1E4FC",
  dark: "#C084FC",
  darkSoft: "rgba(192,132,252,0.16)",
};
const HUE_AI: Hue = {
  light: "#C026D3",
  lightSoft: "#F7E3F9",
  dark: "#E879F9",
  darkSoft: "rgba(232,121,249,0.16)",
};

function hueVars(hue: Hue): CSSProperties {
  return {
    "--c-light": hue.light,
    "--c-light-soft": hue.lightSoft,
    "--c-dark": hue.dark,
    "--c-dark-soft": hue.darkSoft,
  } as CSSProperties;
}

function CardInner({
  icon,
  title,
  desc,
  line,
}: {
  icon: ReactNode;
  title: Line;
  desc: Line;
  line: Line | null;
}) {
  return (
    <>
      <span className="band" aria-hidden />
      <span className="body">
        <span className="top">
          <span className="tile" aria-hidden>
            {icon}
          </span>
          <span className="arrow" aria-hidden>
            <ArrowRight />
          </span>
        </span>
        <span>
          <span className="title">
            <Tri bm={title.bm} zh={title.zh} en={title.en} />
          </span>
          <span className="desc">
            <Tri bm={desc.bm} zh={desc.zh} en={desc.en} />
          </span>
        </span>
        {/* No line rather than an empty row: a status row with nothing in it
            is worse than a card that never promised one. */}
        {line && (
          <span className="stat">
            <span className="dot" aria-hidden />
            <Tri bm={line.bm} zh={line.zh} en={line.en} />
          </span>
        )}
      </span>
    </>
  );
}

export function TaskCards({
  stats,
  unfinishedDrafts = null,
}: {
  stats: HomeStats;
  /** G3-3 (J #7): unfinished cloud-draft workspaces — outranks the unsigned
   *  count on the minutes card when > 0. null = unknown, no claim made. */
  unfinishedDrafts?: number | null;
}) {
  // Container variants (J #1, 2026-08-28): columns follow the CONTENT
  // column's width, not the viewport's — with the AI dock open on a 14"
  // laptop the old lg:grid-cols-4 forced four skinny towers.
  return (
    <section
      aria-label="Tugas / 任务 / Tasks"
      className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4"
    >
      <Link href="/minutes" className="home-card" style={hueVars(HUE_MINUTES)}>
        <CardInner
          icon={<FilePen strokeWidth={1.75} />}
          title={{ bm: "Minit mesyuarat", zh: "会议记录", en: "Meeting minutes" }}
          desc={{
            bm: "Gambar nota → laporan mesyuarat rasmi",
            zh: "拍下笔记 → 正式的会议报告",
            en: "Photo of notes → a formal meeting report",
          }}
          line={unfinishedDraftsLine(unfinishedDrafts) ?? minutesLine(stats.minutesDrafts)}
        />
      </Link>

      <Link href="/money" className="home-card" style={hueVars(HUE_MONEY)}>
        <CardInner
          icon={<Banknote strokeWidth={1.75} />}
          title={{ bm: "Rekod wang & derma", zh: "记钱 · 捐款", en: "Record money & donations" }}
          desc={{
            bm: "Lejar, resit bernombor, serah wang",
            zh: "账页、连号收据、交现金",
            en: "Ledger, numbered receipts, cash hand-over",
          }}
          line={moneyLine(stats.moneyInCents)}
        />
      </Link>

      <Link href="/money/report" className="home-card" style={hueVars(HUE_STATEMENT)}>
        <CardInner
          icon={<ChartColumn strokeWidth={1.75} />}
          title={{ bm: "Penyata kewangan", zh: "财报", en: "Financial statement" }}
          desc={{
            bm: "Kira masuk & keluar mengikut tempoh",
            zh: "按期间算出收支表",
            en: "Income & spending, by period",
          }}
          line={statementLine(stats.moneyRecords)}
        />
      </Link>

      {/* ④ is a BUTTON: it hands focus to the chat box below, it does not
          navigate — the box is the feature, not a page about the feature. */}
      <button
        type="button"
        className="home-card"
        style={hueVars(HUE_AI)}
        onClick={() => {
          const input = document.getElementById(ASK_INPUT_ID);
          input?.scrollIntoView({ behavior: "smooth", block: "center" });
          input?.focus({ preventScroll: true });
        }}
      >
        <CardInner
          icon={<Sparkles strokeWidth={1.75} />}
          title={{ bm: "Serah kepada AI", zh: "交给 AI", en: "Hand it to AI" }}
          desc={{
            bm: "Tanya, atau letak apa sahaja di tangan anda",
            zh: "问问题，或把手上的东西丢给它",
            en: "Ask, or drop in whatever you are holding",
          }}
          line={aiLine(stats.aiLeft, stats.aiTotal)}
        />
      </button>
    </section>
  );
}
