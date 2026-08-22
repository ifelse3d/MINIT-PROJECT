/**
 * npm run tune:minscore  —  measure what MIN_SCORE should actually be.
 *
 * WHY THIS EXISTS
 * src/lib/ai/cari-minit.ts drops any hit below MIN_SCORE, and that constant was
 * a guess (0.55, "provisional"). A guess is the wrong kind of number for this
 * knob: too high and the assistant says "I could not find it" about a meeting
 * that is sitting in the database; too low and it answers a question about the
 * roof repair using the paragraph about the annual dinner. J asked for "the
 * best value" (2026-08-22), so this measures one instead of arguing about it.
 *
 * WHAT IT DOES
 * Embeds a fixture corpus of minutes (Malay + Chinese, the way real ones are
 * written) and a set of questions whose right answers are known, with the SAME
 * model and the SAME task hints the app uses — RETRIEVAL_DOCUMENT for a stored
 * chunk, RETRIEVAL_QUERY for the question. Then it sweeps the threshold and
 * prints precision / recall / F1 at each step.
 *
 *   npm run tune:minscore              the fixture corpus below
 *   npm run tune:minscore -- --json    same numbers, machine readable
 *
 * 🔴 THE FIXTURES ARE NOT J'S MINUTES. They are written to look like them, so
 * the number this prints is a defensible starting point, not the final word.
 * Re-run against real confirmed minutes once they exist (that would need a
 * database read; this script deliberately touches no database and no personal
 * data, so it runs anywhere and costs one embedding call).
 *
 * NEEDS: .env.local with the embedding vendor's key (GEMINI_API_KEY).
 * COST: about 25 short texts in two batch calls. Fractions of a cent.
 * PDPA: fixture text only. Nothing here comes from a real society.
 */

// MUST come before any src/lib/ai import — see the file for why.
import "./allow-server-only";

import { config } from "dotenv";
import { embedTexts, resolveEmbedModel } from "../src/lib/ai/embed";
import { MIN_SCORE } from "../src/lib/ai/cari-minit";

config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// THE CORPUS — what a stored chunk looks like after src/lib/minutes-chunks.ts
// has cut a set of minutes up. The ids are only for the answer key below.
// ---------------------------------------------------------------------------
const CORPUS: { id: string; text: string }[] = [
  {
    id: "roof",
    text: "Perkara 4: Kerja pembaikan bumbung dewan. Bendahari melaporkan sebut harga daripada tiga kontraktor: RM8,500, RM9,200 dan RM11,000. Mesyuarat bersetuju melantik kontraktor termurah. Diluluskan sebulat suara.",
  },
  {
    id: "dinner",
    text: "Perkara 5: Makan malam tahunan 2026. Dicadangkan diadakan pada 15 Disember di Dewan Serbaguna. Tiket RM60 setiap orang. Jawatankuasa kecil dibentuk: Sdr. Lim (pengerusi), Sdr. Tan, Sdri. Wong.",
  },
  {
    id: "audit",
    text: "第 3 项：财政报告。截至 6 月 30 日，银行结余 RM42,180.55。上半年捐款收入 RM18,600，支出 RM11,240。会议通过接纳财政报告，并议决聘请核数师核数。",
  },
  {
    id: "fee",
    text: "第 6 项：会员常年会费。有理事建议由每年 RM24 调高至 RM36。经讨论后议决维持 RM24 不变，下届常年大会再检讨。",
  },
  {
    id: "election",
    text: "Perkara 2: Pemilihan jawatankuasa sesi 2026/2027. Pengerusi: Sdr. Chong Wei Ming. Setiausaha: Sdri. Lee Sook Fun. Bendahari: Sdr. Rajan a/l Muthu. Semua dipilih tanpa bertanding.",
  },
  {
    id: "donation",
    text: "Perkara 7: Tabung bantuan bencana banjir. Persatuan bersetuju menyumbang RM2,000 daripada tabung am, dan membuka kutipan derma daripada ahli sehingga 30 September.",
  },
  {
    id: "constitution",
    text: "第 8 项：修改章程。秘书报告社团注册局来函，要求第 12 条（理事任期）措辞修正。议决交由章程小组草拟修订案，提呈下次特别会员大会通过。",
  },
  {
    id: "youth",
    text: "Perkara 9: Aktiviti kumpulan belia. Kelas tuisyen percuma untuk pelajar UPSR akan bermula pada 5 Julai, setiap Sabtu pagi di bilik mesyuarat. Dua sukarelawan guru telah bersetuju.",
  },
  {
    id: "attendance",
    text: "Kehadiran: 14 ahli jawatankuasa hadir, 3 memohon maaf tidak dapat hadir (Sdr. Ng, Sdri. Chin, Sdr. Balan). Kuorum dicapai. Mesyuarat dimulakan pada 8.15 malam.",
  },
  {
    id: "cemetery",
    text: "第 10 项：义山管理。理事会讨论义山草木修剪费用，每季 RM1,500。议决改为每半年一次以节省开支，并由 Sdr. 黄 负责监督。",
  },
];

// ---------------------------------------------------------------------------
// THE QUESTIONS — how a 65-year-old secretary actually asks, in the two
// languages they actually mix. `relevant` is the answer key.
//
// The second block is the important half: questions about things the society
// never discussed. A threshold that scores well on the first block and badly on
// this one is the threshold that makes the assistant confidently wrong.
// ---------------------------------------------------------------------------
const QUESTIONS: { q: string; relevant: string[] }[] = [
  { q: "上次开会有讲到修屋顶吗？多少钱？", relevant: ["roof"] },
  { q: "berapa kos baiki bumbung dewan", relevant: ["roof"] },
  { q: "annual dinner 什么时候？票价多少", relevant: ["dinner"] },
  { q: "siapa jadi bendahari sekarang", relevant: ["election"] },
  { q: "会费有没有起价", relevant: ["fee"] },
  { q: "银行户口还剩多少钱", relevant: ["audit"] },
  { q: "kita ada derma untuk mangsa banjir?", relevant: ["donation"] },
  { q: "章程第 12 条要改，讲到哪里了", relevant: ["constitution"] },
  { q: "开会那天有几个人来", relevant: ["attendance"] },
  { q: "义山除草多久一次", relevant: ["cemetery"] },
  // --- never discussed in any of the minutes above -------------------------
  { q: "我们有没有买保险？", relevant: [] },
  { q: "bilakah tarikh cukai pendapatan persatuan?", relevant: [] },
  { q: "秘书的手机号码是多少", relevant: [] },
  { q: "会所的 wifi 密码", relevant: [] },
  { q: "上个月的电费单是多少", relevant: [] },
];

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  // The vectors come back normalised, but dividing costs nothing and keeps this
  // a real cosine even if a vendor ever stops normalising them.
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

type Stats = { min: number; p25: number; median: number; p75: number; max: number };

function stats(xs: number[]): Stats {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
  return { min: s[0]!, p25: at(0.25), median: at(0.5), p75: at(0.75), max: s[s.length - 1]! };
}

async function main() {
  const asJson = process.argv.includes("--json");
  const model = resolveEmbedModel();

  const docVectors = await embedTexts(CORPUS.map((c) => c.text), "document");
  const queryVectors = await embedTexts(QUESTIONS.map((q) => q.q), "query");

  // One score per (question, chunk) pair, plus the label saying whether that
  // pair SHOULD come back. This is the whole dataset; the rest is arithmetic.
  type Pair = { qi: number; docId: string; score: number; wanted: boolean };
  const pairs: Pair[] = [];
  QUESTIONS.forEach((question, qi) => {
    CORPUS.forEach((chunk, ci) => {
      pairs.push({
        qi,
        docId: chunk.id,
        score: cosine(queryVectors[qi]!, docVectors[ci]!),
        wanted: question.relevant.includes(chunk.id),
      });
    });
  });

  // Sweep. DEFAULT_LIMIT in cari-minit.ts already caps how many chunks reach the
  // model, so what matters at each threshold is: of the top hits that survive
  // it, how many are right (precision), and how many right ones survive
  // (recall). F1 balances the two failure modes, which is the point — "cannot
  // find it" and "answered from the wrong meeting" are both bad, differently.
  const TOP_N = 6;
  const rows: {
    t: number;
    tp: number;
    fp: number;
    fn: number;
    precision: number;
    recall: number;
    f1: number;
  }[] = [];

  for (let t = 0.3; t <= 0.9001; t += 0.025) {
    const threshold = Number(t.toFixed(3));
    let tp = 0;
    let fp = 0;
    let fn = 0;
    QUESTIONS.forEach((question, qi) => {
      const kept = pairs
        .filter((p) => p.qi === qi)
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_N)
        .filter((p) => p.score >= threshold);
      const right = kept.filter((p) => p.wanted).length;
      tp += right;
      fp += kept.length - right;
      fn += question.relevant.length - right;
    });
    const precision = tp + fp ? tp / (tp + fp) : 1;
    const recall = tp + fn ? tp / (tp + fn) : 1;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    rows.push({ t: threshold, tp, fp, fn, precision, recall, f1 });
  }

  const best = rows.reduce((a, b) => (b.f1 > a.f1 ? b : a));
  // Among thresholds within a hair of the best F1, take the HIGHEST: a tie means
  // the extra strictness costs no recall, and strictness is what stops the
  // assistant quoting a meeting that has nothing to do with the question.
  const band = rows.filter((r) => r.f1 >= best.f1 - 0.005);
  const bestF1 = band[band.length - 1]!;

  // THE ONE WE ACTUALLY SHIP. Max-F1 treats the two mistakes as equally bad;
  // they are not. A false positive is one extra paragraph in the prompt that the
  // model is told to ignore unless it answers the question — usually harmless,
  // and visible to the reader as a source they can click. A false negative is
  // the assistant saying "I could not find it" about a meeting that IS in the
  // database, which is the exact behaviour this whole feature exists to end.
  // So: the strictest threshold that still finds EVERYTHING, falling back to
  // max-F1 only if no threshold manages full recall.
  const fullRecall = rows.filter((r) => r.recall >= 0.999);
  const recommended = fullRecall.length ? fullRecall[fullRecall.length - 1]! : bestF1;

  const wanted = stats(pairs.filter((p) => p.wanted).map((p) => p.score));
  const unwanted = stats(pairs.filter((p) => !p.wanted).map((p) => p.score));

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          model: model.id,
          current: MIN_SCORE,
          recommended: recommended.t,
          bestF1: bestF1.t,
          wanted,
          unwanted,
          rows,
        },
        null,
        2,
      ),
    );
    return;
  }

  const f = (n: number) => n.toFixed(3);
  console.log(`model: ${model.id}   (${CORPUS.length} chunks x ${QUESTIONS.length} questions)\n`);

  console.log("--- score distribution ---");
  console.log(
    `  should match   min ${f(wanted.min)}  p25 ${f(wanted.p25)}  median ${f(wanted.median)}  p75 ${f(wanted.p75)}  max ${f(wanted.max)}`,
  );
  console.log(
    `  should NOT     min ${f(unwanted.min)}  p25 ${f(unwanted.p25)}  median ${f(unwanted.median)}  p75 ${f(unwanted.p75)}  max ${f(unwanted.max)}`,
  );
  console.log(`  gap between them: ${f(wanted.min - unwanted.max)}   (negative = they overlap)\n`);

  console.log(`--- threshold sweep (top ${TOP_N} kept per question) ---`);
  console.log("  thresh   right  wrong  missed   precision  recall     F1");
  for (const r of rows) {
    const mark =
      r.t === recommended.t
        ? "  <= recommended"
        : r.t === bestF1.t
          ? "  <= best F1"
          : Math.abs(r.t - MIN_SCORE) < 1e-9
            ? "  <= current"
            : "";
    console.log(
      `  ${f(r.t)}     ${String(r.tp).padStart(4)}   ${String(r.fp).padStart(4)}    ${String(r.fn).padStart(4)}       ${f(r.precision)}   ${f(r.recall)}  ${f(r.f1)}${mark}`,
    );
  }

  console.log(
    `\ncurrent MIN_SCORE = ${MIN_SCORE}   recommended = ${recommended.t}  ` +
      `(finds ${(recommended.recall * 100).toFixed(0)}% of what it should; ` +
      `${recommended.fp} unrelated sections still get through)   ` +
      `| max-F1 would say ${bestF1.t}`,
  );
  console.log(
    Math.abs(recommended.t - MIN_SCORE) >= 0.025
      ? `-> change MIN_SCORE in src/lib/ai/cari-minit.ts to ${recommended.t}, and record why there.`
      : "-> the current value is already in the best band. Leave it.",
  );
  console.log(
    "\nFIXTURES, not J's real minutes. Re-run against real confirmed minutes\nbefore treating this number as final.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
