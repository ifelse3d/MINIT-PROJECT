import { latinNameRuns, sourcesOf, type MinutesPlan } from "@/lib/minutes-compose";

// ---------------------------------------------------------------------------
// THE DOCUMENT-LAYER GUARDS (work order 118 §1–§2, J 2026-08-31 第 22 條).
//
// 🔴 WHY THIS FILE EXISTS. J's own committee note, item ④, reads
// 「lanti Ajk seorg. <name>」 — appoint one committee member: <name>. The
// formal document came out as "<name> ditugaskan untuk melantik seorang
// Ahli Jawatankuasa" — the person BEING appointed written as the person
// doing the appointing. Nothing was misread; the label system did it. The
// prompt demanded one of Perbincangan / Keputusan / Tindakan on EVERY line,
// and a Malay "Tindakan" sentence needs a doer, so the model supplied one.
//
// 118 §0: the label is now EARNED by the words on the page, and a doer or a
// verdict the page never carried is INVENTION. Both are checked here, by
// matching strings, because "the prompt says so" is exactly what failed.
// Same split as every other guard in this pipeline (minutes-compose.ts):
// judgement to the model, arithmetic to the code.
//
// Pure: no AI, no I/O. Unit tested (minutes-guards.test.ts).
// ---------------------------------------------------------------------------

/** Words with which a page RECORDS a decision — BM, Chinese, English. A
 *  "keputusan" label is earned only when one of these is in the item. */
const DECISION_WORDS =
  /(memutuskan|diputuskan|keputusan|\blulus\b|diluluskan|meluluskan|kelulusan|bersetuju|dipersetujui|persetujuan|sebulat suara|ditolak|ditangguhkan|通过|通過|決定|决定|議決|议决|批准|同意|否决|否決|延后|延後|approved|agreed|decided|resolved|carried|rejected|deferred)/i;

/** Words with which a page ASSIGNS something to somebody. A "tindakan" label,
 *  and any doer in the phrased sentence, is earned only by one of these. */
const ASSIGNMENT_WORDS =
  /(\btugas|ditugaskan|tugasan|diminta|meminta|\barah|diarahkan|tanggungjawab|bertanggungjawab|diamanahkan|menguruskan|\burus\b|uruskan|menyediakan|sediakan|membawa|\bbawa\b|menghantar|\bhantar\b|mengetuai|ketuai|mengendalikan|kendalikan|负责|負責|委派|指派|要求|责成|責成|安排|准备|準備|主持|带头|帶頭|带队|帶隊|司仪|司儀|assigned|responsible|in charge|to bring|to prepare|to arrange|to send|to handle|will handle|to lead)/i;

/** How a phrased sentence SUPPLIES a doer or a verdict. Any of these in the
 *  output, with none of the licensing words in the source, is invention. */
const AGENT_PATTERNS = [
  /\b(ditugaskan|diminta|diarahkan|dipertanggungjawabkan|diamanahkan|dikehendaki|hendaklah|diberi tugas|dilantik untuk)\b/i,
  /\b(bertanggungjawab untuk|akan menguruskan|akan mengendalikan|akan menyediakan|akan membawa|akan mengetuai|akan menghantar)\b/i,
  /(被委派|被指派|被委托|被委託|被要求|责成|責成|由.{1,12}(负责|負責)|决定由|決定由)/,
  /\b(is tasked|was tasked|are tasked|is asked|was asked|is assigned|was assigned|are assigned|is to\b|are to\b|is responsible|are responsible|will be responsible)\b/i,
];

/** How a phrased sentence ASSERTS a decision. Licensed only by a decision
 *  word in the source (a translated verdict is fine; a new one is not). */
const VERDICT_PATTERNS = [
  /\b(mesyuarat (telah )?(memutuskan|bersetuju|meluluskan|mengesahkan)|diluluskan|dipersetujui|sebulat suara)\b/i,
  /\b(memutuskan agar|memutuskan supaya|bersetuju agar|bersetuju supaya|memutuskan bahawa|bersetuju bahawa)\b/i,
  /(会议(决定|議決|议决|通过|通過|批准|同意)|获得通过|獲得通過)/,
  /\b(the meeting (decided|agreed|approved|resolved)|was approved|was agreed|unanimously)\b/i,
];

/** Rejections and deferrals the source recorded — these may never be
 *  dropped or softened (the half of the locked list without digits). */
const NEGATIVE_WORDS =
  /(tidak diluluskan|tidak lulus|ditolak|tidak bersetuju|ditangguhkan|ditunda|tangguh|不通过|不通過|否决|否決|不批准|不同意|延后|延後|押后|押後|展期|留待|rejected|not approved|turned down|deferred|postponed|held over)/i;

const CJK_RUN = /[㐀-䶿一-鿿豈-﫿]{2,}/;

/** Does the item name anybody at all? Latin name-shaped run, or a Chinese
 *  run of two or more characters (names and class labels alike — 寧缺勿濫
 *  the other way round: a label needs a WHO, and this is the loosest
 *  reasonable test for one). */
function namesSomebody(text: string): boolean {
  return latinNameRuns(text).length > 0 || CJK_RUN.test(text);
}

export type EarnedKind = "keputusan" | "tindakan";

/**
 * 118 §1-1: which label, if any, the SOURCE TEXT earns. `undefined` is the
 * normal answer — most lines of a note are neither a verdict nor an
 * assignment, and a plain line is what they print as.
 */
export function earnedKind(
  kind: string | undefined,
  sourceTexts: readonly string[],
): EarnedKind | undefined {
  if (kind !== "keputusan" && kind !== "tindakan") return undefined;
  const joined = sourceTexts.join("\n");
  if (kind === "keputusan") return DECISION_WORDS.test(joined) ? "keputusan" : undefined;
  return ASSIGNMENT_WORDS.test(joined) && namesSomebody(joined) ? "tindakan" : undefined;
}

/**
 * A copy of the plan with every label the words do not earn removed.
 * "perbincangan" is gone entirely (118 §1-1: 其餘不掛標籤) — a line that
 * records a discussion prints as a line, not as a labelled one.
 */
export function enforceKinds(plan: MinutesPlan, sourceTexts: readonly string[]): MinutesPlan {
  return {
    sections: plan.sections.map((s) => ({
      heading: s.heading,
      items: s.items.map((it) => {
        const sources = sourcesOf(it).map((i) => sourceTexts[i] ?? "");
        const kind = earnedKind(it.kind, sources);
        const { kind: _dropped, ...rest } = it;
        void _dropped;
        return kind ? { ...rest, kind } : rest;
      }),
    })),
    unresolved: plan.unresolved,
  };
}

/**
 * 🔴 NO DOER, NO VERDICT, THAT THE PAGE DID NOT CARRY (118 §1-2).
 *
 * For every item: if the phrased text supplies a doer (ditugaskan…, 被委派…,
 * is tasked…) and none of its sources carries an assignment word, or if it
 * asserts a verdict (Mesyuarat memutuskan…, 会议通过…) and none of its
 * sources carries a decision word, the item is INVENTED and its source
 * indices are returned so the model can be sent back once (rule 7).
 *
 * A rejection or deferral the source recorded must also survive: a
 * "tidak diluluskan" that becomes a neutral sentence reads as approved.
 *
 * One direction only, on purpose: an approval word that a translation
 * rendered another way (通过 → "disahkan tanpa pindaan") is NOT flagged —
 * a guard that cries wolf on correct documents is worse than no guard.
 */
export function checkInventedAgent(
  plan: { sections: { items: { source: number | number[]; text: string }[] }[]; unresolved: { source: number | number[]; text: string }[] },
  sourceTexts: readonly string[],
): { ok: boolean; invented: number[] } {
  const invented = new Set<number>();
  const inspect = (item: { source: number | number[]; text: string }) => {
    const indices = sourcesOf(item);
    const source = indices
      .map((i) => sourceTexts[i])
      .filter((s): s is string => s !== undefined)
      .join("\n");
    if (source === "") return;
    const text = item.text;
    const doer = AGENT_PATTERNS.some((p) => p.test(text));
    const verdict = VERDICT_PATTERNS.some((p) => p.test(text));
    const licensedDoer = ASSIGNMENT_WORDS.test(source);
    const licensedVerdict = DECISION_WORDS.test(source);
    const droppedNegative = NEGATIVE_WORDS.test(source) && !NEGATIVE_WORDS.test(text);
    if ((doer && !licensedDoer) || (verdict && !licensedVerdict) || droppedNegative) {
      for (const i of indices) invented.add(i);
    }
  };
  for (const s of plan.sections) s.items.forEach(inspect);
  plan.unresolved.forEach(inspect);
  return { ok: invented.size === 0, invented: [...invented].sort((a, b) => a - b) };
}
