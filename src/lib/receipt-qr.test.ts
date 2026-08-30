import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { qrMatrix, rasterizeQrMatrix } from "./receipt-qr";

// The encoder is proved by a real DECODER, not by trusting the library: a
// matrix that jsQR cannot read back is a failure even if qrcode-generator
// thinks it is fine.

function decode(matrix: boolean[][]): string | null {
  const { data, width, height } = rasterizeQrMatrix(matrix);
  const hit = jsQR(data, width, height);
  return hit ? hit.data : null;
}

describe("qrMatrix", () => {
  it("encodes a production-length verify URL that a decoder reads back", () => {
    const url =
      "https://minit-project.vercel.app/verify/resit?t=eyJvIjoxNSwibiI6Ik1JTi0yMDI2LTAwMDEifQ.3q2-7wCQmJqutLW2t7i5uru8vb6_wMHCw8TFxsfIyQ";
    const m = qrMatrix(url);
    expect(m.length).toBeGreaterThan(20); // a real matrix, not a stub
    expect(m.every((row) => row.length === m.length)).toBe(true); // square
    expect(decode(m)).toBe(url);
  });

  it("encodes a short localhost URL too (probe environment)", () => {
    const url = "http://localhost:3000/verify/resit?t=abc.def";
    expect(decode(qrMatrix(url))).toBe(url);
  });
});
