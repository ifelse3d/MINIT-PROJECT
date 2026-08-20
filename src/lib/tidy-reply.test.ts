import { describe, expect, it } from "vitest";
import { tidyReply } from "./tidy-reply";

describe("tidyReply", () => {
  it("turns an escaped newline into a real line break", () => {
    expect(tidyReply("可以。\\n1) 打开 Minit\\n2) 点进 Money")).toBe(
      "可以。\n1) 打开 Minit\n2) 点进 Money",
    );
  });

  it("leaves a real line break alone", () => {
    expect(tidyReply("a\nb")).toBe("a\nb");
  });

  it("collapses a run of blank lines and trims the ends", () => {
    expect(tidyReply("  a\\n\\n\\n\\nb  ")).toBe("a\n\nb");
  });

  it("does not touch a backslash that was never a line break", () => {
    expect(tidyReply("C:\\dev")).toBe("C:\\dev");
  });
});
