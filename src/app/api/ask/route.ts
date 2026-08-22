import { NextResponse } from "next/server";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import type { ZodError } from "zod";
import { getVisionProvider, type TokenUsage } from "@/lib/ai/provider";
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
import {
  parseAskClassification,
  parseAskSummary,
  recordSearchHref,
  sumAmountCents,
  formatRinggit,
  type AskClassification,
  type RecordKind,
} from "@/lib/ask-core";
import { ASK_ROUTES } from "@/lib/ask-routes";
import { dayIsoMalaysia } from "@/lib/history";
import { getSupabaseServer } from "@/db/supabase-server";
import { askIntentPrompt } from "@/prompts/ask-intent";
import { askSummarisePrompt } from "@/prompts/ask-summarise";

// ---------------------------------------------------------------------------
// "TANYA MINIT" (Phase 7.5b) — one-shot AI search. NOT a chatbot (Hard Rule
// 10): one question in → one classified intent → one answer + one button.
// No conversation state exists anywhere.
//
// Cost model (usage-core ASK_INTENT_COSTS): classify = 1 action, charged
// up-front; record_search charges 1 more before the summarise call.
// out_of_scope is NOT refunded (2026-08-21): the classify call is what tells us
// the question was out of scope, so the vendor was already paid. What IS still
// refunded is the summarise charge when the search matched no rows — no second
// vendor call happens in that case. docs/助手重做-设计.md section 4.5.
//
// PDPA (Hard Rule 5): the question text and results are never logged; only
// MASKED donor values are read (donor_masked), never donor_name/IC. All
// reads use the user-scoped client, so RLS limits everything to the active
// org. Money math is TypeScript (Hard Rule 2); the summarise model receives
// the totals pre-computed and pre-formatted.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_QUESTION_CHARS = 300;
const ROW_LIMIT = 50;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { question?: unknown } | null;
    const question =
      body && typeof body.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json(
        {
          error: joinUserError({
            bm: "Taip satu soalan dahulu.",
            zh: "请先打字输入一个问题。",
            en: "Type a question first.",
          }),
        },
        { status: 400 },
      );
    }
    if (question.length > MAX_QUESTION_CHARS) {
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

    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json(
        {
          error: joinUserError(USER_ERRORS.needOrg),
          code: "NO_ORG",
        },
        { status: 401 },
      );
    }

    // --- charge the classify action BEFORE calling any AI ------------------
    let classifyCharge: UsageCharge;
    try {
      classifyCharge = await checkAndRecordUsage(org.id, "ask_classify");
    } catch (e) {
      return quotaOrServerError(e);
    }

    const todayIso = dayIsoMalaysia(new Date().toISOString())!;
    // Intent classification + a short summary — text only, cheap tier.
    const provider = getVisionProvider("chat");

    // --- step 1: classify (zod-validated, retry once — rule 7) -------------
    const classification = await callWithRetry(
      () => askIntentPrompt({ question, todayIso }),
      (raw) => parseAskClassification(raw),
      provider,
      // 2026-08-18: ask is text-only and cheap per call, but it is also the
      // most-used AI action there is. Unmeasured, it was the biggest hole in
      // the cost picture.
      createUsageRecorder(org.id, classifyCharge),
    );
    if (!classification) {
      return NextResponse.json(
        {
          error: joinUserError(USER_ERRORS.aiCouldNotUnderstandQuestion),
        },
        { status: 422 },
      );
    }

    // --- out of scope: refuse politely. NOT refunded (2026-08-21) ---------
    // The classify call already ran to tell us this was out of scope, so the
    // vendor was already paid. Same rule as /api/chat: reaching the vendor is
    // what costs an action. docs/助手重做-设计.md section 4.5.
    if (classification.intent === "out_of_scope") {
      return NextResponse.json({
        intent: "out_of_scope",
        summary: {
          bm: "Maaf — Minit hanya menjawab soalan tentang rekod, perlembagaan dan halaman aplikasi pertubuhan anda. Minit terpaksa membaca soalan ini untuk mengetahuinya, jadi ia mengambil 1 daripada kuota AI anda. Cuba tanya tentang derma, resit, minit mesyuarat atau perlembagaan.",
          zh: "抱歉 — Minit 只回答关于贵组织的记录、章程和应用页面的问题。Minit 必须先读过这个问题才知道它超出范围，所以用掉了 1 次 AI 用量。可以试试问捐款、收据、会议记录或章程。",
          en: "Sorry — Minit only answers questions about your organisation's records, constitution and app pages. Minit had to read the question to know that, so it used 1 of your AI quota. Try asking about donations, receipts, meeting minutes or the constitution.",
        },
        button: null,
        ...(await usageFields(org.id)),
      });
    }

    // --- navigation help: static route map, no second AI call --------------
    if (classification.intent === "navigation_help") {
      const key = classification.route ?? "home";
      const route = ASK_ROUTES[key];
      return NextResponse.json({
        intent: "navigation_help",
        summary: { bm: route.bm, zh: route.zh, en: route.en },
        button: {
          href: route.href,
          bm: "Pergi ke halaman",
          zh: "前往页面",
          en: "Go to page",
        },
        ...(await usageFields(org.id)),
      });
    }

    // --- constitution: the existing deterministic Q&A page answers it ------
    if (classification.intent === "constitution_question") {
      return NextResponse.json({
        intent: "constitution_question",
        // 2026-07-28 audit: this used to promise "citing the real clause" even
        // though /constitution had no ingestion path and could only answer from
        // a fictional sample. The upload now exists, but whether THIS org has
        // used it is a device-local fact this route cannot see — so the wording
        // no longer makes a promise on the page's behalf.
        summary: {
          bm: "Soalan perlembagaan — halaman Perlembagaan menjawabnya dan memetik fasal yang menjadi asas jawapan. Soalan anda sudah diisi di sana. Kalau anda belum mengambil gambar perlembagaan anda, halaman itu akan memberitahu anda.",
          zh: "这是章程的问题 —— 章程页面会回答，并引出答案所依据的条文。您的问题已经自动填好了。如果您还没拍下自己的章程，那一页会提醒您。",
          en: "A constitution question — the Constitution page answers it and quotes the clause the answer rests on. Your question is pre-filled there. If you have not photographed your constitution yet, that page will tell you.",
        },
        button: {
          href: `/constitution?q=${encodeURIComponent(question)}`,
          bm: "Pergi ke Perlembagaan",
          zh: "前往章程页面",
          en: "Go to Constitution",
        },
        ...(await usageFields(org.id)),
      });
    }

    // --- record search: query (RLS) → TS math → 1 summarise call -----------
    let summariseCharge: UsageCharge;
    try {
      summariseCharge = await checkAndRecordUsage(org.id, "ask_summarise");
    } catch (e) {
      return quotaOrServerError(e);
    }

    const { rows, totalsText } = await searchRecords(org.id, classification);

    if (rows.total === 0) {
      // Nothing matched — deterministic answer, refund the unused summarise
      // charge (no second AI call happened).
      await refundUsage(org.id, summariseCharge);
      return NextResponse.json({
        intent: "record_search",
        summary: {
          bm: "Tiada rekod yang sepadan dengan carian ini dalam pertubuhan aktif anda.",
          zh: "当前组织中没有符合此搜索的记录。",
          en: "No records in your active organisation match this search.",
        },
        button: searchButton(classification),
        ...(await usageFields(org.id)),
      });
    }

    const summary = await callWithRetry(
      () =>
        askSummarisePrompt({
          question,
          rowsJson: JSON.stringify(rows.byKind),
          totalsText,
          todayIso,
        }),
      (raw) => parseAskSummary(raw),
      provider,
      createUsageRecorder(org.id, summariseCharge),
    );
    if (!summary) {
      return NextResponse.json(
        {
          error: joinUserError({
            bm: "AI tidak dapat meringkaskan jawapan kali ini. Rekod anda selamat. Cuba tanya sekali lagi, atau buka halaman rekod terus.",
            zh: "AI 这次没能整理出答案。您的记录都还在。请再问一次，或者直接打开记录页面查看。",
            en: "The AI could not summarise an answer this time. Your records are safe. Ask again, or open the records page directly.",
          }),
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      intent: "record_search",
      summary: {
        bm: summary.summary_bm,
        zh: summary.summary_zh,
        en: summary.summary_en,
      },
      totals: totalsText,
      button: searchButton(classification),
      ...(await usageFields(org.id)),
    });
  } catch {
    // No contents in logs (PDPA).
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }
}

// --- helpers -----------------------------------------------------------------

/**
 * The meter fields every answer carries back, read once.
 *
 * 2026-08-22: `remaining` used to be built inline at five different return
 * sites. Adding the percentage next to it would have meant five more chances
 * for one branch to disagree with the others about what the meter says, so the
 * pair is produced in one place instead.
 *
 * `usedPct` is the share of the MONTHLY FREE QUOTA spent (see usage-core) — not
 * a share of free + purchased credits, which would fall when you buy more.
 * Both are null when the usage row cannot be read: null means "unknown", and
 * the UI hides the badge rather than printing a made-up 0.
 */
async function usageFields(
  orgId: number,
): Promise<{ remaining: number | null; usedPct: number | null }> {
  const usage = await getUsage(orgId);
  return {
    remaining: usage?.totalRemaining ?? null,
    usedPct: usage?.usedPct ?? null,
  };
}


function quotaOrServerError(e: unknown) {
  // 2026-08-21: going too fast is a 429, not a 500 and not a 402 — the fix is
  // to wait, not to buy more, and the message says so.
  if (e instanceof RateLimitedError) {
    return NextResponse.json(
      { error: joinUserError(RATE_LIMITED_MESSAGE), code: "RATE_LIMITED" },
      { status: 429 },
    );
  }
  if (e instanceof QuotaExceededError) {
    return NextResponse.json(
      {
        // The zh variant existed and was being dropped on the floor here.
        error: joinUserError(QUOTA_BLOCKED_MESSAGE),
        code: "QUOTA_EXCEEDED",
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

/** Call the model, zod-validate; on failure retry ONCE with the errors
 *  appended (CLAUDE.md rule 7). Returns null after the second failure. */
async function callWithRetry<T>(
  buildPrompt: () => string,
  parse: (
    raw: unknown,
  ) => { success: true; data: T } | { success: false; error: ZodError<T> },
  provider: {
    extractJson(req: {
      prompt: string;
      onUsage?: (usage: TokenUsage) => void;
    }): Promise<unknown>;
  },
  onUsage?: (usage: TokenUsage) => void,
): Promise<T | null> {
  const prompt = buildPrompt();
  let raw: unknown;
  try {
    raw = await provider.extractJson({ prompt, onUsage });
  } catch {
    return null;
  }
  let parsed = parse(raw);
  if (parsed.success) return parsed.data;

  const issues = parsed.error.issues
    .slice(0, 10)
    .map((i) => `${i.path.map(String).join(".")}: ${i.message}`)
    .join("\n");
  try {
    raw = await provider.extractJson({
      prompt: `${prompt}

YOUR PREVIOUS ATTEMPT FAILED VALIDATION with these errors — fix them and respond with ONLY the corrected JSON:
${issues}`,
      onUsage,
    });
  } catch {
    return null;
  }
  parsed = parse(raw);
  return parsed.success ? parsed.data : null;
}

function searchButton(c: AskClassification) {
  return {
    href: recordSearchHref(c.record_kinds as RecordKind[]),
    bm: "Pergi ke halaman",
    zh: "前往页面",
    en: "Go to page",
  };
}

/** RLS-scoped queries per record kind. Only masked donor values are read.
 *  Every total below is TypeScript math (Hard Rule 2). */
async function searchRecords(orgId: number, c: AskClassification) {
  const supabase = await getSupabaseServer();
  const kinds: RecordKind[] =
    c.record_kinds.length > 0
      ? (c.record_kinds as RecordKind[])
      : ["donations", "receipts", "minutes", "events", "deadlines"];
  const text = c.text_filter?.trim() || null;

  const byKind: Record<string, unknown[]> = {};
  const totalsLines: string[] = [];
  let total = 0;

  if (kinds.includes("donations")) {
    let q = supabase
      .from("donations")
      .select("donated_at, amount_cents, donor_masked, purpose, custody_status")
      .eq("org_id", orgId)
      .order("donated_at", { ascending: false })
      .limit(ROW_LIMIT);
    if (c.date_from) q = q.gte("donated_at", c.date_from);
    if (c.date_to) q = q.lte("donated_at", c.date_to);
    if (text) q = q.or(`donor_masked.ilike.%${text}%,purpose.ilike.%${text}%`);
    const { data } = await q;
    const rows = data ?? [];
    byKind.donations = rows;
    total += rows.length;
    totalsLines.push(
      `Donations matched: ${rows.length}, total ${formatRinggit(sumAmountCents(rows))}`,
    );
  }

  if (kinds.includes("receipts")) {
    let q = supabase
      .from("receipts")
      .select(
        "receipt_no, issued_at, donation:donations!receipts_donation_id_fkey (amount_cents, donor_masked)",
      )
      .eq("org_id", orgId)
      .order("issued_at", { ascending: false })
      .limit(ROW_LIMIT);
    if (c.date_from) q = q.gte("issued_at", `${c.date_from}T00:00:00Z`);
    if (c.date_to) q = q.lte("issued_at", `${c.date_to}T23:59:59Z`);
    const { data } = await q;
    const rows = data ?? [];
    byKind.receipts = rows;
    total += rows.length;
    const cents = sumAmountCents(
      rows.map((r) => {
        const d = r.donation as { amount_cents: number | null } | { amount_cents: number | null }[] | null;
        const one = Array.isArray(d) ? d[0] : d;
        return { amount_cents: one?.amount_cents ?? 0 };
      }),
    );
    totalsLines.push(
      `Receipts matched: ${rows.length}, total ${formatRinggit(cents)}`,
    );
  }

  if (kinds.includes("minutes")) {
    let q = supabase
      .from("minutes_docs")
      .select("meeting_type, meeting_date, status, confirmed_by")
      .eq("org_id", orgId)
      .order("meeting_date", { ascending: false })
      .limit(ROW_LIMIT);
    if (c.date_from) q = q.gte("meeting_date", c.date_from);
    if (c.date_to) q = q.lte("meeting_date", c.date_to);
    const { data } = await q;
    const rows = data ?? [];
    byKind.minutes = rows;
    total += rows.length;
    totalsLines.push(`Minutes documents matched: ${rows.length}`);
  }

  if (kinds.includes("events")) {
    let q = supabase
      .from("events_meetings")
      .select("title, starts_at, venue_text, kind")
      .eq("org_id", orgId)
      .order("starts_at", { ascending: false })
      .limit(ROW_LIMIT);
    if (c.date_from) q = q.gte("starts_at", `${c.date_from}T00:00:00Z`);
    if (c.date_to) q = q.lte("starts_at", `${c.date_to}T23:59:59Z`);
    if (text) q = q.ilike("title", `%${text}%`);
    const { data } = await q;
    const rows = data ?? [];
    byKind.events = rows;
    total += rows.length;
    totalsLines.push(`Events matched: ${rows.length}`);
  }

  if (kinds.includes("deadlines")) {
    let q = supabase
      .from("deadlines")
      .select("kind, due_date, status, source")
      .eq("org_id", orgId)
      .order("due_date", { ascending: true })
      .limit(ROW_LIMIT);
    if (c.date_from) q = q.gte("due_date", c.date_from);
    if (c.date_to) q = q.lte("due_date", c.date_to);
    const { data } = await q;
    const rows = data ?? [];
    byKind.deadlines = rows;
    total += rows.length;
    totalsLines.push(`Deadlines matched: ${rows.length}`);
  }

  return {
    rows: { byKind, total },
    totalsText: totalsLines.join("\n"),
  };
}
