import { describe, expect, it } from "vitest";
import {
  applyNameSubstitutions,
  rosterNameSubstitutions,
} from "@/lib/roster-names";

const roster = [
  { name: "喜益", position: "Pengerusi", nameOfficial: "TAN XI YI" },
  { name: "柔依", position: "Setiausaha", nameOfficial: "LIM ROU YI" },
  { name: "零倩", position: "AJK", nameOfficial: null },
  { name: "AZLINA", position: "Bendahari", nameOfficial: "AZLINA BINTI ALI" },
];

describe("rosterNameSubstitutions", () => {
  it("offers only CJK names that appear AND have an official name", () => {
    const text = "Pengacara bagi 青班 ialah 喜益 dan 柔依. 零倩 juga hadir.";
    const subs = rosterNameSubstitutions(text, roster);
    expect(subs).toEqual([
      { from: "喜益", to: "TAN XI YI", count: 1 },
      { from: "柔依", to: "LIM ROU YI", count: 1 },
      // 零倩 has no official name -> not offered (the UI says go fill the
      // roster); AZLINA is Latin script -> the BM guard never flagged her.
    ]);
  });

  it("counts every occurrence", () => {
    const subs = rosterNameSubstitutions("喜益, 喜益 dan 喜益", roster);
    expect(subs).toEqual([{ from: "喜益", to: "TAN XI YI", count: 3 }]);
  });

  it("longer names win over their own fragments", () => {
    const r = [
      { name: "陈某", position: "", nameOfficial: "TAN MOU" },
      { name: "陈某某", position: "", nameOfficial: "TAN MOU MOU" },
    ];
    const subs = rosterNameSubstitutions("hadir: 陈某某", r);
    expect(subs).toEqual([{ from: "陈某某", to: "TAN MOU MOU", count: 1 }]);
  });
});

describe("applyNameSubstitutions", () => {
  it("replaces every occurrence, longest name first", () => {
    const text = "Pengerusi 喜益; pencatat 柔依; 喜益 menutup mesyuarat.";
    const subs = rosterNameSubstitutions(text, roster);
    expect(applyNameSubstitutions(text, subs)).toBe(
      "Pengerusi TAN XI YI; pencatat LIM ROU YI; TAN XI YI menutup mesyuarat.",
    );
  });
});
