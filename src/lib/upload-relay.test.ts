import { describe, expect, it } from "vitest";
import {
  RELAY_MAX_BYTES,
  RELAY_STALE_MS,
  isRelayPathForOrg,
  looksLikePdf,
  relayFileName,
  relayPathFor,
  relaySafeName,
  relayTimestamp,
  staleRelayNames,
} from "./upload-relay";

describe("relay paths", () => {
  it("builds {org}/relay/{ts}-{safeName}", () => {
    expect(relayPathFor(91, "Laporan AGM 2026.pdf", 1756400000000)).toBe(
      "91/relay/1756400000000-Laporan_AGM_2026.pdf",
    );
  });

  it("sanitises names the same way record-upload does", () => {
    // The whole CJK+space+slash prefix is ONE run of non-word chars → "_".
    expect(relaySafeName("会议 记录/①.pdf")).toBe("_.pdf");
    expect(relaySafeName("")).toBe("document.pdf");
    // Long names keep the END (the extension), same slice(-80).
    const long = "x".repeat(100) + ".pdf";
    expect(relaySafeName(long).length).toBe(80);
    expect(relaySafeName(long).endsWith(".pdf")).toBe(true);
  });

  it("validates ownership strictly", () => {
    const p = relayPathFor(91, "a.pdf", 123);
    expect(isRelayPathForOrg(p, 91)).toBe(true);
    expect(isRelayPathForOrg(p, 15)).toBe(false);
    expect(isRelayPathForOrg("91/meeting_notes/123-a.pdf", 91)).toBe(false);
    expect(isRelayPathForOrg("91/relay/123-a.pdf/../../x", 91)).toBe(false);
    expect(isRelayPathForOrg("991/relay/123-a.pdf", 91)).toBe(false);
  });

  it("recovers the filename and the timestamp", () => {
    const p = relayPathFor(91, "minit.pdf", 456);
    expect(relayFileName(p)).toBe("minit.pdf");
    expect(relayTimestamp(p)).toBe(456);
    expect(relayTimestamp("91/relay/not-a-ts.pdf")).toBe(null);
  });
});

describe("staleRelayNames", () => {
  it("keeps fresh files, sweeps old and unparseable ones", () => {
    const now = 10_000_000_000;
    const fresh = `${now - 1000}-fresh.pdf`;
    const old = `${now - RELAY_STALE_MS - 1}-old.pdf`;
    expect(staleRelayNames([fresh, old, "junk.pdf"], now)).toEqual([
      old,
      "junk.pdf",
    ]);
  });
});

describe("looksLikePdf", () => {
  it("accepts %PDF- and refuses everything else", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 rest").buffer as ArrayBuffer;
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]).buffer as ArrayBuffer;
    expect(looksLikePdf(pdf)).toBe(true);
    expect(looksLikePdf(jpg)).toBe(false);
    expect(looksLikePdf(new ArrayBuffer(2))).toBe(false);
  });
});

describe("RELAY_MAX_BYTES", () => {
  it("stays under the vendor inline ceiling once base64-encoded", () => {
    // ~20MB vendor request cap; base64 is 4/3 — leave prompt headroom.
    expect((RELAY_MAX_BYTES * 4) / 3).toBeLessThan(18 * 1024 * 1024);
  });
});
