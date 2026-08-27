// ---------------------------------------------------------------------------
// CONTOH CONSTITUTION GENERATOR (2026-08-28)
//
// Builds a COMPLETE, printable sample "Undang-Undang Tubuh" for the same
// fictional society as src/lib/sample-constitution.ts, and writes it out twice:
//
//   public/contoh/undang-undang-tubuh-contoh.pdf   8 pages, ROS-style BM
//   docs/contoh-undang-undang-tubuh.md             the same text, readable
//
// WHY: the app invites people to photograph their constitution, but the repo
// had no whole document to test that path with - only ten loose clauses in
// sample-constitution.ts. Those ten clauses are reproduced here VERBATIM, on
// the exact printed pages their `page_ref` claims ("muka surat 4" really is
// page 4), so an /api/extract-constitution run over this PDF has a known right
// answer: the fixture IS the ground truth.
//
// Honesty (CONTOH rule): every page carries a CONTOH footer and the
// registration number is PPM-000-00-CONTOH. It must never be mistakable for a
// real registered constitution, and it must never block a real user - nothing
// in the app reads this file; it is a document on disk.
//
// Run: npm run contoh:constitution
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const ORG = "Persatuan Penganut Dewa Guan Di Selangor - Cawangan Klang";
const TITLE = "UNDANG-UNDANG TUBUH";
const REG_NO = "PPM-000-00-CONTOH";

/** clause_no -> the ten verbatim texts that must survive unchanged. Checked
 *  against src/lib/sample-constitution.ts at the bottom of this file. */
const VERBATIM = new Set([
  "Fasal 3", "Fasal 4", "Fasal 8", "Fasal 8.2", "Fasal 9",
  "Fasal 10", "Fasal 12", "Fasal 12.3", "Fasal 14", "Fasal 16",
]);

// --- the document ----------------------------------------------------------
// `page` is the PRINTED page this clause must land on. The layout asserts it.

const CLAUSES = [
  {
    no: "Fasal 1", heading: "Nama", page: 1,
    paras: [
      "Pertubuhan ini dikenali sebagai Persatuan Penganut Dewa Guan Di Selangor - Cawangan Klang, dan selepas ini disebut sebagai Persatuan.",
      "1.2 Tempat urusan berdaftar Persatuan ialah No. 12, Jalan Tepi Sungai, 41100 Klang, Selangor Darul Ehsan, atau di mana-mana tempat lain yang ditetapkan oleh Jawatankuasa dari semasa ke semasa dan diberitahu kepada Pendaftar Pertubuhan.",
    ],
  },
  {
    no: "Fasal 2", heading: "Tujuan", page: 1,
    paras: [
      "Tujuan Persatuan adalah seperti berikut:",
      "(a) menjaga dan menyelenggara tempat ibadat Persatuan serta menganjurkan upacara keagamaan tahunan;",
      "(b) memupuk semangat kerjasama dan kebajikan dalam kalangan ahli;",
      "(c) mengumpul derma bagi maksud kebajikan dan penyelenggaraan tempat ibadat;",
      "(d) melakukan apa-apa perkara lain yang sah yang berkaitan dengan tujuan di atas.",
      "2.2 Persatuan tidak boleh menjalankan apa-apa aktiviti yang bercanggah dengan Akta Pertubuhan 1966 atau mana-mana undang-undang bertulis yang lain.",
    ],
  },
  {
    no: "Fasal 3", heading: "Keahlian", page: 2,
    paras: [
      "Keahlian terbuka kepada semua warganegara Malaysia yang berumur 18 tahun ke atas yang menganut kepercayaan persatuan ini. Permohonan menjadi ahli hendaklah dibuat secara bertulis kepada Setiausaha dan diluluskan oleh Jawatankuasa.",
      "3.2 Jawatankuasa berhak menolak sesuatu permohonan tanpa memberi sebab, dan pemohon yang ditolak boleh merayu kepada Mesyuarat Agung yang berikutnya.",
    ],
  },
  {
    no: "Fasal 4", heading: "Yuran", page: 2,
    paras: [
      "Yuran tahunan sebanyak RM24 hendaklah dijelaskan kepada Bendahari sebelum 31 Mac setiap tahun. Ahli yang gagal menjelaskan yuran selama dua tahun berturut-turut akan gugur keahliannya setelah diberi notis bertulis.",
      "4.2 Yuran masuk sebanyak RM10 hendaklah dijelaskan sekali sahaja semasa permohonan diluluskan.",
      "4.3 Kadar yuran hanya boleh dipinda oleh Mesyuarat Agung.",
    ],
  },
  {
    no: "Fasal 5", heading: "Perletakan Jawatan dan Pemberhentian Keahlian", page: 3,
    paras: [
      "Seseorang ahli yang hendak berhenti daripada menjadi ahli hendaklah memberi notis bertulis kepada Setiausaha dan menjelaskan segala hutangnya kepada Persatuan.",
      "5.2 Jawatankuasa boleh memberhentikan keahlian seseorang ahli yang didapati melakukan perbuatan yang mencemarkan nama baik Persatuan, setelah ahli itu diberi peluang untuk didengar.",
      "5.3 Ahli yang diberhentikan boleh merayu kepada Mesyuarat Agung yang berikutnya, dan keputusan Mesyuarat Agung adalah muktamad.",
    ],
  },
  {
    no: "Fasal 6", heading: "Hak dan Tanggungjawab Ahli", page: 3,
    paras: [
      "Setiap ahli yang telah menjelaskan yuran berhak menghadiri dan mengundi dalam Mesyuarat Agung, dan berhak dipilih sebagai Ahli Jawatankuasa.",
      "6.2 Setiap ahli hendaklah mematuhi undang-undang tubuh ini dan segala peraturan yang dibuat di bawahnya.",
    ],
  },
  {
    no: "Fasal 7", heading: "Daftar Ahli dan Rekod", page: 3,
    paras: [
      "Setiausaha hendaklah menyimpan sebuah Daftar Ahli yang mengandungi nama, nombor kad pengenalan, alamat dan tarikh masuk setiap ahli, dan daftar itu hendaklah dibuka untuk pemeriksaan oleh mana-mana ahli pada waktu yang munasabah.",
      "7.2 Minit setiap mesyuarat hendaklah direkodkan dan disimpan oleh Setiausaha, dan hendaklah disahkan dalam mesyuarat yang berikutnya.",
    ],
  },
  {
    no: "Fasal 8", heading: "Mesyuarat Agung Tahunan", page: 4,
    paras: [
      "Mesyuarat Agung Tahunan hendaklah diadakan tidak lewat daripada 30 Jun setiap tahun. Notis mesyuarat berserta agenda hendaklah dihantar kepada semua ahli sekurang-kurangnya 14 hari sebelum tarikh mesyuarat.",
    ],
  },
  {
    no: "Fasal 8.1", heading: "Agenda Mesyuarat Agung Tahunan", page: 4,
    paras: [
      "Agenda Mesyuarat Agung Tahunan hendaklah mengandungi perkara yang berikut:",
      "(a) pengesahan minit Mesyuarat Agung yang lalu;",
      "(b) laporan tahunan Setiausaha;",
      "(c) penyata kewangan yang telah diaudit;",
      "(d) pemilihan Jawatankuasa dan pelantikan dua orang pemeriksa kira-kira, jika tiba masanya;",
      "(e) hal-hal lain yang diterima oleh Pengerusi.",
    ],
  },
  {
    no: "Fasal 8.2", heading: "Kuorum", page: 4,
    paras: [
      "Kuorum Mesyuarat Agung ialah satu perdua (1/2) daripada jumlah ahli yang berhak mengundi atau dua kali jumlah ahli Jawatankuasa, mengikut mana yang kurang. Sekiranya kuorum tidak cukup selepas setengah jam, mesyuarat hendaklah ditangguhkan ke tarikh lain tidak melebihi 30 hari.",
    ],
  },
  {
    no: "Fasal 8.3", heading: "Undian", page: 4,
    paras: [
      "Keputusan diambil dengan undi majoriti mudah ahli yang hadir, kecuali bagi perkara yang dinyatakan sebaliknya dalam undang-undang tubuh ini. Pengerusi mempunyai undi pemutus sekiranya undian sama banyak.",
    ],
  },
  {
    no: "Fasal 9", heading: "Mesyuarat Agung Khas", page: 5,
    paras: [
      "Mesyuarat Agung Khas boleh diadakan atas permintaan bertulis tidak kurang daripada satu perlima (1/5) daripada jumlah ahli yang berhak mengundi, dengan menyatakan tujuan mesyuarat itu.",
      "9.2 Mesyuarat Agung Khas hendaklah diadakan dalam tempoh 30 hari dari tarikh permintaan itu diterima, dan notis 14 hari hendaklah diberi kepada semua ahli.",
      "9.3 Kuorum dan cara mengundi bagi Mesyuarat Agung Khas adalah sama seperti Fasal 8.2 dan Fasal 8.3.",
    ],
  },
  {
    no: "Fasal 10", heading: "Jawatankuasa", page: 5,
    paras: [
      "Jawatankuasa hendaklah terdiri daripada seorang Pengerusi, seorang Timbalan Pengerusi, seorang Setiausaha, seorang Bendahari dan tujuh orang Ahli Jawatankuasa Biasa, yang dipilih dalam Mesyuarat Agung Tahunan setiap dua tahun sekali.",
      "10.2 Pengerusi hendaklah mempengerusikan semua mesyuarat; Setiausaha hendaklah menguruskan surat-menyurat, minit dan daftar ahli; Bendahari hendaklah menyimpan segala akaun dan resit Persatuan.",
      "10.3 Kekosongan jawatan sebelum tamat penggal boleh diisi oleh Jawatankuasa sehingga Mesyuarat Agung Tahunan yang berikutnya.",
    ],
  },
  {
    no: "Fasal 11", heading: "Mesyuarat Jawatankuasa", page: 6,
    paras: [
      "Mesyuarat Jawatankuasa hendaklah diadakan sekurang-kurangnya empat kali setahun, dan notis tujuh hari hendaklah diberi bagi setiap mesyuarat.",
      "11.2 Kuorum Mesyuarat Jawatankuasa ialah satu perdua (1/2) daripada jumlah ahli Jawatankuasa.",
      "11.3 Ahli Jawatankuasa yang tidak hadir tiga kali berturut-turut tanpa alasan yang munasabah disifatkan telah meletakkan jawatannya.",
    ],
  },
  {
    no: "Fasal 12", heading: "Kewangan", page: 6,
    paras: [
      "Segala wang persatuan hendaklah dimasukkan ke dalam akaun bank atas nama persatuan. Cek hendaklah ditandatangani oleh Bendahari bersama Pengerusi atau Setiausaha. Perbelanjaan melebihi RM5,000 memerlukan kelulusan Jawatankuasa terlebih dahulu.",
    ],
  },
  {
    no: "Fasal 12.2", heading: "Tahun Kewangan", page: 6,
    paras: [
      "Tahun kewangan Persatuan bermula pada 1 Januari dan berakhir pada 31 Disember setiap tahun.",
    ],
  },
  {
    no: "Fasal 12.3", heading: "Akaun dan Audit", page: 6,
    paras: [
      "Akaun persatuan hendaklah diaudit oleh dua orang pemeriksa kira-kira yang dilantik dalam Mesyuarat Agung Tahunan, dan penyata kewangan yang telah diaudit hendaklah dibentangkan dalam Mesyuarat Agung Tahunan berikutnya.",
    ],
  },
  {
    no: "Fasal 13", heading: "Pemegang Amanah", page: 7,
    paras: [
      "Sekiranya Persatuan memperoleh harta tak alih, tiga orang pemegang amanah yang berumur tidak kurang daripada 21 tahun hendaklah dilantik dalam Mesyuarat Agung, dan harta itu hendaklah didaftarkan atas nama mereka bagi pihak Persatuan.",
      "13.2 Pemegang amanah tidak boleh menjual, menggadai atau melupuskan harta Persatuan tanpa kebenaran Mesyuarat Agung.",
    ],
  },
  {
    no: "Fasal 14", heading: "Pindaan Undang-Undang", page: 7,
    paras: [
      "Undang-undang ini tidak boleh dipinda kecuali dengan ketetapan Mesyuarat Agung dan dengan persetujuan dua pertiga (2/3) daripada ahli yang hadir. Pindaan hendaklah dikemukakan kepada Pendaftar Pertubuhan dalam tempoh 60 hari.",
      "14.2 Pindaan hanya berkuat kuasa selepas diluluskan oleh Pendaftar Pertubuhan.",
    ],
  },
  {
    no: "Fasal 15", heading: "Larangan", page: 7,
    paras: [
      "Persatuan tidak boleh menjalankan sebarang permainan judi, loteri atau aktiviti yang menyalahi undang-undang di premisnya.",
      "15.2 Nama Persatuan tidak boleh digunakan bagi faedah persendirian mana-mana ahli.",
      "15.3 Persatuan tidak boleh mengambil bahagian dalam apa-apa aktiviti politik.",
    ],
  },
  {
    no: "Fasal 16", heading: "Pembubaran", page: 8,
    paras: [
      "Persatuan ini tidak boleh dibubarkan kecuali dengan persetujuan tidak kurang daripada tiga perlima (3/5) daripada jumlah ahli yang berhak mengundi dalam suatu Mesyuarat Agung yang dipanggil khas untuk tujuan itu. Baki wang selepas pembubaran hendaklah diserahkan kepada badan kebajikan yang diluluskan.",
      "16.2 Notis pembubaran hendaklah disampaikan kepada Pendaftar Pertubuhan dalam tempoh 14 hari dari tarikh pembubaran itu.",
    ],
  },
];

const SIGN_BLOCK = {
  page: 8,
  lines: [
    "Diluluskan dalam Mesyuarat Agung Tahunan pada 21 Jun 2026.",
    "",
    "..........................            ..........................            ..........................",
    "Pengerusi                             Setiausaha                            Bendahari",
    "(Lim Ah Kow)                          (Tan Mei Ling)                        (Ng Chee Keong)",
  ],
};

const PAGE_COUNT = 8;

// --- layout ----------------------------------------------------------------

const A4 = [595.28, 841.89];
const MARGIN = 62;
const BODY_SIZE = 10.5;
const LEADING = 15;
const FOOT_ROOM = 44;

function wrap(text, font, size, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** The standard PDF fonts are WinAnsi only - keep the fixture plain. */
function ascii(s) {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-");
}

async function buildPdf() {
  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const textWidth = A4[0] - MARGIN * 2;

  const pages = [];
  for (let i = 0; i < PAGE_COUNT; i++) pages.push(pdf.addPage(A4));
  const cursor = pages.map(() => A4[1] - MARGIN);

  const draw = (pageNo, text, opts = {}) => {
    const { font = body, size = BODY_SIZE, indent = 0, gap = 0 } = opts;
    const page = pages[pageNo - 1];
    const lines = wrap(ascii(text), font, size, textWidth - indent);
    cursor[pageNo - 1] -= gap;
    for (const line of lines) {
      if (cursor[pageNo - 1] < MARGIN + FOOT_ROOM) {
        throw new Error(
          `page ${pageNo} overflowed - move or trim a clause, do NOT let the ` +
            `printed page stop matching the page_ref in sample-constitution.ts`,
        );
      }
      page.drawText(line, {
        x: MARGIN + indent,
        y: cursor[pageNo - 1],
        size,
        font,
        color: rgb(0.08, 0.08, 0.1),
      });
      cursor[pageNo - 1] -= LEADING;
    }
  };

  // Page 1 masthead.
  draw(1, TITLE, { font: bold, size: 15 });
  draw(1, ORG.toUpperCase(), { font: bold, size: 12, gap: 3 });
  draw(1, "(Didaftarkan di bawah Akta Pertubuhan 1966)", { font: italic, size: 10, gap: 4 });
  draw(1, `No. Pendaftaran: ${REG_NO}`, { size: 10 });
  draw(1, "CONTOH - dokumen rekaan untuk demo dan ujian. Bukan pertubuhan sebenar.", {
    font: italic,
    size: 9.5,
    gap: 6,
  });

  for (const clause of CLAUSES) {
    draw(clause.page, `${clause.no} - ${clause.heading}`, { font: bold, size: 11, gap: 12 });
    for (const p of clause.paras) {
      const isList = /^\([a-z]\)/.test(p);
      draw(clause.page, p, { indent: isList ? 18 : 0, gap: 4 });
    }
  }

  for (const line of SIGN_BLOCK.lines) {
    if (line === "") cursor[SIGN_BLOCK.page - 1] -= LEADING;
    else draw(SIGN_BLOCK.page, line, { size: 9.5, gap: 4 });
  }

  pages.forEach((page, i) => {
    const foot = `CONTOH / SAMPLE - ${ORG} - muka surat ${i + 1} daripada ${PAGE_COUNT}`;
    page.drawText(ascii(foot), {
      x: MARGIN,
      y: MARGIN - 18,
      size: 8,
      font: italic,
      color: rgb(0.45, 0.45, 0.5),
    });
  });

  pdf.setTitle(`${TITLE} ${ORG} (CONTOH)`);
  pdf.setSubject("Sample society constitution - fictional, for demo and testing");
  pdf.setProducer("Minit");
  return pdf.save();
}

function buildMarkdown() {
  const out = [];
  out.push(`# ${TITLE} - ${ORG}`, "");
  out.push(
    "> **CONTOH / 範本。** 這是一份**虛構**的社團章程：機構、人名、地址、註冊號碼全是編的（`PPM-000-00-CONTOH`）。",
  );
  out.push(
    "> 用途：(1) 上傳或拍照測試 `/api/extract-constitution` 與 `/constitution` 問答；(2) demo 時有一份完整章程可看。",
  );
  out.push(
    "> 十條條文與 `src/lib/sample-constitution.ts` **逐字相同**，印出來的頁碼也對得上該檔的 `page_ref`（「muka surat 4」真的在第 4 頁），",
  );
  out.push(
    "> 所以抽取結果有標準答案可比對。兩邊要一起改——`npm run contoh:constitution` 對不上會直接報錯。",
  );
  out.push("");
  out.push(`（Didaftarkan di bawah Akta Pertubuhan 1966 · No. Pendaftaran: ${REG_NO}）`, "");
  let page = 0;
  for (const clause of CLAUSES) {
    if (clause.page !== page) {
      page = clause.page;
      out.push("", `## — muka surat ${page} —`, "");
    }
    const mark = VERBATIM.has(clause.no) ? "  ⟵ 逐字對應 sample-constitution.ts" : "";
    out.push(`### ${clause.no} — ${clause.heading}${mark}`, "");
    for (const p of clause.paras) out.push(p, "");
  }
  out.push("", SIGN_BLOCK.lines.filter(Boolean).join("  \n"), "");
  out.push("", "_檔案由 `scripts/make-contoh-constitution.mjs` 產生，不要手改這一份。_", "");
  return out.join("\n");
}

/** The ten clauses must still match the fixture, character for character. */
function assertVerbatim() {
  const fixture = fs.readFileSync(
    path.join(process.cwd(), "src", "lib", "sample-constitution.ts"),
    "utf8",
  );
  const missing = [];
  for (const clause of CLAUSES) {
    if (!VERBATIM.has(clause.no)) continue;
    if (!fixture.includes(clause.paras[0])) missing.push(clause.no);
  }
  if (missing.length) {
    throw new Error(
      `these clauses no longer match src/lib/sample-constitution.ts word for word: ${missing.join(", ")}`,
    );
  }
  const declared = new Set(CLAUSES.filter((c) => VERBATIM.has(c.no)).map((c) => c.no));
  for (const no of VERBATIM) {
    if (!declared.has(no)) throw new Error(`clause ${no} is in the fixture but missing here`);
  }
}

async function main() {
  assertVerbatim();
  const bytes = await buildPdf();
  const pdfPath = path.join(
    process.cwd(),
    "public",
    "contoh",
    "undang-undang-tubuh-contoh.pdf",
  );
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  fs.writeFileSync(pdfPath, bytes);
  const mdPath = path.join(process.cwd(), "docs", "contoh-undang-undang-tubuh.md");
  fs.writeFileSync(mdPath, buildMarkdown(), "utf8");
  console.log(`OK  ${PAGE_COUNT} pages, ${CLAUSES.length} fasal`);
  console.log(`    ${pdfPath} (${(bytes.length / 1024).toFixed(1)} KB)`);
  console.log(`    ${mdPath}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
