/**
 * Unit-economics model — the arithmetic behind the gross-margin figure we quote.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The pitch materials used to carry a bare number ("~85% gross margin"). A bare
 * number cannot be checked, cannot be updated when a model price changes, and
 * reads as a measurement when it is a projection. This file is the formula: every
 * variable is named, sourced and swappable. Change a price here, re-run, and the
 * margin recomputes.
 *
 *   npm run economics
 *
 * IT IS A MODEL, NOT A MEASUREMENT. `ai_usage` does not yet record tokens, model
 * or cost (migration `20260803000000_ai_usage_cost.sql` is unapplied), so nothing
 * here has been reconciled against an invoice. Everything we publish must say so.
 *
 * HOUSE RULE FOR THIS FILE: when a variable could go either way, take the
 * EXPENSIVE side. A margin we can only beat is safe; one we have to defend is not.
 */

/** USD price per 1,000,000 tokens, from the vendor's own price page. */
export type ModelPrice = {
  readonly name: string;
  readonly inputPerMTok: number;
  readonly outputPerMTok: number;
};

/**
 * Official list prices, checked 2026-08-03 (`docs/AI-API-选型与成本.md` §1).
 * Verify before quoting: vendors retire models and promotions end.
 */
/** The day someone last verified MODEL_PRICES against the vendors' price
 *  pages. Price tables rot (STATE trap) — every consumer that prints a price
 *  must print this date next to it. Update BOTH when re-verifying. */
export const PRICES_CHECKED_ON = "2026-08-03";

export const MODEL_PRICES = {
  /** Cheapest usable vision model; recommended for classify + chat only. */
  gpt5Nano: { name: "gpt-5-nano", inputPerMTok: 0.05, outputPerMTok: 0.4 },
  /** Cheap, 1.5M context, vision. Candidate extractor pending eval. */
  gpt56Luna: { name: "gpt-5.6-luna", inputPerMTok: 0.2, outputPerMTok: 1.2 },
  gemini35FlashLite: { name: "gemini-3.5-flash-lite", inputPerMTok: 0.3, outputPerMTok: 2.5 },
  /** Kept for the scenario table; `AI_MODEL_EXTRACT` points at flash-lite. */
  gemini35Flash: { name: "gemini-3.5-flash", inputPerMTok: 1.5, outputPerMTok: 9.0 },
  /** Intended production provider. POST-PROMOTION price (from 2026-09-01). */
  claudeSonnet5: { name: "claude-sonnet-5 (from 2026-09-01)", inputPerMTok: 3.0, outputPerMTok: 15.0 },
} as const satisfies Record<string, ModelPrice>;

/** The kinds of AI call the product actually makes, one per API route family. */
export type TaskKind = "classify" | "extract" | "longDoc" | "chat";

/** One line of AI work, priced per organisation per month. */
export type WorkItem = {
  readonly key: string;
  readonly label: string;
  readonly task: TaskKind;
  /** Calls per organisation per month. */
  readonly volume: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Where the numbers came from — kept in the type so it survives refactors. */
  readonly source: string;
};

export type Tier = {
  readonly label: string;
  /** MYR per organisation per month. */
  readonly price: number;
  readonly count: number;
};

export type Assumptions = {
  readonly label: string;
  readonly tiers: readonly Tier[];
  /** Network HQ accounts, priced separately from the branches they cover. */
  readonly hqAccounts: number;
  readonly hqPrice: number;
  readonly items: readonly WorkItem[];
  /** Which model serves which task. Swap one entry to re-price the whole model. */
  readonly routing: Readonly<Record<TaskKind, ModelPrice>>;
  /** Share of calls repeated after a failure or a zod parse retry. 0.2 = +20%. */
  readonly retryBuffer: number;
  /** MYR per USD. Take a WEAK ringgit — it makes costs look worse, not better. */
  readonly usdToMyr: number;
  /** Total cloud spend per month for the whole fleet, in MYR (not per org). */
  readonly cloudMyrPerMonth: number;
  /** Payment gateway take rate on revenue. 0.03 = 3%. */
  readonly paymentFeeRate: number;
};

export type Result = {
  readonly label: string;
  readonly orgs: number;
  readonly revenueMyr: number;
  readonly aiUsdPerOrg: number;
  readonly aiMyr: number;
  readonly cloudMyr: number;
  readonly paymentFeesMyr: number;
  readonly cogsMyr: number;
  readonly costPerOrgMyr: number;
  readonly grossMarginPct: number;
  readonly perItemUsd: readonly { key: string; label: string; usd: number }[];
};

/** Organisations billed, excluding HQ accounts (an HQ is not an organisation). */
export function orgCount(a: Assumptions): number {
  return a.tiers.reduce((n, t) => n + t.count, 0);
}

export function monthlyRevenueMyr(a: Assumptions): number {
  const tiers = a.tiers.reduce((sum, t) => sum + t.price * t.count, 0);
  return tiers + a.hqAccounts * a.hqPrice;
}

/** USD cost of one call: (in × inPrice + out × outPrice) ÷ 1,000,000. */
export function callCostUsd(item: WorkItem, price: ModelPrice): number {
  return (item.inputTokens * price.inputPerMTok + item.outputTokens * price.outputPerMTok) / 1_000_000;
}

/** USD of AI per organisation per month, retry buffer included. */
export function aiCostUsdPerOrg(a: Assumptions): number {
  const raw = a.items.reduce(
    (sum, item) => sum + item.volume * callCostUsd(item, a.routing[item.task]),
    0,
  );
  return raw * (1 + a.retryBuffer);
}

export function evaluate(a: Assumptions): Result {
  const orgs = orgCount(a);
  const revenueMyr = monthlyRevenueMyr(a);
  const aiUsdPerOrg = aiCostUsdPerOrg(a);
  const aiMyr = aiUsdPerOrg * a.usdToMyr * orgs;
  const paymentFeesMyr = revenueMyr * a.paymentFeeRate;
  const cogsMyr = aiMyr + a.cloudMyrPerMonth + paymentFeesMyr;

  return {
    label: a.label,
    orgs,
    revenueMyr,
    aiUsdPerOrg,
    aiMyr,
    cloudMyr: a.cloudMyrPerMonth,
    paymentFeesMyr,
    cogsMyr,
    costPerOrgMyr: cogsMyr / orgs,
    grossMarginPct: ((revenueMyr - cogsMyr) / revenueMyr) * 100,
    perItemUsd: a.items.map((item) => ({
      key: item.key,
      label: item.label,
      usd: item.volume * callCostUsd(item, a.routing[item.task]) * (1 + a.retryBuffer),
    })),
  };
}

// ---------------------------------------------------------------------------
// The assumption set we publish. Every number below is deliberately the
// PESSIMISTIC end of what we have documented.
// ---------------------------------------------------------------------------

/**
 * Pricing as submitted (deck p9 + `competition/summary-onepager.md`).
 * A hundred organisations on a mix weighted towards the cheapest tier — a
 * pessimistic revenue assumption, since it is the tier that pays least.
 */
export const TIERS_100: readonly Tier[] = [
  { label: "Small society (RM39)", price: 39, count: 60 },
  { label: "Active society (RM99)", price: 99, count: 30 },
  { label: "High-volume branch (RM188)", price: 188, count: 10 },
];

/**
 * Workload per organisation per month.
 *
 * Each volume is the HIGHER of our two documented profiles:
 *   - `docs/AI-API-选型与成本.md` (2026-08-03): 20 meeting reports, 15 ledger
 *     pages, 50 Q&As, 35 classifications.
 *   - `Minit_AI_Cost_Model.xlsx` (2026-07-10): 12 meeting reports, 60 ledger
 *     pages, 300 Q&As, festival-season branch.
 * Taking the higher of each gives an organisation busier than either profile.
 *
 * Token sizes take the TOP of the documented range (prompt 1,500–1,800, photo
 * ~1,300, output 1,200–2,200) — so every vision call is charged at 3,100 in /
 * 2,200 out, the cost of the heaviest page we have modelled.
 */
export const WORK_ITEMS: readonly WorkItem[] = [
  {
    key: "classify",
    label: "Intake classification (/api/intake)",
    task: "classify",
    volume: 100,
    inputTokens: 3_100,
    outputTokens: 100,
    source: "one per uploaded document, rounded up from 81",
  },
  {
    key: "minutes",
    label: "Meeting-notes page extraction",
    task: "extract",
    volume: 20,
    inputTokens: 3_100,
    outputTokens: 2_200,
    source: "20/month = higher of the two profiles; tokens at range top",
  },
  {
    key: "ledger",
    label: "Donation-ledger page extraction",
    task: "extract",
    volume: 60,
    inputTokens: 3_100,
    outputTokens: 2_200,
    source: "60/month = festival-season branch (7/10 xlsx)",
  },
  {
    key: "constitution",
    label: "Constitution ingest (30-page PDF)",
    task: "longDoc",
    volume: 1,
    inputTokens: 63_300,
    outputTokens: 2_200,
    source: "charged monthly although it is realistically once per organisation",
  },
  {
    key: "ask",
    label: "Constitution Q&A (/api/ask, clause context in prompt)",
    task: "chat",
    volume: 50,
    inputTokens: 25_000,
    outputTokens: 800,
    source: "input = the 100KB pre-filter ceiling from CLAUDE.md, i.e. the worst case",
  },
  {
    key: "chat",
    label: "Assistant turns (/api/chat, capped, no records in context)",
    task: "chat",
    volume: 250,
    inputTokens: 2_000,
    outputTokens: 500,
    source: "250/month; 300 total Q&A+chat = 7/10 xlsx. Token size is an ESTIMATE",
  },
];

/**
 * NOT modelled, and each would only improve the number:
 *  - prompt caching (cached input is ~1/10 of input price) is not implemented;
 *  - Batch API on constitution ingest is a straight 50% off;
 *  - the constitution is realistically ingested once, not monthly.
 * NOT modelled, and would make it worse: human support time, currently unpaid
 * founder time. Say so rather than pretending COGS is only machines.
 */

const BASE = {
  tiers: TIERS_100,
  hqAccounts: 1,
  hqPrice: 150,
  items: WORK_ITEMS,
  /** +20% for failed calls and zod-parse retries (7/10 xlsx). */
  retryBuffer: 0.2,
  /** 4.70, the weaker of our two documented rates (8/3 used 4.09). */
  usdToMyr: 4.7,
  /** RM667/month was the original estimate; we publish it doubled. */
  cloudMyrPerMonth: 1_334,
  /** Malaysian gateways land around 2–3%; take 3%. */
  paymentFeeRate: 0.03,
} as const;

/** Everything on one expensive model — today's `DEFAULT_MODEL`. */
export const SCENARIO_TODAY: Assumptions = {
  ...BASE,
  label: "A · Today: one model for everything (gemini-3.5-flash)",
  routing: {
    classify: MODEL_PRICES.gemini35Flash,
    extract: MODEL_PRICES.gemini35Flash,
    longDoc: MODEL_PRICES.gemini35Flash,
    chat: MODEL_PRICES.gemini35Flash,
  },
};

/** The most expensive thing we could plausibly end up doing. */
export const SCENARIO_WORST: Assumptions = {
  ...BASE,
  label: "B · Worst case: intended production provider at post-promo price (claude-sonnet-5)",
  routing: {
    classify: MODEL_PRICES.claudeSonnet5,
    extract: MODEL_PRICES.claudeSonnet5,
    longDoc: MODEL_PRICES.claudeSonnet5,
    chat: MODEL_PRICES.claudeSonnet5,
  },
};

/** Per-task routing — the plan in `docs/AI-API-选型与成本.md` §1.5. */
export const SCENARIO_ROUTED: Assumptions = {
  ...BASE,
  label: "C · Planned routing: cheap model for easy tasks, good model for extraction",
  routing: {
    classify: MODEL_PRICES.gpt5Nano,
    extract: MODEL_PRICES.gpt56Luna,
    longDoc: MODEL_PRICES.gpt56Luna,
    chat: MODEL_PRICES.gpt5Nano,
  },
};

/**
 * What we can actually switch on TODAY, with the one API key that exists.
 *
 * ADDED 2026-08-05, and the reason matters. Scenario C is the number we quote
 * (75.4%), but every one of its four models is an OpenAI model — so C is not
 * reachable without an OpenAI account. The only key in play is Gemini's, and
 * the cheapest Gemini vision model in our price table is 3.5-flash-lite, which
 * means "routing" on Gemini alone collapses to one model for all four tasks.
 *
 * This scenario exists so nobody has to guess what today's key is worth. It is
 * ALSO the honest reading of scenario A: `GEMINI_DEFAULT_MODEL` in
 * `src/lib/ai/gemini.ts` is `gemini-3.5-flash-lite`, NOT the `gemini-3.5-flash`
 * that A prices. A is deliberately pessimistic (the house rule at the top of
 * this file), so it stays as the number we publish — but D is the closer
 * estimate of what an invoice would actually say, unless GEMINI_MODEL has been
 * set to the dearer model in `.env.local` (which this repo cannot read).
 */
export const SCENARIO_GEMINI_ONLY: Assumptions = {
  ...BASE,
  label: "D · Reachable today: Gemini key only (gemini-3.5-flash-lite everywhere)",
  routing: {
    classify: MODEL_PRICES.gemini35FlashLite,
    extract: MODEL_PRICES.gemini35FlashLite,
    longDoc: MODEL_PRICES.gemini35FlashLite,
    chat: MODEL_PRICES.gemini35FlashLite,
  },
};

/**
 * Routing that does NOT bet the product's accuracy on an unmeasured model.
 *
 * ADDED 2026-08-05. Scenario C moves ALL FOUR tasks to OpenAI, including
 * `extract` — the handwritten mixed-language job that is the actual product.
 * gpt-5.6-luna has never been run against our eval set, and the header of
 * `src/lib/ai/openai.ts` warns in as many words that OpenAI may be weaker on
 * non-Latin script. So C's headline quietly depends on an accuracy substitution
 * nobody has tested.
 *
 * E keeps extraction and long documents on the model we have actually measured
 * (Gemini) and moves only classification and assistant turns — the easy 83% of
 * call volume — to the cheap model. It is the routing we can defend clause by
 * clause: the saving comes from tasks where a small model is demonstrably
 * enough, and the hard task does not move until `npm run eval` says it may.
 *
 * It still needs an OpenAI key, but only for work where being wrong is cheap.
 */
export const SCENARIO_ROUTED_SAFE: Assumptions = {
  ...BASE,
  label: "E · Defensible routing: cheap model for easy tasks, MEASURED model still reads the handwriting",
  routing: {
    classify: MODEL_PRICES.gpt5Nano,
    extract: MODEL_PRICES.gemini35FlashLite,
    longDoc: MODEL_PRICES.gemini35FlashLite,
    chat: MODEL_PRICES.gpt5Nano,
  },
};

export const SCENARIOS: readonly Assumptions[] = [
  SCENARIO_TODAY,
  SCENARIO_WORST,
  SCENARIO_ROUTED,
  SCENARIO_GEMINI_ONLY,
  SCENARIO_ROUTED_SAFE,
];

const myr = (n: number) => `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Markdown so the output can be pasted straight into the competition docs. */
export function formatMarkdown(results: readonly Result[]): string {
  const head = "| Scenario | AI / org / mo | AI total | Cloud | Payment fees | COGS | Cost / org | Revenue | **Gross margin** |";
  const rule = "|---|---|---|---|---|---|---|---|---|";
  const rows = results.map(
    (r) =>
      `| ${r.label} | ${myr(r.aiUsdPerOrg * 4.7)} | ${myr(r.aiMyr)} | ${myr(r.cloudMyr)} | ${myr(r.paymentFeesMyr)} | ${myr(r.cogsMyr)} | ${myr(r.costPerOrgMyr)} | ${myr(r.revenueMyr)} | **${r.grossMarginPct.toFixed(1)}%** |`,
  );
  return [head, rule, ...rows].join("\n");
}
