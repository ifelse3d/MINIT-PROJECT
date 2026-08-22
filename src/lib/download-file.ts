import { joinUserError, USER_ERRORS } from "@/lib/user-errors";

// ---------------------------------------------------------------------------
// downloadFromApi — POST a JSON body to one of our generator routes, then hand
// the returned blob to the browser as a file download.
//
// WHY IT LIVES IN lib/ (2026-08-23): /money is being split into four pages
// (ledger → receipts → custody → e-Invois) and TWO of them download files —
// the receipt PDF and the month-end .xlsx. Left inside money-review.tsx this
// function would have been copy-pasted into both, and the Firefox/Safari
// revoke race below (the non-obvious part) would then have to be remembered
// and re-fixed in two places.
// ---------------------------------------------------------------------------

/** Fetches a generated file from an API route and triggers the browser download. */
export async function downloadFromApi(
  url: string,
  body: unknown,
  fallbackName: string,
): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? joinUserError(USER_ERRORS.downloadFailed));
  }
  const blob = await res.blob();
  const name =
    /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  // Revoking immediately races the download in Firefox/Safari.
  const href = a.href;
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
  return res;
}
