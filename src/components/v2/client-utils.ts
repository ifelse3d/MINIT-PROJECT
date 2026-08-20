"use client";

// ---------------------------------------------------------------------------
// Client helpers shared by the v2 pages: download a file from a JSON API
// route (blob → save), and compress a picked photo to a preview data URL.
// Mirrors the proven patterns in the existing money/minutes pages.
// ---------------------------------------------------------------------------

/**
 * POST `body` as JSON to `url`. On success (a binary file response) it saves
 * the file using the server's Content-Disposition filename and returns the
 * Response (so callers can read headers like X-Einvois-File-Count).
 * On a non-OK response it throws an Error carrying the server's { error }.
 */
export async function downloadFromApi(
  url: string,
  body: unknown,
  fallbackName: string
): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Ralat pelayan (${res.status})`;
    try {
      const data = await res.clone().json();
      if (data?.error) message = data.error as string;
    } catch {
      /* not JSON — keep generic message */
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? fallbackName;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);

  return res;
}

/** Compress a picked image to a ≤1400px JPEG data URL for a lightweight preview. */
export function compressPhoto(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1400;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => resolve(null);
      img.src = reader.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/** Today's date as YYYY-MM-DD in the local calendar. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Copy text to the clipboard; resolves true on success. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
