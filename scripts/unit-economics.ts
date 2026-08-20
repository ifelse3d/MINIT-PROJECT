/**
 * Prints the unit-economics model. Run with:  npm run economics
 *
 * The model itself lives in `src/lib/unit-economics.ts` so it can be unit-tested.
 * This file only formats it. Paste the output into competition documents — never
 * retype a margin by hand.
 */
import {
  SCENARIOS,
  WORK_ITEMS,
  TIERS_100,
  evaluate,
  formatMarkdown,
  callCostUsd,
  SCENARIO_TODAY,
} from "../src/lib/unit-economics";

const results = SCENARIOS.map(evaluate);

console.log("\n=== Minit unit economics — A MODEL, NOT A MEASUREMENT ===");
console.log("ai_usage does not yet record tokens or cost, so none of this is");
console.log("reconciled against an invoice. Every variable takes its expensive side.\n");

console.log("--- Revenue mix (100 organisations + 1 HQ account) ---");
for (const t of TIERS_100) {
  console.log(`  ${t.count.toString().padStart(3)} x ${t.label.padEnd(30)} = RM${(t.count * t.price).toLocaleString()}`);
}
console.log(`    1 x ${"Network HQ account (RM150)".padEnd(30)} = RM150`);
console.log(`  TOTAL REVENUE = RM${results[0].revenueMyr.toLocaleString()} / month\n`);

console.log("--- Workload per organisation per month ---");
console.log("  item                                    calls   in tok   out tok   USD (today's model)");
for (const item of WORK_ITEMS) {
  const usd = item.volume * callCostUsd(item, SCENARIO_TODAY.routing[item.task]);
  console.log(
    `  ${item.label.padEnd(38)} ${item.volume.toString().padStart(5)} ${item.inputTokens
      .toLocaleString()
      .padStart(8)} ${item.outputTokens.toLocaleString().padStart(9)}   $${usd.toFixed(4)}`,
  );
}
console.log("  + 20% retry buffer on every line\n");

console.log("--- Scenarios ---");
console.log(formatMarkdown(results));

const [today, worst, routed, geminiOnly, routedSafe] = results;

console.log("\n--- What to quote ---");
console.log(
  `  QUOTE THIS: ${routedSafe.grossMarginPct.toFixed(1)}% gross margin, RM${routedSafe.costPerOrgMyr.toFixed(
    2,
  )} of cost per organisation per month.`,
);
console.log("  That is scenario E, carrying the PESSIMISTIC end of every other variable,");
console.log("  so it is a floor for that architecture, not a best case.");
console.log("  Say 'modelled', and say routing is planned, not yet shipped.\n");
console.log(
  `  DO NOT quote scenario C (${routed.grossMarginPct.toFixed(1)}%). It is the better-looking number,`,
);
console.log("  but it prices the HANDWRITING job on gpt-5.6-luna, which has never been run");
console.log("  against our eval set — so its headline depends on an accuracy substitution");
console.log("  nobody has tested. E moves only classification and chat, and leaves the hard");
console.log("  task on the model we have actually measured. Two points of margin is a cheap");
console.log("  price for a number that survives the question 'how do you know?'.\n");
console.log(
  `  FLOOR WITH NO NEW ACCOUNT: scenario D, ${geminiOnly.grossMarginPct.toFixed(
    1,
  )}% — the existing Gemini key alone.`,
);
console.log("  C, D and E ALL need the four AI_MODEL_* variables set; C and E also need an");
console.log("  OpenAI key, which did not exist as of 2026-08-05. Today, unset, we run at A.\n");

console.log("--- The finding that matters ---");
console.log(
  `  One frontier model for every task does NOT clear a software margin: ${today.grossMarginPct.toFixed(
    1,
  )}% on today's`,
);
console.log(
  `  gemini-3.5-flash, ${worst.grossMarginPct.toFixed(1)}% on claude-sonnet-5 at its post-promotion price.`,
);
const totalCalls = WORK_ITEMS.reduce((n, i) => n + i.volume, 0);
const easyCalls = WORK_ITEMS.filter((i) => i.task === "classify" || i.task === "chat").reduce(
  (n, i) => n + i.volume,
  0,
);
console.log(
  `  Classification and chat are ${((easyCalls / totalCalls) * 100).toFixed(
    0,
  )}% of call volume (${easyCalls}/${totalCalls}) and need none of that capability.`,
);
console.log("  Per-task routing is therefore a COMMERCIAL requirement, not an optimisation.\n");
