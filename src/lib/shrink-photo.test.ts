import { describe, expect, it, vi } from "vitest";
import {
  EXIF_DECODE_OPTIONS,
  fitWithin,
  isTooLargeToUpload,
  needsShrink,
  SHRINK_LADDER,
  SHRINK_TARGET_BYTES,
  shrinkWithIo,
  tooLargeToUploadMessage,
  UPLOAD_HARD_LIMIT_BYTES,
  uploadErrorMessage,
  type ShrinkIo,
} from "./shrink-photo";
import { joinUserError, USER_ERRORS } from "./user-errors";

const MB = 1024 * 1024;

/** A fake big file without allocating real megabytes: size is what matters. */
function fakeFile(bytes: number, name = "IMG_0001.jpeg", type = "image/jpeg"): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
}

function blobOf(bytes: number): Blob {
  const b = new Blob(["x"]);
  Object.defineProperty(b, "size", { value: bytes });
  return b;
}

describe("the limits agree with each other", () => {
  it("hard limit is 4MB — under Vercel's ~4.5MB platform cap, with margin", () => {
    expect(UPLOAD_HARD_LIMIT_BYTES).toBe(4 * MB);
    expect(UPLOAD_HARD_LIMIT_BYTES).toBeLessThan(4.5 * MB);
  });

  it("shrink target sits below the hard limit (form overhead cannot tip it over)", () => {
    expect(SHRINK_TARGET_BYTES).toBeLessThan(UPLOAD_HARD_LIMIT_BYTES);
  });

  it("ladder steps never grow in size or quality", () => {
    for (let i = 1; i < SHRINK_LADDER.length; i++) {
      expect(SHRINK_LADDER[i].maxEdge).toBeLessThanOrEqual(SHRINK_LADDER[i - 1].maxEdge);
      expect(SHRINK_LADDER[i].quality).toBeLessThanOrEqual(SHRINK_LADDER[i - 1].quality);
    }
  });

  it("EXIF orientation is baked in at decode time (from-image)", () => {
    expect(EXIF_DECODE_OPTIONS.imageOrientation).toBe("from-image");
  });
});

describe("fitWithin", () => {
  it("scales the long edge down, keeping aspect", () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
  });

  it("keeps portrait portrait — the orientation must survive the resize", () => {
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it("never upscales", () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });

  it("never collapses a dimension to zero", () => {
    expect(fitWithin(10000, 1, 2000).height).toBe(1);
  });
});

describe("needsShrink / isTooLargeToUpload", () => {
  it("only images shrink — a PDF passes through untouched", () => {
    expect(needsShrink("image/jpeg", 6 * MB)).toBe(true);
    expect(needsShrink("application/pdf", 6 * MB)).toBe(false);
  });

  it("a small image is left alone", () => {
    expect(needsShrink("image/jpeg", 1 * MB)).toBe(false);
  });

  it("the hard gate opens exactly at the limit", () => {
    expect(isTooLargeToUpload(UPLOAD_HARD_LIMIT_BYTES)).toBe(false);
    expect(isTooLargeToUpload(UPLOAD_HARD_LIMIT_BYTES + 1)).toBe(true);
  });
});

describe("uploadErrorMessage", () => {
  it("prefers the server's own JSON error", () => {
    expect(uploadErrorMessage(413, "specific words")).toBe("specific words");
  });

  it("413 without JSON = the transport refused the file, say 'too large'", () => {
    expect(uploadErrorMessage(413, null)).toBe(tooLargeToUploadMessage());
    expect(uploadErrorMessage(413, null)).toBe(
      joinUserError(USER_ERRORS.fileTooLargeForUpload),
    );
  });

  it("anything else without JSON = the honest generic sentence", () => {
    expect(uploadErrorMessage(500, undefined)).toBe(
      joinUserError(USER_ERRORS.aiUnavailable),
    );
  });
});

describe("shrinkWithIo", () => {
  const decode6mp = vi
    .fn()
    .mockResolvedValue({ width: 4000, height: 3000, source: "src" });

  it("a big image comes out under the target, as a JPEG", async () => {
    const encode = vi.fn().mockResolvedValue(blobOf(1 * MB));
    const out = await shrinkWithIo(fakeFile(6 * MB), { decode: decode6mp, encode });
    expect(out.size).toBeLessThanOrEqual(SHRINK_TARGET_BYTES);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("IMG_0001.jpg");
    // First ladder step sufficed — and it was asked for the fitted size.
    expect(encode).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenCalledWith("src", 2000, 1500, SHRINK_LADDER[0].quality);
  });

  it("walks down the ladder until a step fits", async () => {
    const encode = vi
      .fn()
      .mockResolvedValueOnce(blobOf(5 * MB))
      .mockResolvedValueOnce(blobOf(4 * MB))
      .mockResolvedValueOnce(blobOf(2 * MB));
    const out = await shrinkWithIo(fakeFile(7 * MB), { decode: decode6mp, encode });
    expect(encode).toHaveBeenCalledTimes(3);
    expect(out.size).toBe(2 * MB);
  });

  it("no step fits: returns the smallest attempt when it beats the original", async () => {
    const encode = vi.fn().mockResolvedValue(blobOf(3.8 * MB));
    const out = await shrinkWithIo(fakeFile(7 * MB), { decode: decode6mp, encode });
    expect(encode).toHaveBeenCalledTimes(SHRINK_LADDER.length);
    expect(out.size).toBe(3.8 * MB);
  });

  it("a small file or a PDF never touches the decoder", async () => {
    const decode = vi.fn();
    const encode = vi.fn();
    const small = fakeFile(1 * MB);
    expect(await shrinkWithIo(small, { decode, encode })).toBe(small);
    const pdf = fakeFile(6 * MB, "scan.pdf", "application/pdf");
    expect(await shrinkWithIo(pdf, { decode, encode })).toBe(pdf);
    expect(decode).not.toHaveBeenCalled();
  });

  it("decode throws (HEIC without a decoder) → the ORIGINAL file is sent", async () => {
    const io: ShrinkIo = {
      decode: vi.fn().mockRejectedValue(new Error("no HEIC here")),
      encode: vi.fn(),
    };
    const heic = fakeFile(5 * MB, "IMG_0002.heic", "image/heic");
    expect(await shrinkWithIo(heic, io)).toBe(heic);
  });

  it("encode yields nothing useful → the original, never an empty file", async () => {
    const io: ShrinkIo = {
      decode: decode6mp,
      encode: vi.fn().mockResolvedValue(null),
    };
    const big = fakeFile(6 * MB);
    expect(await shrinkWithIo(big, io)).toBe(big);
  });

  it("closes the decoded bitmap even when encoding fails", async () => {
    const close = vi.fn();
    const io: ShrinkIo = {
      decode: vi.fn().mockResolvedValue({ width: 4000, height: 3000, source: "s", close }),
      encode: vi.fn().mockRejectedValue(new Error("encoder died")),
    };
    const big = fakeFile(6 * MB);
    expect(await shrinkWithIo(big, io)).toBe(big);
    expect(close).toHaveBeenCalled();
  });
});
