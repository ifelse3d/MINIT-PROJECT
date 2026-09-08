import type { LangKey } from "@/lib/lang";
import type { ChatTurn } from "@/prompts/chat";

// ---------------------------------------------------------------------------
// 130 §15-2 (119 A-8): when a conversation reaches MAX_TURNS the assistant no
// longer refuses ("start again") — it folds the older turns into ONE short
// summary and carries on. The summary is a vendor call and is charged as an
// action like any other (D: reaching the vendor is what costs), and the
// person is told so in percentages. docs/助手重做-设计.md is the parent
// document; this only implements its rule that the assistant is a
// conversation, not a form with a counter.
//
// What the summary may and may not do is the same as every other prompt
// here: only what the turns actually said, no new facts, no advice.
// ---------------------------------------------------------------------------

const LANG_NAME: Record<LangKey, string> = {
  bm: "Bahasa Malaysia",
  zh: "Chinese",
  en: "English",
};

export type ChatSummaryPromptParams = {
  orgName: string;
  /** The older turns being folded away (oldest first). */
  turns: ChatTurn[];
  /** The language the summary is written in — the interface language. */
  uiLang: LangKey;
};

export function chatSummaryPrompt({ orgName, turns, uiLang }: ChatSummaryPromptParams): string {
  const transcript = turns
    .map((t) => `${t.role === "user" ? "MEMBER" : "MINITAI"}: ${t.text}`)
    .join("\n");
  return `You are MinitAI, the assistant of the Malaysian society "${orgName}". This conversation has grown long. Fold the EARLIER turns below into one short summary so the conversation can continue without re-sending them.

RULES
- Write in ${LANG_NAME[uiLang]}.
- At most 120 words. Plain sentences, no headings, no bullet symbols.
- Keep ONLY what was actually said: the topics asked about, the facts and figures MinitAI gave (with the same numbers, names and dates, copied exactly), and anything the member said they were going to do.
- Do NOT add anything that is not in the turns. Do NOT give advice. Do NOT answer any question — this is a summary, not a reply.
- If a turn was an error message or small talk, leave it out.

THE EARLIER TURNS
${transcript}

Respond with ONLY this JSON, no other text:
{"summary": "..."}`;
}
