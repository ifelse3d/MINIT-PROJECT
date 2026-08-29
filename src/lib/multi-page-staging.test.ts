import { describe, expect, it } from "vitest";

import { canStageTogether, isPhotoType } from "@/lib/multi-page-staging";

// D0-1 (work order 56): several files staged together are pages of ONE
// document — photos only. A PDF/Office file is already a whole document.
describe("canStageTogether", () => {
  it("nothing staged is fine", () => {
    expect(canStageTogether([])).toBe(true);
  });

  it("one file of any kind is fine", () => {
    expect(canStageTogether(["application/pdf"])).toBe(true);
    expect(canStageTogether(["image/jpeg"])).toBe(true);
    expect(
      canStageTogether([
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ]),
    ).toBe(true);
  });

  it("several photos are fine", () => {
    expect(canStageTogether(["image/jpeg", "image/png", "image/webp"])).toBe(true);
  });

  it("several files with any non-photo among them are refused", () => {
    expect(canStageTogether(["image/jpeg", "application/pdf"])).toBe(false);
    expect(canStageTogether(["application/pdf", "application/pdf"])).toBe(false);
  });
});

describe("isPhotoType", () => {
  it("images yes, documents no", () => {
    expect(isPhotoType("image/heic")).toBe(true);
    expect(isPhotoType("application/pdf")).toBe(false);
  });
});
