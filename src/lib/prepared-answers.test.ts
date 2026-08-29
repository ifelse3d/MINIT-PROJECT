import { describe, expect, it } from "vitest";
import {
  matchPreparedAnswer,
  normalizeQuestion,
  preparedButtonFor,
  PREPARED_ANSWERS,
  SUGGESTED_QUESTIONS,
} from "./prepared-answers";
import { ASK_ACTION_ROUTES, ASK_ROUTES, isAskActionKey } from "./ask-routes";

describe("prepared answers — the free layer (work order 82 K1)", () => {
  // ① 61 §1-6: every "Try asking" chip is answered for free, in every language.
  it("every suggested chip hits, in all three languages", () => {
    for (const chip of SUGGESTED_QUESTIONS) {
      for (const lang of ["bm", "zh", "en"] as const) {
        const hit = matchPreparedAnswer(chip[lang]);
        expect(hit, `${lang}: ${chip[lang]}`).not.toBeNull();
        expect(hit!.lang, `${lang}: ${chip[lang]}`).toBe(lang);
      }
    }
  });

  it("the tri-joined chip text of the advanced 'all' mode still hits", () => {
    const chip = SUGGESTED_QUESTIONS[1];
    const joined = `${chip.bm} · ${chip.zh} · ${chip.en}`;
    const hit = matchPreparedAnswer(joined);
    expect(hit).not.toBeNull();
    expect(hit!.entry.id).toBe("where_receipts");
    // CJK present in the question → the answer is given in Chinese.
    expect(hit!.lang).toBe("zh");
  });

  it("the OLD home-box chip wordings keep hitting (muscle memory)", () => {
    expect(matchPreparedAnswer("Macam mana nak buat resit derma?")?.entry.id).toBe("where_receipts");
    expect(matchPreparedAnswer("捐款收据要怎么做？")?.entry.id).toBe("where_receipts");
    expect(matchPreparedAnswer("How do I make a donation receipt?")?.entry.id).toBe("where_receipts");
    expect(matchPreparedAnswer("When do I have to file the Annual Return?")?.entry.id).toBe("annual_return");
  });

  it("navigation questions from the work order", () => {
    expect(matchPreparedAnswer("calendar 在哪裡")?.entry.id).toBe("where_calendar");
    expect(matchPreparedAnswer("di mana kalendar?")?.entry.id).toBe("where_calendar");
    expect(matchPreparedAnswer("where is the calendar")?.entry.id).toBe("where_calendar");
    expect(matchPreparedAnswer("怎么开收据")?.entry.id).toBe("where_receipts");
    expect(matchPreparedAnswer("什么是 e-Invois")?.entry.id).toBe("what_is_einvois");
    expect(matchPreparedAnswer("apa itu eROSES")?.entry.id).toBe("what_is_eroses");
    expect(matchPreparedAnswer("会议记录在哪里做")?.entry.id).toBe("where_minutes");
  });

  it("file intent = point at the home door (K6), all languages", () => {
    expect(matchPreparedAnswer("macam mana nak upload fail?")?.entry.id).toBe("upload_file");
    expect(matchPreparedAnswer("我有档案要给你")?.entry.id).toBe("upload_file");
    expect(matchPreparedAnswer("可以丢 PDF 吗")?.entry.id).toBe("upload_file");
    expect(matchPreparedAnswer("can I upload a PDF here?")?.entry.id).toBe("upload_file");
    expect(matchPreparedAnswer("i have a photo of the ledger")?.entry.id).toBe("upload_file");
    const hit = matchPreparedAnswer("how do I attach a document?");
    expect(hit?.entry.id).toBe("upload_file");
    expect(hit?.entry.route).toBe("home");
  });

  it("answer language follows the question language", () => {
    expect(matchPreparedAnswer("Apa itu e-Invois?")?.lang).toBe("bm");
    expect(matchPreparedAnswer("e-Invois 是什么？")?.lang).toBe("zh");
    expect(matchPreparedAnswer("What is e-Invois?")?.lang).toBe("en");
  });

  it("e-invois spelling variants all canonicalise", () => {
    expect(normalizeQuestion("e-Invois")).toBe("einvois");
    expect(normalizeQuestion("E-INVOIS")).toBe("einvois");
    expect(normalizeQuestion("e invois")).toBe("einvois");
    expect(matchPreparedAnswer("what is einvois")?.entry.id).toBe("what_is_einvois");
    expect(matchPreparedAnswer("generate the month-end e-Invois upload file")?.entry.id).toBe("make_einvois");
  });

  // --- the near-misses that MUST fall through to the model -----------------

  it("word boundaries: 'cek' can never fire inside 'kecekapan' (69 lesson)", () => {
    // The same shape here: 'buat' must not fire inside 'dibuat'.
    expect(matchPreparedAnswer("resit yang dibuat semalam untuk siapa")).toBeNull();
    // and 'mana' must not fire inside 'kemana-mana' compounds without the topic
    expect(matchPreparedAnswer("kecekapan pengurusan resit")).toBeNull();
  });

  it("records/status questions are NOT canned", () => {
    // These need the model + its lookups: they are about THEIR records.
    expect(matchPreparedAnswer("penyata tahunan dah hantar ke belum")).toBeNull();
    expect(matchPreparedAnswer("resit nombor 5 untuk siapa")).toBeNull();
    expect(matchPreparedAnswer("上个月收到多少捐款")).toBeNull();
    expect(matchPreparedAnswer("did we already file the annual return")).toBeNull();
  });

  it("trouble words send the question to the model", () => {
    expect(matchPreparedAnswer("年度呈报交错了怎么办")).toBeNull();
    expect(matchPreparedAnswer("resit salah nombor macam mana")).toBeNull();
    expect(matchPreparedAnswer("why is my e-invois file failed")).toBeNull();
    expect(matchPreparedAnswer("怎么删收据")).toBeNull();
    expect(matchPreparedAnswer("boleh padam resit tak")).toBeNull();
  });

  it("long questions are too specific for a canned answer", () => {
    const long =
      "Di mana saya buat resit untuk derma yang diterima bulan lepas daripada " +
      "penderma di cawangan kedua kami yang belum lagi disahkan oleh bendahari dan perlu semakan?";
    expect(long.length).toBeGreaterThan(120);
    expect(matchPreparedAnswer(long)).toBeNull();
  });

  it("off-topic and empty questions never hit", () => {
    expect(matchPreparedAnswer("今天天气怎么样")).toBeNull();
    expect(matchPreparedAnswer("berita hari ini")).toBeNull();
    expect(matchPreparedAnswer("   ")).toBeNull();
    expect(matchPreparedAnswer("ok")).toBeNull();
  });

  // --- structural honesty ---------------------------------------------------

  it("every entry's button resolves through the existing whitelists", () => {
    for (const entry of PREPARED_ANSWERS) {
      const inWhitelist =
        isAskActionKey(entry.route) || entry.route in ASK_ROUTES;
      expect(inWhitelist, entry.id).toBe(true);
      const btn = preparedButtonFor(entry);
      expect(btn.href, entry.id).toContain("dari=ai");
      const base = btn.href.split("?")[0];
      const known = [
        ...Object.values(ASK_ROUTES).map((r) => r.href),
        ...Object.values(ASK_ACTION_ROUTES).map((r) => r.href),
      ];
      expect(known, entry.id).toContain(base);
    }
  });

  it("every entry answers in all three languages, non-empty", () => {
    for (const entry of PREPARED_ANSWERS) {
      for (const lang of ["bm", "zh", "en"] as const) {
        expect(entry.answer[lang].trim().length, `${entry.id}.${lang}`).toBeGreaterThan(20);
      }
    }
  });
});
