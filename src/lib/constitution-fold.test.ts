import { describe, expect, it } from "vitest";
import { foldContinuationClauses } from "./constitution-fold";
import { clausesFromConstitutionExtraction } from "./constitution-display";
import type { ConfirmedClause } from "./constitution";

// 134 (J 9/9 afternoon, live site) — the shapes the page-by-page read of a
// real ROS-style book produced: "(3) lanjutan Fasal 10" filed between Fasal 3
// and Fasal 4, "Fasal 4(3)" and "(4) lanjutan" as cards of their own. Text
// below is fictional (A3); the clause_no shapes are the real ones.

const c = (clause_no: string, heading: string, text: string, page_ref = ""): ConfirmedClause => ({
  clause_no,
  heading,
  text,
  page_ref,
});

const book = (): ConfirmedClause[] => [
  c("Fasal 1", "NAMA", "Pertubuhan ini dikenali dengan nama Persatuan Contoh.", "1"),
  c("Fasal 2", "ALAMAT", "Alamat berdaftar ialah No. 1, Jalan Contoh.", "1"),
  c("Fasal 3", "MATLAMAT", "(1) Memupuk semangat.\n\n(2) Menganjurkan kegiatan.", "2"),
  c("Fasal 4", "KEAHLIAN", "(1) Keahlian terbuka.\n\n(2) Permohonan dibuat secara bertulis.", "2"),
  c("Fasal 4(3)", "", "(6) Tiap-tiap ahli hendaklah memberitahu Setiausaha perubahan alamat.", "3"),
  c("Fasal 8", "JAWATANKUASA", "(1) Tujuh orang.\n\n(4) Jawatankuasa tidak boleh bertindak", "5"),
  c("(4) lanjutan", "", "bertentangan dengan keputusan Mesyuarat Agung.", "6"),
  c("Fasal 5", "PEMBERHENTIAN AHLI", "(1) Ahli yang hendak berhenti hendaklah memberi notis.", "3"),
  c("Fasal 10", "KEWANGAN", "(1) Wang pertubuhan disimpan dalam bank.\n\n(2) Bendahari memegang wang runcit.", "7"),
  c("(3) lanjutan Fasal 10", "", "Segala cek hendaklah ditandatangani bersama.\n\n(4) Perbelanjaan melebihi RM1,500.00 perlu kelulusan.", "8"),
  c("Fasal 11", "JURUAUDIT", "Dua orang juruaudit dilantik.", "8"),
];

describe("🔴 134 — foldContinuationClauses: a clause tail goes back onto its clause", () => {
  it("'(3) lanjutan Fasal 10' is appended to Fasal 10, with its own number in front", () => {
    const out = foldContinuationClauses(book());
    const f10 = out.find((x) => x.clause_no === "Fasal 10")!;
    expect(f10.text).toBe(
      "(1) Wang pertubuhan disimpan dalam bank.\n\n(2) Bendahari memegang wang runcit.\n\n" +
        "(3) Segala cek hendaklah ditandatangani bersama.\n\n(4) Perbelanjaan melebihi RM1,500.00 perlu kelulusan.",
    );
    expect(f10.heading).toBe("KEWANGAN");
    expect(f10.page_ref).toBe("7");
    expect(out.some((x) => /lanjutan/i.test(x.clause_no))).toBe(false);
  });

  it("'Fasal 4(3)' without a heading folds onto Fasal 4 as its own paragraph — the label's (3) is never written into the text", () => {
    const out = foldContinuationClauses(book());
    const f4 = out.find((x) => x.clause_no === "Fasal 4")!;
    expect(f4.text).toBe(
      "(1) Keahlian terbuka.\n\n(2) Permohonan dibuat secara bertulis.\n\n" +
        "(6) Tiap-tiap ahli hendaklah memberitahu Setiausaha perubahan alamat.",
    );
    expect(out.map((x) => x.clause_no)).toEqual([
      "Fasal 1",
      "Fasal 2",
      "Fasal 3",
      "Fasal 4",
      "Fasal 8",
      "Fasal 5",
      "Fasal 10",
      "Fasal 11",
    ]);
  });

  it("a bare '(4) lanjutan' that begins mid-sentence finishes the last sentence of the clause read before it", () => {
    const out = foldContinuationClauses(book());
    const f8 = out.find((x) => x.clause_no === "Fasal 8")!;
    expect(f8.text).toBe(
      "(1) Tujuh orang.\n\n(4) Jawatankuasa tidak boleh bertindak bertentangan dengan keputusan Mesyuarat Agung.",
    );
  });

  it("a tail that already starts with its number is not numbered twice", () => {
    const out = foldContinuationClauses([
      c("Fasal 7", "MESYUARAT AGUNG", "(1) Diadakan setahun sekali."),
      c("(2) lanjutan", "", "(2) Notis empat belas hari."),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("(1) Diadakan setahun sekali.\n\n(2) Notis empat belas hari.");
  });

  it("'Fasal 10 (lanjutan)' and 'sambungan Fasal 10' are tails too; 'Fasal 8(2)' WITH a heading is a real sub-clause", () => {
    const out = foldContinuationClauses([
      c("Fasal 8", "JAWATANKUASA", "(1) Terdiri daripada tujuh orang."),
      c("Fasal 8(2)", "Tugas Setiausaha", "Setiausaha menyimpan rekod."),
      c("Fasal 10", "KEWANGAN", "(1) Wang disimpan."),
      c("Fasal 10 (lanjutan)", "", "(2) Cek ditandatangani bersama."),
      c("sambungan Fasal 10", "", "(3) Tahun kewangan berakhir 31 Disember."),
    ]);
    expect(out.map((x) => x.clause_no)).toEqual(["Fasal 8", "Fasal 8(2)", "Fasal 10"]);
    expect(out[2].text).toBe(
      "(1) Wang disimpan.\n\n(2) Cek ditandatangani bersama.\n\n(3) Tahun kewangan berakhir 31 Disember.",
    );
  });

  it("nothing is guessed: a bare '(2)' orphan and a tail naming a Fasal the book lacks stay as they are", () => {
    const out = foldContinuationClauses([
      c("Fasal 1", "NAMA", "Nama."),
      c("(2)", "", "Orphan sub-clause with no parent in frame."),
      c("(5) lanjutan Fasal 99", "", "Names a clause that is not here."),
    ]);
    expect(out.map((x) => x.clause_no)).toEqual(["Fasal 1", "(2)", "(5) lanjutan Fasal 99"]);
    expect(out[0].text).toBe("Nama.");
  });

  it("a tail read before any clause stays (there is nothing to fold it onto)", () => {
    const out = foldContinuationClauses([c("(3) lanjutan", "", "Tail first."), c("Fasal 1", "NAMA", "Nama.")]);
    expect(out.map((x) => x.clause_no)).toEqual(["(3) lanjutan", "Fasal 1"]);
  });

  it("the input is not mutated", () => {
    const input = book();
    const before = JSON.stringify(input);
    foldContinuationClauses(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("the flatten layer folds too, so a new read is STORED as one book", () => {
    const field = (value: string) => ({
      value,
      confidence: "confirmed" as const,
      source_ref: { location: "page 1", snippet: value },
    });
    const clause = (no: string, heading: string, text: string) => ({
      clause_no: field(no),
      heading: field(heading),
      text: field(text),
      page_ref: field(""),
    });
    const stored = clausesFromConstitutionExtraction({
      document_title: field("UNDANG-UNDANG"),
      organisation: {
        registered_name: field("PERSATUAN CONTOH"),
        registered_address: field("No. 1"),
        registration_no: field("PPM-000"),
      },
      clauses: [
        clause("Fasal 6", "SUMBER KEWANGAN", "(1) Yuran.\n\n(2) Derma.\n\n(3) Kutipan."),
        clause("Fasal 6(4)", "", "(4) Pertubuhan tidak boleh mengutip derma tanpa kebenaran."),
        clause("Fasal 7", "MESYUARAT AGUNG", "(1) Mesyuarat Agung Tahunan."),
      ],
    });
    expect(stored.map((x) => x.clause_no)).toEqual(["Fasal 6", "Fasal 7"]);
    expect(stored[0].text).toBe(
      "(1) Yuran.\n\n(2) Derma.\n\n(3) Kutipan.\n\n(4) Pertubuhan tidak boleh mengutip derma tanpa kebenaran.",
    );
  });
});
