import { describe, expect, it } from "vitest";
import {
  RELAY_MAX_BYTES,
  RELAY_MIME,
  RELAY_STALE_MS,
  bytesMatchRelayKind,
  isRelayPathForOrg,
  looksLikePdf,
  looksLikeZip,
  relayFileName,
  relayKindFor,
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

// D0-3 (work order 56, 拍板 4): .docx/.pptx ride the relay too.
describe("relayKindFor", () => {
  it("routes by MIME first", () => {
    expect(relayKindFor("x.bin", "application/pdf")).toBe("pdf");
    expect(relayKindFor("x.bin", RELAY_MIME.docx)).toBe("docx");
    expect(relayKindFor("x.bin", RELAY_MIME.pptx)).toBe("pptx");
  });

  it("falls back to the extension (phone browsers send blank types)", () => {
    expect(relayKindFor("Laporan.PDF", "")).toBe("pdf");
    expect(relayKindFor("minit 2025.docx", "")).toBe("docx");
    expect(relayKindFor("taklimat.pptx", "application/octet-stream")).toBe("pptx");
  });

  it("gives no road to photos, xlsx or legacy Office files", () => {
    expect(relayKindFor("a.jpg", "image/jpeg")).toBe(null);
    expect(relayKindFor("senarai.xlsx", "")).toBe(null);
    expect(relayKindFor("old.doc", "application/msword")).toBe(null);
    expect(relayKindFor("old.ppt", "")).toBe(null);
  });
});

describe("zip magic", () => {
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]).buffer as ArrayBuffer;
  const pdf = new TextEncoder().encode("%PDF-1.7").buffer as ArrayBuffer;

  it("accepts PK\\x03\\x04 and refuses everything else", () => {
    expect(looksLikeZip(zip)).toBe(true);
    expect(looksLikeZip(pdf)).toBe(false);
    expect(looksLikeZip(new ArrayBuffer(2))).toBe(false);
  });

  it("bytesMatchRelayKind pairs each kind with its own magic", () => {
    expect(bytesMatchRelayKind("pdf", pdf)).toBe(true);
    expect(bytesMatchRelayKind("pdf", zip)).toBe(false);
    expect(bytesMatchRelayKind("docx", zip)).toBe(true);
    expect(bytesMatchRelayKind("pptx", zip)).toBe(true);
    expect(bytesMatchRelayKind("pptx", pdf)).toBe(false);
  });
});

describe("RELAY_MAX_BYTES", () => {
  it("stays under the vendor inline ceiling once base64-encoded", () => {
    // ~20MB vendor request cap; base64 is 4/3 — leave prompt headroom.
    expect((RELAY_MAX_BYTES * 4) / 3).toBeLessThan(18 * 1024 * 1024);
  });
});
