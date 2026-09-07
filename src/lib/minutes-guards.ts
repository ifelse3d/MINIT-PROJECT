import {
  containsWholeLatinRun,
  latinNameRuns,
  sourcesOf,
  type MinutesPlan,
} from "@/lib/minutes-compose";
import { BM_GLOSSARY, looksLikeChineseName } from "@/lib/bm-glossary";

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

// ---------------------------------------------------------------------------
// 🔴 A CHINESE NAME MUST SURVIVE IN CHINESE (work order 125 §1, J 2026-09-07
// on the live site: the BM document read "Cadangan oleh <pinyin>, disokong
// oleh <pinyin>" — three names the page wrote in characters, spelled by the
// model in letters it made up. Nothing on the page was misread; the model
// romanised.)
//
// The prompt has said "never romanised" since 2026-08-19 and the model did it
// anyway — the living example of D53: a rule the prompt states is not a rule
// until code holds it. checkNames guards the OTHER direction only (Chinese
// that came from nowhere); a name that turned into Latin letters leaves no
// Chinese behind to compare, so nothing fired. This is the mirror.
//
// What counts as a name (寧缺勿濫 — a guard that rejects a correct document
// is worse than none, because the second miss sends the WHOLE document to
// the plain template):
//   * the glossary's ordinary vocabulary is blanked first (主席, 动议, 附议,
//     晚宴, 查账员… are never people), along with the organisation's own
//     glossary terms and a short list of everyday words that happen to OPEN
//     on a surname character (游行, 谢谢, 顾问, 余额, 周年…);
//   * what is left is a run of 2–4 characters opening on a Malaysian Chinese
//     surname (looksLikeChineseName — the same test the BM guard's mapping
//     table uses to decide what a person must spell from an identity card);
//   * a THREE- or FOUR-character run of that shape is a person, and must
//     appear character for character in the phrased line;
//   * a TWO-character run is as often a word as a person (周会, 许可, 曾任),
//     so it is demanded only when the phrased line also GREW a Latin
//     name-shaped run the source never carried — the fingerprint of a
//     romanised name. A two-character name merely omitted is not caught
//     here; a merged line's is (checkMergedFacts).
//
// One direction only: Chinese that appeared from nowhere stays checkNames'
// job. BM/EN documents only — in a Chinese document every name is already
// in characters and there is nothing to compare (same reason checkNames
// skips zh). Pure; fixed-input tested.
// ---------------------------------------------------------------------------

/** Everyday words that open on a surname character. Blanked before the
 *  name test so 游行队伍 → 队伍 (no surname), 谢谢大家 → 大家, 顾问团 →
 *  团. Two-character prefixes on purpose: they strip the head of any
 *  compound built on them. Never a person's name. */
const ORDINARY_WORDS_WITH_SURNAME_INITIAL: readonly string[] = [
  "游行", "游戏", "游泳", "游览", "谢谢", "谢意", "顾问", "顾客", "余额", "余下",
  "许多", "许可", "曾经", "曾任", "周年", "周会", "周末", "周日", "周一", "周二",
  "周三", "周四", "周五", "周六", "董事", "范围", "范例", "任何", "任务", "任期",
  "陆续", "陆路", "简报", "简单", "简介", "简章", "程序", "程度", "程式", "张贴",
  "张开", "文件", "文娱", "文书", "文告", "金额", "金钱", "金牌", "常务", "常年",
  "马来", "马上", "方案", "方面", "方便", "方向", "何时", "何况", "何必", "尤其",
  "高兴", "高中", "高级", "高度", "高手", "高层", "严重", "严格", "温馨", "温度",
  "康乐", "康复", "龙舟", "童军", "童年", "纪念", "纪律", "官方", "钟点", "钟头",
  "石头", "石碑", "白天", "白色", "田径", "武术", "于是", "段落", "钱财", "韩国",
  "黎明", "易于", "庄严", "辜负", "罗列", "罗马", "陈述", "陈列", "黄色", "王国",
  "郑重", "洪水", "徐徐", "叶子", "苏打", "杜绝", "雷雨", "贺卡", "贺词",
  "毛病", "万一", "万事", "萧条", "林业",
];

/** The person-name runs of ONE source text — after the glossary and the
 *  everyday-word list have been blanked. Exported for the document page's
 *  last-resort table and for tests. */
export function chineseNameRuns(text: string, extraTerms: readonly string[] = []): string[] {
  let remaining = text;
  const blank = [
    ...BM_GLOSSARY.map(([from]) => from),
    ...extraTerms,
    ...ORDINARY_WORDS_WITH_SURNAME_INITIAL,
  ]
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const term of blank) {
    if (remaining.includes(term)) remaining = remaining.split(term).join(" ");
  }
  const out: string[] = [];
  for (const run of remaining.match(/[㐀-䶿一-鿿豈-﫿]{2,}/g) ?? []) {
    if (looksLikeChineseName(run) && !out.includes(run)) out.push(run);
  }
  return out;
}

/** Did the phrased line grow a Latin name-shaped run its source never had?
 *  The fingerprint of a romanised name. */
function grewLatinName(text: string, source: string): boolean {
  return latinNameRuns(text).some((run) => !containsWholeLatinRun(source, run));
}

/**
 * For every item: each person-name run of each source must appear character
 * for character in the item's text (a merged item: anywhere in the merged
 * text, checkMergedFacts' reading). Returns the offending source indices so
 * the model is sent back once with them (rule 7); the second miss sends the
 * document to the plain template, which copies the page and therefore
 * cannot romanise anybody.
 */
export function checkChineseNamesSurvive(
  plan: { sections: { items: { source: number | number[]; text: string }[] }[]; unresolved: { source: number | number[]; text: string }[] },
  sourceTexts: readonly string[],
  extraTerms: readonly string[] = [],
): { ok: boolean; romanised: number[] } {
  const romanised = new Set<number>();
  const inspect = (item: { source: number | number[]; text: string }) => {
    const indices = sourcesOf(item);
    const source = indices
      .map((i) => sourceTexts[i])
      .filter((s): s is string => s !== undefined)
      .join("\n");
    if (source === "") return;
    const grew = grewLatinName(item.text, source);
    for (const idx of indices) {
      const src = sourceTexts[idx];
      if (src === undefined) continue;
      for (const name of chineseNameRuns(src, extraTerms)) {
        if (item.text.includes(name)) continue;
        if (name.length >= 3 || grew) romanised.add(idx);
      }
    }
  };
  for (const s of plan.sections) s.items.forEach(inspect);
  plan.unresolved.forEach(inspect);
  return { ok: romanised.size === 0, romanised: [...romanised].sort((a, b) => a - b) };
}

/**
 * 125 §1-3, the LAST NET on the document page: the person-name runs the
 * page carried in characters that the finished document no longer carries —
 * in the order the page named them, each once. A name whose known
 * identity-card spelling (`spellingOf`, from the roster or the person's own
 * typing) IS in the document is not a loss but the honest replacement, and
 * is left out. `protect` is blanked before the name test (the roster's
 * names, the registered org name, the signer — never vocabulary).
 * Pure; the page only renders the list.
 */
export function droppedChineseNames(
  sourceTexts: readonly string[],
  document: string,
  protect: readonly string[] = [],
  spellingOf: (name: string) => string = () => "",
): string[] {
  const out: string[] = [];
  for (const text of sourceTexts) {
    for (const name of chineseNameRuns(text, protect)) {
      if (document.includes(name) || out.includes(name)) continue;
      const spelt = spellingOf(name).trim();
      if (spelt !== "" && document.includes(spelt)) continue;
      out.push(name);
    }
  }
  return out;
}
