import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------
// THE FORM YOU FILL IN BEFORE YOU EVER OPEN THE APP.
//
// 2026-08-19 (user: "爲什麼那邊放給 UPLOAD 但沒任何 FILE 可以呢？… 不然做一個可以
// 下載的 template excel 這樣讓他下載填，這樣比較好"). Both halves were right: a
// file picker that accepts .csv and .txt accepts nothing a society actually
// has, and the better answer is to hand them the spreadsheet rather than ask
// them to produce one in a shape we never described.
//
// NO AI IS INVOLVED, and that is the point. A spreadsheet already has columns;
// working out which column is the name is arithmetic, not judgement. Sending it
// to a model would spend the org's quota to do worse than a parser, and would
// put a committee list — names, i.e. personal data — through a vendor for no
// reason (Hard Rule 5). Photographing a roster is a different feature and is
// honestly named as not-built rather than half-supported.
//
// Uploads are converted to the same tab-separated text the paste box takes, so
// there is ONE parser and one set of refusal rules (src/lib/bulk-paste.ts) no
// matter how the list arrived.
// ---------------------------------------------------------------------------

export type TemplateKind = "committee" | "glossary";

const SPEC: Record<
  TemplateKind,
  {
    sheet: string;
    columns: { header: string; width: number }[];
    examples: string[][];
    notes: string[];
  }
> = {
  committee: {
    sheet: "Jawatankuasa",
    columns: [
      { header: "Jawatan / 职位 / Position", width: 34 },
      { header: "Nama / 姓名 / Name", width: 26 },
      { header: "Nama seperti dalam IC / 马来文姓名（如 IC）/ Name as on IC", width: 34 },
      { header: "Mula / 任期开始 / From (YYYY-MM-DD)", width: 26 },
      { header: "Tamat / 任期结束 / To (YYYY-MM-DD)", width: 26 },
    ],
    examples: [
      ["Pengerusi / 主席", "陈大明", "TAN TAI BENG", "2026-01-01", "2027-12-31"],
      ["Setiausaha / 秘书", "林小美", "LIM SIEW MEI", "", ""],
      ["Bendahari / 财政", "王小强", "", "", ""],
      ["Ahli Jawatankuasa (AJK) / 理事", "李美玲", "", "", ""],
    ],
    notes: [
      "Isi satu orang satu baris. Padamkan baris contoh sebelum muat naik.",
      "一行一个人。上传前请把示范的那几行删掉。",
      "One person per line. Delete the example rows before uploading.",
      "",
      "Jawatan dan Nama WAJIB. Lajur lain boleh dibiarkan kosong.",
      "「职位」和「姓名」一定要填。其他栏可以留空。",
      "Position and Name are required. The other columns may be left blank.",
      "",
      "⚠ Lajur ketiga ialah nama SEPERTI DALAM KAD PENGENALAN — itulah nama yang",
      "eROSES mahu, kerana itu nama yang boleh dipadankan dengan seseorang.",
      "JANGAN terjemah nama Cina ke rumi sendiri; salin daripada kad pengenalan.",
      "Biarkan kosong jika anda belum tahu — kosong lebih baik daripada tekaan.",
      "⚠ 第三栏是「身份证上的名字」—— eROSES 要的是这个，因为那是能对得上人的名字。",
      "不要自己把中文名音译成马来文／英文，请照身份证抄。还不知道就留空 ——",
      "留空好过猜。",
      "",
      "⚠ Senarai ini masuk ke eROSES (Penyata Tahunan) sebagai Senarai Ahli",
      "Jawatankuasa. Letak jawatan TETAP pertubuhan sahaja — tugas untuk satu",
      "aktiviti (siapa pengacara hari itu, siapa mengetuai perarakan) BUKAN",
      "jawatan jawatankuasa dan tidak boleh dimasukkan di sini.",
      "⚠ 这份名单会进 eROSES 年度申报的理事名单。只放社团的常设职位 —— 某一个活动",
      "的分工（那天谁主持、谁带队）不是理事职位，不可以放进来。",
    ],
  },
  glossary: {
    sheet: "Perkataan Kami",
    columns: [
      { header: "Perkataan / 那个词 / The word", width: 26 },
      { header: "Tulis sebagai / 翻译成 / Write it as", width: 34 },
      { header: "Ia apa / 这是什么 / What it is", width: 26 },
    ],
    examples: [
      ["崇德", "", "ajaran / 法号"],
      ["点传师", "", "gelaran / 称谓"],
      ["家长班", "Kelas Ibu Bapa", "kelas / 班别"],
      ["青班", "Kelas Qing", "kelas / 班别"],
    ],
    notes: [
      "Biarkan lajur kedua KOSONG bermaksud: kekalkan perkataan itu seperti asal.",
      "第二栏留空 = 保持原字，永远不要翻译。",
      "Leaving the second column EMPTY means: keep the word exactly as written.",
      "",
      "Isi lajur kedua untuk memberitahu Minit cara ia patut ditulis setiap kali.",
      "第二栏填了，就是告诉 Minit 每次都要写成那样。",
      "Fill the second column to tell Minit how it should be written every time.",
      "",
      "Lajur ketiga tidak wajib — ia membantu Minit membezakan perkataan seakan.",
      "第三栏可以不填 —— 填了 Minit 比较不会认错相似的词。",
      "The third column is optional — it helps Minit tell similar words apart.",
    ],
  },
};

/** The blank form, with the society's own examples already in it. */
export async function buildTemplateXlsx(kind: TemplateKind): Promise<Buffer> {
  const spec = SPEC[kind];
  const wb = new ExcelJS.Workbook();
  wb.creator = "Minit";

  const ws = wb.addWorksheet(spec.sheet);
  ws.columns = spec.columns.map((c) => ({ header: c.header, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle", wrapText: true };
  ws.getRow(1).height = 32;
  for (const row of spec.examples) ws.addRow(row);
  // The examples are grey so it is obvious they are examples, and the notes
  // sheet tells people to delete them. Both, because either alone gets missed.
  for (let r = 2; r <= spec.examples.length + 1; r++) {
    ws.getRow(r).font = { color: { argb: "FF999999" }, italic: true };
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const notes = wb.addWorksheet("Arahan - 说明 - Notes");
  notes.columns = [{ width: 88 }];
  for (const line of spec.notes) notes.addRow([line]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * An uploaded workbook, flattened to the tab-separated text the paste box
 * takes — so xlsx, csv and a pasted WhatsApp message all meet the same parser
 * and the same refusal rules.
 *
 * The header row is dropped only when it looks like our own header; a file
 * whose first row is real data keeps it, because silently eating somebody's
 * chairman is exactly the class of bug the all-or-nothing rule exists for.
 */
export async function xlsxToPasteText(data: ArrayBuffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const ws = wb.worksheets[0];
  if (!ws) return "";

  const lines: string[] = [];
  ws.eachRow((row, rowNumber) => {
    const cells: string[] = [];
    // `row.values` is 1-based with a hole at index 0.
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    for (const v of values) {
      if (v === null || v === undefined) {
        cells.push("");
        continue;
      }
      if (v instanceof Date) {
        cells.push(v.toISOString().slice(0, 10));
        continue;
      }
      if (typeof v === "object" && "text" in v) {
        cells.push(String((v as { text: unknown }).text ?? "").trim());
        continue;
      }
      if (typeof v === "object" && "result" in v) {
        cells.push(String((v as { result: unknown }).result ?? "").trim());
        continue;
      }
      cells.push(String(v).trim());
    }

    const line = cells.join("\t").replace(/\t+$/, "");
    if (line.trim() === "") return;
    if (rowNumber === 1 && looksLikeOurHeader(line)) return;
    lines.push(line);
  });

  return lines.join("\n");
}

/** Our own header row, in any of the three languages it is printed in. */
function looksLikeOurHeader(line: string): boolean {
  const l = line.toLowerCase();
  return (
    l.includes("jawatan") ||
    l.includes("职位") ||
    l.includes("position") ||
    l.includes("perkataan") ||
    l.includes("那个词") ||
    l.includes("the word")
  );
}

export const TEMPLATE_FILENAME: Record<TemplateKind, string> = {
  committee: "Minit-Senarai-Jawatankuasa-理事名单.xlsx",
  glossary: "Minit-Perkataan-Kami-词库.xlsx",
};
