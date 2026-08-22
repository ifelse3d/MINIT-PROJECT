import { NextResponse } from "next/server";
import { z } from "zod";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { getVisionProvider } from "@/lib/ai/provider";
import {
  checkAndRecordUsage,
  createUsageRecorder,
  getUsage,
  refundUsage,
  type UsageCharge,
} from "@/lib/ai/usage";
import {
  QUOTA_BLOCKED_MESSAGE,
  QuotaExceededError,
  RATE_LIMITED_MESSAGE,
  RateLimitedError,
} from "@/lib/ai/usage-core";
import { getActiveOrg } from "@/lib/active-org";
import { cariMinit, formatHitsForPrompt, type MinutesHit } from "@/lib/ai/cari-minit";
import { ASK_ROUTES, type AskRouteKey } from "@/lib/ask-routes";
import { chatPrompt, type ChatTurn } from "@/prompts/chat";
import { dayIsoMalaysia } from "@/lib/history";

// ---------------------------------------------------------------------------
// THE MINIT ASSISTANT — a real conversation, with hard limits.
//
// PRODUCT DECISION, 2026-07-28.
// CLAUDE.md rule 10 used to read "No open-ended chatbot anywhere". The product
// owner has overridden that: forcing a one-shot question box on a 70-year-old
// who has never used a computer is a worse failure than the cost risk, PROVIDED
// the spend is capped. Rule 10 in CLAUDE.md has been updated to match this file
// — if the two ever disagree again, fix the file, do not quietly revert this.
//
// THE THREE LIMITS THAT MAKE IT SAFE
//   1. PER TURN      — every reply costs one `chat_turn` AI action, charged
//                      BEFORE the vendor call. The remaining count is returned
//                      so the box can show it live.
//   2. PER CONVERSATION — MAX_TURNS, counted from the `history` the CLIENT sends.
//                      Be clear-eyed about this one: it is a UX nudge, not a spend
//                      control. A client that posts `history: []` every time never
//                      reaches the cap. It exists so an honest, forgotten open tab
//                      cannot quietly rack up turns; the ACTUAL spend limits are
//                      (1) and (3), which are both server-side.
//   3. PER MONTH     — the existing org quota (`ai_usage`), unchanged.
//
// AND TWO THAT KEEP IT HONEST
//   * The model is told it CANNOT see the organisation's records, and must say so
//     rather than invent a number or a clause (Hard Rule 1 applies to prose too).
//   * Off-topic questions are declined AND REFUNDED — a refusal must never eat
//     someone's quota. `in_scope: false` from the model triggers the refund.
//
// PDPA (Hard Rule 5): the transcript lives in the browser only. Nothing here is
// logged, and no conversation is written to the database.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

/** Hard cap per conversation. Layer 2 of the usage limit. */
export const MAX_TURNS = 12;
/** How many earlier turns are sent as context (keeps the prompt cheap). */
const CONTEXT_TURNS = 6;
const MAX_QUESTION_CHARS = 500;

const bodySchema = z.object({
  question: z.string().min(1).max(MAX_QUESTION_CHARS),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(4000),
      }),
    )
    .max(MAX_TURNS * 2)
    .default([]),
});

const replySchema = z.object({
  reply: z.string().min(1),
  in_scope: z.boolean(),
  suggested_page: z.string(),
  // Which excerpts the model says it used. Optional on purpose: a model that
  // forgets this field must still get a usable answer through, and the fallback
  // (show every excerpt that was found) is safe -- it over-shows sources, it
  // never invents one.
  used_sources: z.array(z.number().int().positive()).optional(),
});

/** What the assistant is allowed to show as a source.
 *  Not exported: a route module may only export its handlers and config. */
type ChatSource = {
  /** The number that appears in the reply as [1], [2]. */
  n: number;
  docId: number;
  meetingDate: string | null;
  meetingType: string | null;
};

/**
 * The excerpts the model said it used, mapped back to real meetings.
 *
 * When `used` is missing or empty but excerpts WERE found, every excerpt is
 * shown. That is deliberate: the failure mode of showing one source too many is
 * a person opening a meeting that turns out not to matter, while the failure
 * mode of showing none is a claim with nothing behind it. An out-of-range
 * number is dropped rather than clamped — a model that cites [7] when six
 * excerpts exist is not to be second-guessed about which one it meant.
 */
function citedSources(hits: MinutesHit[], used?: number[]): ChatSource[] {
  if (hits.length === 0) return [];
  const wanted =
    used && used.length > 0
      ? used.filter((n) => n >= 1 && n <= hits.length)
      : hits.map((_, i) => i + 1);
  const seen = new Set<number>();
  const out: ChatSource[] = [];
  for (const n of wanted) {
    if (seen.has(n)) continue;
    seen.add(n);
    const hit = hits[n - 1];
    out.push({
      n,
      docId: hit.docId,
      meetingDate: hit.meetingDate,
      meetingType: hit.meetingType,
    });
  }
  return out;
}

function routeFor(key: string): { href: string; bm: string; zh: string; en: string } | null {
  if (key === "none" || !(key in ASK_ROUTES)) return null;
  const route = ASK_ROUTES[key as AskRouteKey];
  return { href: route.href, bm: route.bm, zh: route.zh, en: route.en };
}

export async function POST(req: Request) {
  try {
    const parsedBody = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: joinUserError({
            bm: "Soalan itu terlalu panjang. Tanya satu perkara sahaja, dalam satu ayat pendek.",
            zh: "这个问题太长了。请一次只问一件事，用一句短句子。",
            en: "That question is too long. Ask about one thing, in one short sentence.",
          }),
        },
        { status: 400 },
      );
    }
    const { question, history } = parsedBody.data;

    // --- limit 2: conversation length ------------------------------------
    const userTurns = history.filter((t) => t.role === "user").length;
    if (userTurns >= MAX_TURNS) {
      return NextResponse.json(
        {
          code: "TURN_LIMIT",
          error: joinUserError({
            bm: `Perbualan ini sudah panjang (${MAX_TURNS} soalan). Tekan "Mula semula" dan tanya soalan baharu — ini menjaga bantuan AI anda supaya tidak habis terlalu cepat.`,
            zh: `这个对话已经很长了（${MAX_TURNS} 个问题）。请按「重新开始」，再问新的问题 —— 这样可以省着用您的 AI 用量。`,
            en: `This conversation is getting long (${MAX_TURNS} questions). Tap "Start again" and ask a fresh question — this keeps your AI help from running out too quickly.`,
          }),
        },
        { status: 429 },
      );
    }

    // The org is resolved through the RLS-checked path, so the org name that
    // goes into the prompt can never come from the browser.
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json(
        { code: "NO_ORG", error: joinUserError(USER_ERRORS.needOrg) },
        { status: 401 },
      );
    }

    // --- limit 1 + 3: charge one turn, against the monthly quota ----------
    // checkAndRecordUsage (not requireAiQuota) because we need the charge back
    // so an off-topic refusal can be refunded below.
    let charge: UsageCharge;
    try {
      charge = await checkAndRecordUsage(org.id, "chat_turn");
    } catch (e) {
      // 2026-08-21: going too fast is a 429, not a 500 and not a 402 — the fix
      // is to wait, not to buy more, and the message says so.
      if (e instanceof RateLimitedError) {
        return NextResponse.json(
          { code: "RATE_LIMITED", error: joinUserError(RATE_LIMITED_MESSAGE) },
          { status: 429 },
        );
      }
      if (e instanceof QuotaExceededError) {
        return NextResponse.json(
          {
            code: "QUOTA_EXCEEDED",
            error: joinUserError(QUOTA_BLOCKED_MESSAGE),
            usage: e.state,
          },
          { status: 402 },
        );
      }
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.serverError) },
        { status: 500 },
      );
    }

    const todayIso = dayIsoMalaysia(new Date().toISOString())!;
    // Short text Q&A — no image, no handwriting. The cheap tier is enough.
    const provider = getVisionProvider("chat");

    // 2026-08-18: attach what the vendor actually charged to the ai_usage row
    // that paid for it — the pattern extract-ledger has had since 2026-08-03.
    const onUsage = createUsageRecorder(org.id, charge);

    // --- cari_minit: what does this society's own record say? --------------
    //
    // 2026-08-20, J: the assistant has to answer "我記得有一次開會說了什麼".
    // docs/助手重做-设计.md §5 step 1. This is the first thing the assistant can
    // actually SEE, and it is why the "you cannot read their records" line came
    // out of src/prompts/chat.ts in this same change.
    //
    // RETRIEVAL-FIRST, NOT YET MODEL-CHOSEN TOOL CALLS. The design doc's shape
    // is "the model decides which tool to call". That needs a function-calling
    // abstraction across four vendors, which the provider layer does not have
    // yet. Searching on every turn reaches the same outcome for this one tool:
    // the excerpts are in front of the model, and it is told to use only those.
    // The cost of searching when it was not needed is one embedding call --
    // cheap, and not charged to the org's quota (docs/助手重做-设计.md §3).
    //
    // Never throws: cariMinit returns [] for a missing key, an unapplied
    // migration, a vendor outage or simply nothing similar enough. All four
    // mean the same thing to the assistant, and it says it could not find it
    // rather than filling the gap.
    const hits = await cariMinit({ orgId: org.id, query: question });

    const prompt = chatPrompt({
      orgName: org.name,
      todayIso,
      // Only the recent tail: older turns rarely change the answer and every
      // token is money.
      history: history.slice(-CONTEXT_TURNS * 2) as ChatTurn[],
      question,
      minutesExcerpts: formatHitsForPrompt(hits),
    });

    let raw: unknown;
    try {
      raw = await provider.extractJson({ prompt, onUsage });
    } catch {
      // 2026-08-21: THIS is what a refund is for now. The throw means we never
      // reached the vendor at all — no tokens, no invoice — so charging for it
      // would be charging for something we did not do. (The other half of the
      // same rule is above: a reply we DID pay for is charged even when the
      // model declined it.) Every extract-* route has done this since 0bd7c6b;
      // chat was the one that did not, so a network blip cost the member an
      // action. docs/助手重做-设计.md section 4.5.
      await refundUsage(org.id, charge);
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.aiUnavailable) },
        { status: 502 },
      );
    }

    let parsed = replySchema.safeParse(raw);
    if (!parsed.success) {
      // Rule 7: one retry with the errors appended. Not charged again.
      try {
        raw = await provider.extractJson({
          prompt: `${prompt}

YOUR PREVIOUS ATTEMPT WAS NOT VALID JSON in the required shape. Respond with ONLY the JSON object described above.`,
          onUsage,
        });
        parsed = replySchema.safeParse(raw);
      } catch {
        // fall through
      }
    }
    if (!parsed.success) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.aiCouldNotUnderstandQuestion) },
        { status: 422 },
      );
    }

    // 2026-08-21: an off-topic reply is NOT refunded any more.
    //
    // It used to be. But we only learn a question was off-topic from the
    // model's own answer, which means the vendor ran and we paid — so the old
    // rule let someone chat about anything at all, for free, every turn, while
    // every turn cost us money. J, 2026-08-21: "不管做什麼有用到 api 就扣，我們
    // 不是慈善家."
    //
    // The rule is now: reaching the vendor is what costs an action. What is
    // still refunded (in refundUsage's callers above) is the case where the
    // vendor was never reached at all.
    // See docs/助手重做-设计.md section 4.5.

    const after = await getUsage(org.id);
    return NextResponse.json({
      reply: parsed.data.reply,
      inScope: parsed.data.in_scope,
      button: routeFor(parsed.data.suggested_page),
      // Every claim about their records, with the meeting it came from — the
      // person can open it and check. "每个事实带出处" (design doc §2).
      sources: citedSources(hits, parsed.data.used_sources),
      remaining: after?.totalRemaining ?? null,
      // 2026-08-22: the badge prints both — how many actions are left, and how
      // full the month's free quota is. usedPct measures the FREE quota only
      // (usage-core), so buying credits cannot make the gauge go backwards.
      usedPct: after?.usedPct ?? null,
      turnsUsed: userTurns + 1,
      maxTurns: MAX_TURNS,
    });
  } catch {
    // No contents in logs (PDPA).
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }
}
