import { describe, expect, it } from "vitest";
import { renderMinitMd, signatureRole, SIGNATURE_LINE, type MinitDocModel } from "./minit-format";

// 125 §3 — the signature block prints roles in the document's language and
// never a Chinese role word under a BM signature. Fictional names (A3).

const base = (): MinitDocModel => ({
  lang: "bm",
  orgName: "PERSATUAN CONTOH",
  sections: [{ no: "", title: "Perkara", items: [{ text: "Mesyuarat diadakan." }] }],
  preparedBy: { name: "王丽华", role: "记录" },
  endorsedBy: { name: "张伟杰", role: "主席" },
});

describe("🔴 125 §3 — signatureRole", () => {
  it("maps the page's role words to the genre's labels", () => {
    expect(signatureRole("bm", "记录")).toBe("SETIAUSAHA");
    expect(signatureRole("bm", "主席")).toBe("PENGERUSI");
    expect(signatureRole("bm", "Setiausaha")).toBe("SETIAUSAHA");
    expect(signatureRole("bm", "Chairman")).toBe("PENGERUSI");
    expect(signatureRole("bm", "财政")).toBe("BENDAHARI");
    expect(signatureRole("en", "记录")).toBe("SECRETARY");
    expect(signatureRole("zh", "Pengerusi")).toBe("主席");
  });

  it("an unknown role prints as written, upper-cased — unless it is Chinese under a BM/EN signature", () => {
    expect(signatureRole("bm", "Penolong Setiausaha")).toBe("PENOLONG SETIAUSAHA");
    expect(signatureRole("bm", "副会长")).toBeUndefined();
    expect(signatureRole("zh", "副会长")).toBe("副会长");
    expect(signatureRole("bm", "")).toBeUndefined();
    expect(signatureRole("bm", undefined)).toBeUndefined();
  });
});

describe("🔴 125 §3 — the rendered signature block", () => {
  it("both names from the header, roles in BM, no Chinese role word", () => {
    const md = renderMinitMd(base());
    expect(md).toContain(`Disediakan oleh,\n\n${SIGNATURE_LINE}\n( 王丽华 )\nSETIAUSAHA`);
    expect(md).toContain(`Disahkan oleh,\n\n${SIGNATURE_LINE}\n( 张伟杰 )\nPENGERUSI`);
    expect(md).not.toContain("记录");
    expect(md).not.toContain("主席");
  });

  it("nobody recorded → clean blank lines with the standard roles, no placeholder name", () => {
    const md = renderMinitMd({ ...base(), preparedBy: { name: "" }, endorsedBy: undefined });
    expect(md).toContain(`Disediakan oleh,\n\n${SIGNATURE_LINE}\nSETIAUSAHA`);
    expect(md).toContain(`Disahkan oleh,\n\n${SIGNATURE_LINE}\nPENGERUSI`);
    expect(md).not.toContain("( Pengerusi )");
    expect(md).not.toContain("(  )");
  });

  it("the zh reading copy prints its own role labels", () => {
    const md = renderMinitMd({ ...base(), lang: "zh" });
    expect(md).toContain("( 王丽华 )\n秘书");
    expect(md).toContain("( 张伟杰 )\n主席");
  });
});
