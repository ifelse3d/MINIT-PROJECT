/**
 * npm run eval:tools  —  does the assistant reach for the RIGHT lookup?
 *
 * WHY THIS EXISTS
 * The tool descriptions in src/lib/ai/org-tools.ts are the highest-leverage
 * strings in the assistant: they are the only thing the model has to go on when
 * it decides whether "how much did we collect" means the donations table, the
 * meeting minutes, or nothing at all. Nobody can tell by READING them whether
 * they work — you find out by asking. This asks.
 *
 * It is deliberately narrow. It measures ONE thing: given a question, which
 * tool does the model call first? Not whether the final answer is good, not
 * whether the numbers are right — those need real data and are what
 * `npm run eval` is for. A wrong tool choice makes every downstream check
 * meaningless, so it is the thing to measure first.
 *
 *   npm run eval:tools              the cases in eval/tool-choice-cases.ts
 *   npm run eval:tools -- --json    same result, machine readable
 *
 * 🔴 IT TOUCHES NO DATABASE. Every tool is stubbed with a canned result, so
 * this runs on any machine, needs no Supabase, reads nobody's records, and
 * cannot leak a donor name. What it exercises is the model's CHOICE and the
 * wire format — which makes it also the cheapest way to find out whether the
 * function-calling shapes in tool-wire.ts are right, since nobody who wrote
 * them could call a live vendor.
 *
 * NEEDS: .env.local with the chat vendor's key (GEMINI_API_KEY or
 * OPENAI_API_KEY, matching AI_MODEL_CHAT).
 * COST: one short call per case — currently 18. Fractions of a cent on the
 * cheap chat tier. Runs sequentially with a pause, like run-eval.ts, because
 * the free tier hands out 429s as routine traffic control.
 * PDPA: the questions are fictional and no record is read.
 */

// MUST come before any src/lib/ai import — see the file for why.
import "./allow-server-only";

import { config } from "dotenv";

import { getToolProvider, resolveModel } from "../src/lib/ai/provider";
import { ORG_TOOL_SPECS } from "../src/lib/ai/org-tools";
import { runToolConversation } from "../src/lib/ai/tool-runner";
import { chatPrompt } from "../src/prompts/chat";
import { TOOL_CHOICE_CASES, type ToolChoiceCase } from "../eval/tool-choice-cases";

// Same call as tune-min-score.ts: npm scripts run from the repo root.
config({ path: ".env.local" });

/** Between calls. The Gemini free tier returns 429 as routine traffic control. */
const PAUSE_MS = 1_200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Outcome = {
  case: ToolChoiceCase;
  /** What it actually called first, or null if it answered without a tool. */
  got: string | null;
  ok: boolean;
  /** Set when the call itself failed — a wire-format bug shows up here. */
  error?: string;
};

async function runCase(c: ToolChoiceCase, todayIso: string): Promise<Outcome> {
  const provider = getToolProvider("chat");
  if (!provider) {
    return {
      case: c,
      got: null,
      ok: false,
      error:
        "AI_MODEL_CHAT points at a vendor that cannot be handed tools " +
        "(anthropic / xai). Point it at gemini or openai to run this.",
    };
  }

  try {
    const result = await runToolConversation({
      provider,
      system: chatPrompt({
        orgName: "Persatuan Contoh (eval)",
        todayIso,
        history: [],
        question: c.question,
        minutesExcerpts: "",
        tools: true,
      }),
      messages: [{ role: "user", text: c.question }],
      tools: ORG_TOOL_SPECS,
      // 🔴 Stubbed. The point is the CHOICE, and a canned result keeps this
      // script off any database. The shape is deliberately plausible rather
      // than empty: a tool that returns nothing invites the model to try a
      // different one, which would measure recovery rather than first choice.
      run: async (name) => ({
        note: "eval stub — this lookup was not really performed",
        tool: name,
        rows: [],
      }),
    });
    const first = result.used[0]?.name ?? null;
    return { case: c, got: first, ok: first === c.expect };
  } catch (e) {
    return {
      case: c,
      got: null,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const { provider, model } = resolveModel("chat");
  const todayIso = new Date().toISOString().slice(0, 10);

  const outcomes: Outcome[] = [];
  for (const c of TOOL_CHOICE_CASES) {
    outcomes.push(await runCase(c, todayIso));
    await sleep(PAUSE_MS);
  }

  const passed = outcomes.filter((o) => o.ok).length;
  const errors = outcomes.filter((o) => o.error).length;

  if (json) {
    console.log(
      JSON.stringify(
        {
          provider,
          model,
          total: outcomes.length,
          passed,
          errors,
          results: outcomes.map((o) => ({
            id: o.case.id,
            question: o.case.question,
            expect: o.case.expect,
            got: o.got,
            ok: o.ok,
            error: o.error,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nTOOL CHOICE — ${provider}:${model}\n`);
  for (const o of outcomes) {
    const mark = o.ok ? "PASS" : "FAIL";
    const expect = o.case.expect ?? "(no tool)";
    const got = o.error ? `ERROR ${o.error.slice(0, 90)}` : (o.got ?? "(no tool)");
    console.log(`${mark}  ${o.case.id.padEnd(11)} ${expect.padEnd(14)} → ${got}`);
    if (!o.ok && !o.error) console.log(`      ${o.case.question}`);
  }

  console.log(`\n${passed}/${outcomes.length} chose the right lookup.`);
  if (errors > 0) {
    console.log(
      `${errors} case(s) FAILED TO CALL AT ALL. That is a wire-format or key problem,\n` +
        `not a description problem — see the symptom table in the handoff before\n` +
        `touching any tool description.`,
    );
  }
  // What to do with the number, said here so it is not left to memory: a case
  // that picks the wrong tool is a DESCRIPTION to rewrite, not a prompt rule to
  // add. Rules pile up and stop being read; a description that says what
  // question the tool answers is what the model actually chooses by.
  const wrong = outcomes.filter((o) => !o.ok && !o.error);
  if (wrong.length > 0) {
    console.log(
      `\nWrong choices are a job for the tool DESCRIPTION in src/lib/ai/org-tools.ts,\n` +
        `not for another rule in the prompt. Say what question the tool answers, in\n` +
        `the words a treasurer would use.`,
    );
  }
  process.exitCode = errors > 0 ? 1 : 0;
}

void main();
