// ---------------------------------------------------------------------------
// STORAGE RELAY for big PDFs — the pure half (path math, limits). A-4, work
// order 51 (拍板 4), 2026-08-29.
//
// WHY THIS EXISTS. Vercel kills any serverless request body over ~4.5MB with
// a platform-level text/plain 413 (proven by scripts/probe-payload.mjs, 工作单
// 48). Photos are shrunk in the browser, but a PDF cannot be shrunk — so a
// scanned constitution or a Word-exported report over 4MB simply could not
// reach the AI at all. The fix: the browser uploads the PDF STRAIGHT to
// Supabase Storage (RLS-scoped to the org, same "uploads" bucket the app
// already uses), sends the API route only the storage PATH, and the route
// downloads the bytes server-side — Vercel never carries the file.
//
// Path shape:  {orgId}/relay/{timestamp}-{safeName}
//   * the leading org id is what the storage RLS policies check;
//   * "relay/" keeps these apart from the permanent {orgId}/{kind}/ files;
//   * the timestamp prefix lets a sweeper age files WITHOUT a metadata call.
//
// Lifecycle: the route deletes the relay object as soon as the bytes are in
// memory ("read it, then clean it"); anything left behind (a tab closed
// between upload and send) is swept by the next relay upload from the same
// org once it is older than RELAY_STALE_MS. Deleting the whole organisation
// wipes the folder with the rest of its storage.
//
// RELAY_MAX_BYTES is the honest wall that remains: the AI vendor itself caps
// a request at ~20MB, and inline PDF bytes ride base64-encoded (×4/3), so
// 12MB of PDF ≈ 16MB on the wire plus prompt — comfortably under the cap
// while big enough for any sane committee document. Above it the person is
// told to split the file (USER_ERRORS.pdfTooBigForAi), which at that size is
// the real fix. Keep the message's number in sync with this constant.
// ---------------------------------------------------------------------------

export const RELAY_MAX_BYTES = 12 * 1024 * 1024;

/** A leftover relay file older than this is abandoned and may be swept. */
export const RELAY_STALE_MS = 2 * 60 * 60 * 1000;

/** Same sanitising as record-upload.ts — the two must agree so a relayed
 *  file keeps the same on-disk name it would have had uploaded directly. */
export function relaySafeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(-80) || "document.pdf";
}

export function relayPathFor(
  orgId: number,
  name: string,
  now: number = Date.now(),
): string {
  return `${orgId}/relay/${now}-${relaySafeName(name)}`;
}

/** True only for a well-formed relay path belonging to THIS org. The server
 *  validates before downloading — RLS would block a foreign org anyway, but a
 *  malformed path must fail loudly here, not as a puzzling storage error. */
export function isRelayPathForOrg(path: string, orgId: number): boolean {
  return new RegExp(`^${orgId}/relay/\\d+-[^/]+$`).test(path);
}

/** The original (sanitised) filename, out of a relay path or object name. */
export function relayFileName(pathOrName: string): string {
  const base = pathOrName.split("/").pop() ?? "";
  const m = /^\d+-(.+)$/.exec(base);
  return m ? m[1] : base || "document.pdf";
}

/** When this relay object was created, from its name — null if unparseable. */
export function relayTimestamp(pathOrName: string): number | null {
  const base = pathOrName.split("/").pop() ?? "";
  const m = /^(\d+)-/.exec(base);
  if (!m) return null;
  const t = Number(m[1]);
  return Number.isFinite(t) && t > 0 ? t : null;
}

/** Which of these relay object NAMES (not full paths) are stale. Unparseable
 *  names count as stale — a file the namer did not write should not squat. */
export function staleRelayNames(
  names: string[],
  now: number = Date.now(),
): string[] {
  return names.filter((n) => {
    const t = relayTimestamp(n);
    return t === null || now - t > RELAY_STALE_MS;
  });
}

/** PDF magic bytes — a relay file claims to be a PDF; make it prove it before
 *  any quota is charged for reading it. */
export function looksLikePdf(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 5) return false;
  const head = new Uint8Array(bytes.slice(0, 5));
  return (
    head[0] === 0x25 && // %
    head[1] === 0x50 && // P
    head[2] === 0x44 && // D
    head[3] === 0x46 && // F
    head[4] === 0x2d // -
  );
}
