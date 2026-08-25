import { describe, expect, it } from "vitest";
import {
  checkCoverage,
  checkNames,
  composeMinutesMd,
  minutesPlanSchema,
  type MinutesPlan,
} from "@/lib/minutes-compose";
import { emptyMeetingNotesExtraction } from "@/lib/extraction";

// The point of these tests is the guarantee the model cannot give us: that no
// confirmed item disappears between "the person ticked it" and "the society
// signed it". On 2026-08-19 a real 17-item whiteboard came back from the model
// beautifully organised and 5 items short, which is what these guard.

const plan = (p: Partial<MinutesPlan>): MinutesPlan =>
  minutesPlanSchema.parse({
    sections: [],
    unresolved: [],
    ...p,
  });

const confirmed = (value: string) => ({
  value,
  confidence: "confirmed" as const,
  source_ref: null,
});

describe("checkCoverage", () => {
  it("passes when every item is placed exactly once", () => {
    const r = checkCoverage(
      plan({
        sections: [
          { heading: "A", items: [{ source: 0, text: "x" }, { source: 2, text: "z" }] },
        ],
        unresolved: [{ source: 1, text: "y" }],
      }),
      3,
    );
    expect(r).toEqual({ ok: true, missing: [], duplicated: [], unknown: [] });
  });

  it("catches the dangerous case — a silently dropped item", () => {
    const r = checkCoverage(
      plan({ sections: [{ heading: "A", items: [{ source: 0, text: "x" }] }] }),
      3,
    );
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual([1, 2]);
  });

  it("catches an item counted twice", () => {
    const r = checkCoverage(
      plan({
        sections: [
          { heading: "A", items: [{ source: 0, text: "x" }] },
          { heading: "B", items: [{ source: 0, text: "x again" }] },
        ],
      }),
      1,
    );
    expect(r.ok).toBe(false);
    expect(r.duplicated).toEqual([0]);
  });

  it("catches an index that does not exist", () => {
    const r = checkCoverage(
      plan({
        sections: [
          {
            heading: "A",
            items: [{ source: 0, text: "x" }, { source: 9, text: "invented" }],
          },
        ],
      }),
      1,
    );
    expect(r.ok).toBe(false);
    expect(r.unknown).toEqual([9]);
  });
});

describe("composeMinutesMd", () => {
  const extraction = {
    ...emptyMeetingNotesExtraction,
    meeting_type: {
      value: "committee" as const,
      confidence: "confirmed" as const,
      source_ref: null,
    },
    meeting_date: { ...confirmed("2026-08-16") },
    meeting_venue: { ...confirmed("hongdao") },
  };

  const built = () =>
    composeMinutesMd(
      plan({
        sections: [
          {
            heading: "Tugasan",
            items: [
              { source: 0, text: "Pengacara kelas Qing: 嘉益" },
              { source: 1, text: "Pengacara kelas Shao: 柔依(信)" },
            ],
          },
        ],
        unresolved: [{ source: 2, text: "Lagu video pendek belum dimuktamadkan" }],
      }),
      extraction,
      { orgName: "If Else", confirmedBy: "shi hui", dateIso: "2026-08-19" },
    );

  it("renders the letterhead and meeting block", () => {
    const md = built();
    expect(md).toContain("# MINIT MESYUARAT — If Else");
    expect(md).toContain("Jenis mesyuarat: Mesyuarat Jawatankuasa");
    expect(md).toContain("Tarikh: 2026-08-16");
  });

  it("builds the opening summary from the section headings, inventing nothing", () => {
    const md = built();
    expect(md).toContain("Mesyuarat ini membincangkan: Tugasan.");
    expect(md).toContain("1 perkara masih belum dimuktamadkan");
  });

  it("numbers sections and their items", () => {
    const md = built();
    expect(md).toContain("## 1. Tugasan");
    expect(md).toContain("1.1 Pengacara kelas Qing: 嘉益");
    expect(md).toContain("1.2 Pengacara kelas Shao: 柔依(信)");
  });

  it("keeps personal names in their original characters", () => {
    expect(built()).toContain("嘉益");
  });

  it("lists what is still open instead of asserting it", () => {
    const md = built();
    expect(md).toContain("## PERKARA BELUM MUKTAMAD");
    expect(md).toContain("Lagu video pendek belum dimuktamadkan");
  });

  it("ends with the Hard Rule 8 audit line naming the real signer", () => {
    expect(built().trimEnd()).toMatch(
      /Disediakan oleh Minit, disahkan oleh shi hui pada 2026-08-19 \/ Drafted by Minit, confirmed by shi hui on 2026-08-19$/,
    );
  });

  it("omits sections that have no data rather than printing an empty heading", () => {
    const md = built();
    expect(md).not.toContain("## KEWANGAN");
    expect(md).not.toContain("## PEMEGANG JAWATAN");
    expect(md).not.toContain("## KEHADIRAN");
  });

  it("drops a section the model returned with no items", () => {
    const md = composeMinutesMd(
      plan({ sections: [{ heading: "Kosong", items: [] }] }),
      extraction,
      { orgName: "If Else", confirmedBy: "shi hui", dateIso: "2026-08-19" },
    );
    expect(md).not.toContain("Kosong");
  });
});

describe("checkNames", () => {
  const SOURCES = ["青班主持: 嘉益", "小小班主持: 雯倩", "Live Band - 2~3首歌"];

  it("accepts characters copied out of the item they came from", () => {
    expect(
      checkNames(
        plan({
          sections: [
            {
              heading: "Tugas",
              items: [
                { source: 0, text: "Pengacara bagi 青班 ialah 嘉益." },
                { source: 1, text: "Pengacara bagi 小小班 ialah 雯倩." },
              ],
            },
          ],
        }),
        SOURCES,
      ),
    ).toEqual({ ok: true, altered: [] });
  });

  it("catches a name the model rewrote — 小小班 became 小小小班", () => {
    const r = checkNames(
      plan({
        sections: [
          {
            heading: "Tugas",
            items: [{ source: 1, text: "Pengacara bagi 小小小班 ialah 雯倩." }],
          },
        ],
      }),
      SOURCES,
    );
    expect(r.ok).toBe(false);
    expect(r.altered).toEqual([1]);
  });

  it("does not mind Chinese being dropped in favour of Bahasa Malaysia", () => {
    expect(
      checkNames(
        plan({
          sections: [
            {
              heading: "Program",
              items: [
                { source: 2, text: "Live Band mempersembahkan 2 hingga 3 buah lagu." },
              ],
            },
          ],
        }),
        SOURCES,
      ).ok,
    ).toBe(true);
  });
});

describe("checkNames with a glossary", () => {
  it("allows the spelling the organisation itself asked for", () => {
    const sources = ["青班主持: 嘉益"];
    const p = plan({
      sections: [
        {
          heading: "Tugas",
          items: [{ source: 0, text: "Pengacara bagi 青年班 ialah 嘉益." }],
        },
      ],
    });
    // Without the glossary this is an altered name...
    expect(checkNames(p, sources).ok).toBe(false);
    // ...with it, it is the org's own preferred rendering.
    expect(checkNames(p, sources, ["青班", "青年班"]).ok).toBe(true);
  });

  it("still catches characters that are in neither the note nor the glossary", () => {
    expect(
      checkNames(
        plan({
          sections: [
            {
              heading: "Tugas",
              items: [{ source: 0, text: "Pengacara bagi 小小小班 ialah 嘉益." }],
            },
          ],
        }),
        ["青班主持: 嘉益"],
        ["青班", "青年班"],
      ).ok,
    ).toBe(false);
  });
});

describe("composeMinutesMd in other languages", () => {
  const extraction = {
    ...emptyMeetingNotesExtraction,
    meeting_type: {
      value: "committee" as const,
      confidence: "confirmed" as const,
      source_ref: null,
    },
    meeting_date: { ...confirmed("2026-08-16") },
  };

  const build = (lang: "bm" | "zh" | "en") =>
    composeMinutesMd(
      plan({
        sections: [
          { heading: "Tugasan", items: [{ source: 0, text: "Pengacara: 嘉益" }] },
        ],
        unresolved: [{ source: 1, text: "Lagu belum dipilih" }],
      }),
      extraction,
      { orgName: "If Else", confirmedBy: "shi hui", dateIso: "2026-08-19", lang },
    );

  it("writes every fixed label in the chosen language, not just the headings", () => {
    const zh = build("zh");
    expect(zh).toContain("# 会议记录 — If Else");
    expect(zh).toContain("会议类型: 理事会议");
    expect(zh).toContain("日期: 2026-08-16");
    expect(zh).toContain("## 还没定下来的事");
    expect(zh).not.toContain("MINIT MESYUARAT");
    expect(zh).not.toContain("Jenis mesyuarat");

    const en = build("en");
    expect(en).toContain("# MINUTES OF MEETING — If Else");
    expect(en).toContain("Type of meeting: Committee Meeting");
    expect(en).toContain("## STILL TO BE DECIDED");
  });

  it("keeps Bahasa Malaysia in the audit line whatever the document language", () => {
    for (const lang of ["bm", "zh", "en"] as const) {
      expect(build(lang)).toContain(
        "Disediakan oleh Minit, disahkan oleh shi hui pada 2026-08-19",
      );
    }
    expect(build("zh")).toContain("由 Minit 起草，shi hui 于 2026-08-19 确认");
  });

  it("defaults to Bahasa Malaysia — what eROSES needs", () => {
    const md = composeMinutesMd(
      plan({ sections: [{ heading: "Tugasan", items: [{ source: 0, text: "x" }] }] }),
      extraction,
      { orgName: "If Else", confirmedBy: "shi hui", dateIso: "2026-08-19" },
    );
    expect(md).toContain("# MINIT MESYUARAT — If Else");
  });
});

describe("composeMinutesMd — the formal template (Stage D)", () => {
  const extraction = {
    ...emptyMeetingNotesExtraction,
    meeting_type: {
      value: "committee" as const,
      confidence: "confirmed" as const,
      source_ref: null,
    },
    meeting_date: { ...confirmed("2026-08-16") },
  };
  const opts = {
    orgName: "If Else",
    confirmedBy: "shi hui",
    dateIso: "2026-08-19",
  };
  const onePlan = () =>
    plan({
      sections: [
        {
          heading: "Tugasan",
          items: [
            { source: 0, kind: "perbincangan", text: "Perkara A dibincangkan." },
            { source: 1, kind: "keputusan", text: "Perkara B diluluskan." },
            { source: 2, kind: "tindakan", text: "Perkara C diuruskan oleh 嘉益." },
            { source: 3, text: "Perkara D." },
          ],
        },
      ],
    });

  it("prints the Perbincangan / Keputusan / Tindakan label the model TAGGED, from a fixed table", () => {
    const md = composeMinutesMd(onePlan(), extraction, opts);
    expect(md).toContain("1.1 Perbincangan: Perkara A dibincangkan.");
    expect(md).toContain("1.2 Keputusan: Perkara B diluluskan.");
    expect(md).toContain("1.3 Tindakan: Perkara C diuruskan oleh 嘉益.");
    // An untagged item prints exactly as before — no prefix, no loss.
    expect(md).toContain("1.4 Perkara D.");
  });

  it("drops a kind the model invented instead of failing the whole plan", () => {
    const p = minutesPlanSchema.parse({
      sections: [
        { heading: "A", items: [{ source: 0, text: "x", kind: "nonsense" }] },
      ],
      unresolved: [],
    });
    expect(p.sections[0].items[0].kind).toBeUndefined();
    // Coverage is untouched by the bad tag — the item is still counted.
    expect(checkCoverage(p, 1).ok).toBe(true);
  });

  it("prints Bil. ____/<year> from the confirmed date, leaving the number blank rather than inventing one", () => {
    const md = composeMinutesMd(onePlan(), extraction, opts);
    expect(md).toContain("Bil.: ____ / 2026");
  });

  it("omits the Bil. line when there is no meeting date to take a year from", () => {
    const md = composeMinutesMd(onePlan(), emptyMeetingNotesExtraction, opts);
    expect(md).not.toContain("Bil.");
  });

  it("prints the PPM/ROS line under the letterhead — in stampIdentity's exact format", () => {
    const md = composeMinutesMd(onePlan(), extraction, {
      ...opts,
      ppmNo: "PPM-012-34-56789012",
    });
    expect(md).toContain(
      "No. Pendaftaran (PPM/ROS): PPM-012-34-56789012",
    );
    // Directly under the title, before anything else.
    expect(md.split("\n")[1]).toContain("No. Pendaftaran");
  });

  it("prints no registration line when the org has not entered one", () => {
    const md = composeMinutesMd(onePlan(), extraction, opts);
    expect(md).not.toContain("No. Pendaftaran");
  });

  it("closes with PENUTUP and the signature block, audit line last", () => {
    const md = composeMinutesMd(onePlan(), extraction, opts);
    expect(md).toContain("## PENUTUP");
    expect(md).toContain("Mesyuarat ditangguhkan.");
    expect(md).toContain("Disediakan oleh,");
    expect(md).toContain("( shi hui )");
    expect(md).toContain("Disahkan oleh,");
    // The endorsement slot is a labelled BLANK — Minit does not know who the
    // chairperson is and must not guess.
    expect(md).toContain("( Pengerusi )");
    expect(md).not.toContain("( Pengerusi ) shi hui");
    expect(md.trimEnd()).toMatch(/Drafted by Minit, confirmed by shi hui on 2026-08-19$/);
  });

  it("annotates an attendee with their position only on an exact confirmed name match", () => {
    const withPeople = {
      ...extraction,
      attendees: [
        { name: { ...confirmed("嘉益") } },
        { name: { ...confirmed("雯倩") } },
      ],
      office_bearers: [
        { position: { ...confirmed("Setiausaha") }, person_name: { ...confirmed("嘉益") } },
      ],
    };
    const md = composeMinutesMd(onePlan(), withPeople, opts);
    expect(md).toContain("1. 嘉益 — Setiausaha");
    expect(md).toContain("2. 雯倩");
    expect(md).not.toContain("雯倩 — ");
  });

  it("D-2: a reading copy names itself a translation; the BM filing copy does not", () => {
    const zh = composeMinutesMd(onePlan(), extraction, { ...opts, lang: "zh" });
    expect(zh).toContain("翻译本 —— 非呈报用 / Terjemahan");
    const en = composeMinutesMd(onePlan(), extraction, { ...opts, lang: "en" });
    expect(en).toContain("Translation — not for filing / Terjemahan");
    const bm = composeMinutesMd(onePlan(), extraction, opts);
    expect(bm).not.toContain("Terjemahan");
  });
});

describe("checkNames and a Chinese document", () => {
  // Documented limitation, asserted so nobody "fixes" it by turning the check
  // back on for Chinese and gets a flood of false rejections.
  it("would reject ordinary Chinese prose, which is why the caller skips it", () => {
    const p = plan({
      sections: [
        { heading: "分工", items: [{ source: 0, text: "小小班的主持由 雯倩 负责。" }] },
      ],
    });
    expect(checkNames(p, ["小小班主持: 雯倩"]).ok).toBe(false);
  });
});
