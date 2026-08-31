import { describe, expect, it } from "vitest";
import {
  clauseNumberOf,
  constitutionCoverage,
  findAddressClause,
  findAmendmentRule,
  findNameClause,
  findRegisteredAddress,
  findRegisteredName,
} from "./constitution-identity";
import type { ConfirmedClause } from "./constitution";
import { sampleClauses } from "./sample-constitution";

// These fixtures are written the way real ROS-approved constitutions are
// written — including the photocopied Chinese ones and the typewritten ones
// with no printed headings. Both jobs of constitution-identity.ts change what a
// person believes about their legal obligations, so "it happened to work on the
// one document we tried" is not good enough.

function clause(
  clause_no: string,
  heading: string,
  text: string,
): ConfirmedClause {
  return { clause_no, heading, text, page_ref: "" };
}

describe("findRegisteredName", () => {
  it("reads the quoted name out of the NAMA clause", () => {
    const found = findRegisteredName([
      clause(
        "Fasal 1",
        "NAMA",
        'Pertubuhan ini dikenali dengan nama "PERSATUAN PENDUDUK TAMAN SRI MUDA". Selepas ini disebut "Pertubuhan".',
      ),
    ]);
    expect(found?.name).toBe("PERSATUAN PENDUDUK TAMAN SRI MUDA");
    expect(found?.clause.clause_no).toBe("Fasal 1");
  });

  it("reads an unquoted name and stops at the end of the sentence", () => {
    const found = findRegisteredName([
      clause(
        "1",
        "Nama",
        "Nama pertubuhan ini ialah Persatuan Kebajikan Cahaya Harapan. Alamat berdaftar ialah No. 12, Jalan Besar.",
      ),
    ]);
    expect(found?.name).toBe("Persatuan Kebajikan Cahaya Harapan");
  });

  it("reads a Chinese constitution", () => {
    const found = findRegisteredName([
      clause("第一条", "名称", "本会定名为「雪兰莪新民班同学会」。"),
    ]);
    expect(found?.name).toBe("雪兰莪新民班同学会");
  });

  it("finds the name when no heading was printed", () => {
    const found = findRegisteredName([
      clause("1", "", "The society shall be known as SUNRISE WELFARE ASSOCIATION."),
    ]);
    expect(found?.name).toBe("SUNRISE WELFARE ASSOCIATION");
  });

  // Hard Rule 1. A wrong society name is printed on every receipt the
  // organisation ever issues, so silence beats a guess.
  it("returns null rather than guessing when no name clause was read", () => {
    expect(
      findRegisteredName([
        clause("Fasal 7", "KEAHLIAN", "Keahlian terbuka kepada semua warganegara."),
      ]),
    ).toBeNull();
  });

  it("does not read clause 1 as a name when clause 1 is about something else", () => {
    expect(
      findRegisteredName([
        clause("1", "TAFSIRAN", "Dalam undang-undang ini, melainkan konteks."),
      ]),
    ).toBeNull();
  });

  it("rejects a misread that contains no letters", () => {
    expect(
      findRegisteredName([clause("Fasal 1", "NAMA", 'Dikenali dengan nama "—— ///".')]),
    ).toBeNull();
  });

  // 🔴 IRON TEST (work order 85 ①): the app's OWN sample document. contoh's
  // Fasal 1 says "dikenali sebagai …" with no quotes — the old introducer
  // list missed it, and J watched Minit fail its own demo file on 2026-08-30.
  it("reads the contoh fixture's registered name (dikenali sebagai, unquoted)", () => {
    const found = findRegisteredName(sampleClauses);
    expect(found?.name).toBe(
      "Persatuan Penganut Dewa Guan Di Selangor - Cawangan Klang",
    );
    expect(found?.clause.clause_no).toBe("Fasal 1");
  });

  it("reads the 'hendaklah dikenali sebagai' variant too", () => {
    const found = findRegisteredName([
      clause(
        "Fasal 1",
        "NAMA",
        "Pertubuhan ini hendaklah dikenali sebagai Persatuan Bola Sepak Harmoni, selepas ini disebut Persatuan.",
      ),
    ]);
    expect(found?.name).toBe("Persatuan Bola Sepak Harmoni");
  });
});

describe("findNameClause", () => {
  // ① needs the UI to tell "no NAMA clause" from "NAMA clause present, name
  // unparseable" — this is the detector for the second case.
  it("finds the NAMA clause even when the name inside cannot be parsed", () => {
    const nama = clause(
      "Fasal 1",
      "Nama",
      "Pertubuhan ini memakai gelaran yang tercatat dalam sijil pendaftaran.",
    );
    expect(findRegisteredName([nama])).toBeNull();
    expect(findNameClause([nama])?.clause_no).toBe("Fasal 1");
  });

  it("returns null when no clause is headed Nama", () => {
    expect(
      findNameClause([clause("Fasal 1", "TAFSIRAN", "Dalam undang-undang ini.")]),
    ).toBeNull();
  });
});

describe("findRegisteredAddress", () => {
  // 🔴 IRON TEST (work order 85 ⑥): contoh's address lives in Fasal 1's 1.2
  // sentence — and "No. 12"'s own full stop must not cut it short, while the
  // "atau di mana-mana tempat lain…" tail must not ride along.
  it("reads the contoh fixture's registered address", () => {
    const found = findRegisteredAddress(sampleClauses);
    expect(found?.address).toBe(
      "No. 12, Jalan Tepi Sungai, 41100 Klang, Selangor Darul Ehsan",
    );
    expect(found?.clause.clause_no).toBe("Fasal 1");
  });

  it("reads an address from a clause headed Alamat", () => {
    const found = findRegisteredAddress([
      clause(
        "Fasal 2",
        "Alamat",
        "Alamat berdaftar persatuan ini ialah 88, Jalan Mawar 3, 81100 Johor Bahru, Johor.",
      ),
    ]);
    expect(found?.address).toBe("88, Jalan Mawar 3, 81100 Johor Bahru, Johor");
  });

  // Hard Rule 1: a clause ABOUT the address whose address cannot be parsed →
  // null from the reader, but findAddressClause still surfaces the clause so
  // the UI can quote it verbatim instead of claiming there is none.
  it("returns null rather than guessing, while findAddressClause still points at the clause", () => {
    const vague = clause(
      "Fasal 2",
      "Tempat Urusan",
      "Tempat urusan Persatuan ditetapkan oleh Jawatankuasa dari semasa ke semasa.",
    );
    expect(findRegisteredAddress([vague])).toBeNull();
    expect(findAddressClause([vague])?.clause_no).toBe("Fasal 2");
  });

  it("finds nothing at all in clauses that never mention an address", () => {
    const other = [clause("Fasal 3", "Keahlian", "Keahlian terbuka kepada semua.")];
    expect(findRegisteredAddress(other)).toBeNull();
    expect(findAddressClause(other)).toBeNull();
  });
});

describe("findAmendmentRule", () => {
  it("reads the meeting, the notice period and the majority", () => {
    const rule = findAmendmentRule([
      clause(
        "Fasal 14",
        "PINDAAN UNDANG-UNDANG",
        "Undang-undang ini tidak boleh dipinda kecuali dengan kelulusan dua pertiga daripada ahli yang hadir di Mesyuarat Agung, dan notis 14 hari hendaklah diberi kepada semua ahli.",
      ),
    ]);
    expect(rule?.requiresGeneralMeeting).toBe(true);
    expect(rule?.noticeDays).toBe(14);
    expect(rule?.majority).toBe("dua pertiga");
    expect(rule?.clause.clause_no).toBe("Fasal 14");
  });

  it("notices when the Registrar's approval is named", () => {
    const rule = findAmendmentRule([
      clause(
        "Fasal 15",
        "PINDAAN",
        "Sebarang pindaan hendaklah mendapat kelulusan Pendaftar Pertubuhan sebelum berkuatkuasa.",
      ),
    ]);
    expect(rule?.needsRegistrarApproval).toBe(true);
    // Nothing in this clause says which meeting or how many days — and the rule
    // must NOT invent either of them.
    expect(rule?.requiresGeneralMeeting).toBe(false);
    expect(rule?.noticeDays).toBeNull();
    expect(rule?.majority).toBeNull();
  });

  // 🔴 IRON TEST (work order 85 ②): contoh Fasal 14's "60 hari" is the
  // deadline for FILING a passed amendment with the Registrar — not a notice
  // period to members. Showing it as "60 days' notice before the meeting"
  // invented a legal requirement the document never stated.
  it("does not read a filing deadline as a notice period (contoh Fasal 14)", () => {
    const fasal14 = sampleClauses.find((c) => c.clause_no === "Fasal 14")!;
    const rule = findAmendmentRule([fasal14]);
    expect(rule).not.toBeNull();
    expect(rule?.noticeDays).toBeNull();
    // The rest of the clause still reads exactly as before.
    expect(rule?.requiresGeneralMeeting).toBe(true);
    expect(rule?.majority).toBe("dua pertiga");
    expect(rule?.needsRegistrarApproval).toBe(true);
  });

  it("still reads a notice period written next to 通知 in Chinese", () => {
    const rule = findAmendmentRule([
      clause("第十四条", "修改章程", "本章程之修改，开会前 21 天要通知会员，须经会员大会三分之二通过。"),
    ]);
    expect(rule?.noticeDays).toBe(21);
  });

  it("finds the clause from its text when no heading was printed", () => {
    const rule = findAmendmentRule([
      clause(
        "12",
        "",
        "Perlembagaan ini boleh dipinda di Mesyuarat Agung Luar Biasa dengan sokongan 2/3 ahli.",
      ),
    ]);
    expect(rule?.requiresGeneralMeeting).toBe(true);
    expect(rule?.majority).toBe("2/3");
  });

  it("reads a Chinese amendment clause", () => {
    const rule = findAmendmentRule([
      clause("第十四条", "修改章程", "本章程之修改，须经会员大会三分之二通过。"),
    ]);
    expect(rule?.requiresGeneralMeeting).toBe(true);
    expect(rule?.majority).toBe("三分之二");
  });

  // The back pages of a constitution are the ones people forget to photograph,
  // so "not found" is a normal outcome and must be distinguishable from
  // "there is no such rule".
  it("returns null when the amendment clause has not been read yet", () => {
    expect(
      findAmendmentRule([
        clause("Fasal 3", "TUJUAN", "Menggalakkan kebajikan ahli-ahli."),
      ]),
    ).toBeNull();
  });

  it("does not mistake amending a MOTION for amending the constitution", () => {
    expect(
      findAmendmentRule([
        clause(
          "Fasal 9",
          "",
          "Sesuatu usul boleh dipinda oleh pencadang sebelum diundi.",
        ),
      ]),
    ).toBeNull();
  });
});

describe("clauseNumberOf", () => {
  it("reads the notations constitutions are actually printed in", () => {
    expect(clauseNumberOf("Fasal 12")).toBe(12);
    expect(clauseNumberOf("12.1")).toBe(12);
    expect(clauseNumberOf("12(a)")).toBe(12);
    expect(clauseNumberOf("Clause 7")).toBe(7);
    expect(clauseNumberOf("第十四条")).toBe(14);
    expect(clauseNumberOf("第十条")).toBe(10);
    expect(clauseNumberOf("第二十一條")).toBe(21);
    expect(clauseNumberOf("第三条")).toBe(3);
  });

  it("gives up rather than guessing on something it cannot read", () => {
    expect(clauseNumberOf("")).toBeNull();
    expect(clauseNumberOf("Lampiran A")).toBeNull();
  });
});

describe("constitutionCoverage", () => {
  const c = (no: string) => clause(no, "", "x");

  it("reports no holes when the clauses run 1..N", () => {
    const cov = constitutionCoverage([c("1"), c("2"), c("3")]);
    expect(cov.gapFree).toBe(true);
    expect(cov.missing).toEqual([]);
    expect(cov.highest).toBe(3);
  });

  // This is the whole point: Minit can PROVE clause 4 is not in what it holds,
  // so it must say so by number instead of waving at "the last pages".
  it("names the clauses that are provably absent", () => {
    const cov = constitutionCoverage([c("1"), c("2"), c("3"), c("5"), c("6")]);
    expect(cov.gapFree).toBe(false);
    expect(cov.missing).toEqual([4]);
  });

  it("folds sub-clauses into their parent", () => {
    const cov = constitutionCoverage([c("1"), c("2.1"), c("2.2"), c("3")]);
    expect(cov.missing).toEqual([]);
    expect(cov.present).toEqual([1, 2, 3]);
  });

  it("counts Chinese clause numbers", () => {
    const cov = constitutionCoverage([c("第一条"), c("第三条")]);
    expect(cov.missing).toEqual([2]);
    expect(cov.highest).toBe(3);
  });

  it("ignores a clause number it cannot parse instead of calling it a hole", () => {
    const cov = constitutionCoverage([c("1"), c("Lampiran A"), c("2")]);
    expect(cov.gapFree).toBe(true);
  });

  it("is empty, not broken, when there is nothing to count", () => {
    expect(constitutionCoverage([])).toEqual({
      present: [],
      missing: [],
      highest: 0,
      gapFree: true,
    });
  });
});

// ---------------------------------------------------------------------------
// §2 (work order 104) — the AI reads the society's own identity, the regex is
// the fallback, and a line break no longer cuts a name or an address in half.
//
// J's report, 2026-08-31 evening: 「名字讀成 Persatuan、地址斷在 Taman」 —
// both from the same cause, `\n` sitting in the sentence-end character class
// while a real PDF wraps exactly there.
// ---------------------------------------------------------------------------

import {
  readRegisteredAddress,
  readRegisteredName,
  readRegistrationNo,
} from "./constitution-identity";
import type { ConstitutionOrganisation } from "./extraction";

const AI_NAME: ConstitutionOrganisation = {
  registered_name: {
    value: "PERTUBUHAN CONTOH HARMONI KANGAR, PERLIS",
    confidence: "confirmed",
    source_ref: { location: "page 1, Fasal 1", snippet: "Pertubuhan ini dikenali" },
  },
  registered_address: {
    value: "No. 12, Jalan Tepi Sungai, Taman Aman, 01000 Kangar, Perlis",
    confidence: "confirmed",
    source_ref: { location: "page 1, Fasal 2", snippet: "Tempat urusan berdaftar" },
  },
  registration_no: {
    value: "PPM-012-02-01011990",
    confidence: "check",
    source_ref: { location: "cover page", snippet: "No. Pendaftaran" },
  },
};

const NOTHING: ConstitutionOrganisation = {
  registered_name: { value: "", confidence: "missing", source_ref: null },
  registered_address: { value: "", confidence: "missing", source_ref: null },
  registration_no: { value: "", confidence: "missing", source_ref: null },
};

describe("§2 — the three organisation fields", () => {
  it("prefers what the AI read over the clause regex", () => {
    const fact = readRegisteredName(
      [clause("Fasal 1", "NAMA", "Pertubuhan ini dikenali sebagai Persatuan Lain.")],
      AI_NAME,
    );
    expect(fact?.value).toBe("PERTUBUHAN CONTOH HARMONI KANGAR, PERLIS");
    expect(fact?.source.kind).toBe("ai");
  });

  it("falls back to the clause regex when the AI says missing", () => {
    const fact = readRegisteredName(
      [
        clause(
          "Fasal 1",
          "NAMA",
          "Pertubuhan ini dikenali sebagai PERSATUAN PENDUDUK TAMAN SRI MUDA.",
        ),
      ],
      NOTHING,
    );
    expect(fact?.value).toBe("PERSATUAN PENDUDUK TAMAN SRI MUDA");
    expect(fact?.source.kind).toBe("clause");
  });

  it("falls back to the clause regex for a constitution read before §2 existed", () => {
    const fact = readRegisteredName(
      [clause("Fasal 1", "NAMA", "Pertubuhan ini dikenali sebagai PERSATUAN LAMA.")],
      undefined,
    );
    expect(fact?.value).toBe("PERSATUAN LAMA");
  });

  it("returns null when neither the AI nor the clauses have it — never a guess", () => {
    expect(readRegisteredName([], NOTHING)).toBeNull();
    expect(readRegisteredAddress([], NOTHING)).toBeNull();
    expect(readRegistrationNo(NOTHING)).toBeNull();
    expect(readRegistrationNo(undefined)).toBeNull();
  });

  it("carries the AI's source_ref and confidence through to the screen", () => {
    const fact = readRegistrationNo(AI_NAME);
    expect(fact?.value).toBe("PPM-012-02-01011990");
    expect(fact?.source).toEqual({
      kind: "ai",
      ref: { location: "cover page", snippet: "No. Pendaftaran" },
      confidence: "check",
    });
  });

  it("keeps a NAME that the PDF wrapped over two lines whole (J's 「Persatuan」)", () => {
    const fact = readRegisteredName([
      clause(
        "Fasal 1",
        "NAMA",
        "Pertubuhan ini dikenali sebagai PERTUBUHAN CONTOH\nHARMONI KANGAR, PERLIS.",
      ),
    ]);
    expect(fact?.value).toBe("PERTUBUHAN CONTOH HARMONI KANGAR, PERLIS");
  });

  it("keeps an ADDRESS that the PDF wrapped over two lines whole (J's 「Taman」)", () => {
    const fact = readRegisteredAddress([
      clause(
        "Fasal 2",
        "ALAMAT",
        "Tempat urusan berdaftar pertubuhan ini ialah No. 12, Jalan Tepi Sungai, Taman\nAman, 01000 Kangar, Perlis.",
      ),
    ]);
    expect(fact?.value).toBe(
      "No. 12, Jalan Tepi Sungai, Taman Aman, 01000 Kangar, Perlis",
    );
  });

  it("refuses an AI value with no letters in it (a misread, not a fact)", () => {
    const junk: ConstitutionOrganisation = {
      ...NOTHING,
      registered_name: {
        value: "—— ,,,",
        confidence: "confirmed",
        source_ref: { location: "page 1", snippet: "…" },
      },
    };
    expect(readRegisteredName([], junk)).toBeNull();
  });

  it("does not answer with the abbreviation in the hereinafter tail", () => {
    // The shape of a real bilingual Fasal 1 — the only quoted run in the
    // sentence is "Persatuan" in the tail. J saw exactly this.
    const fact = readRegisteredName([
      clause(
        "Fasal 1",
        "NAMA / 名稱",
        'Pertubuhan ini dikenali dengan nama PERSATUAN TIONGHUA BANDAR SERI\nMELATI, SELANGOR, dengan nama ringkas PTBSM, dan selepas ini disebut "Persatuan".',
      ),
    ]);
    expect(fact?.value).toBe("PERSATUAN TIONGHUA BANDAR SERI MELATI, SELANGOR");
  });

  it("keeps the tail off the address too (atau di mana-mana tempat lain)", () => {
    const fact = readRegisteredAddress([
      clause(
        "Fasal 2",
        "ALAMAT / 會所地址",
        "Alamat berdaftar dan tempat urusan Persatuan ialah No. 88, Jalan Bunga Melati 3,\nTaman Seri Melati, 43500 Bandar Seri Melati, Selangor Darul Ehsan, atau di mana-mana tempat lain yang ditetapkan dari semasa ke semasa oleh Jawatankuasa.",
      ),
    ]);
    expect(fact?.value).toBe(
      "No. 88, Jalan Bunga Melati 3, Taman Seri Melati, 43500 Bandar Seri Melati, Selangor Darul Ehsan",
    );
  });
});
