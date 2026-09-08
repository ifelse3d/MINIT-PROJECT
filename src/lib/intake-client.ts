"use client";

import type { IntakeKind } from "@/lib/intake-handoff";
import { prepareUploadForSend } from "@/lib/upload-relay-client";

// ---------------------------------------------------------------------------
// 130 §9 (90's other half): ONE reading through /api/intake, shared by the
// home page's box (ask-box.tsx) and the floating panel (ai-panel.tsx). The
// home page had this as a local function; the panel needed the same road for
// its paperclip, and two copies of "how a file reaches the reader" is how the
// next fix gets made once. Pure I/O — no React, no state: the caller owns
// what happens before (staging) and after (cards, hand-off).
//
// 🔴 The file's CONTENT never enters the chat model's context (90's iron
// rule): this posts to the intake pipeline, which classifies and extracts;
// the chat only ever learns "what kind it was, where to look".
// ---------------------------------------------------------------------------

export type IntakeOk = {
  kind: IntakeKind | "unknown";
  page?: string;
  fileName?: string;
  extraction?: unknown;
  error?: string;
  /** Where the original landed in the uploads bucket (28/8 evening). */
  storagePath?: string | null;
};

export type IntakeReadOutcome =
  | { outcome: "ok"; body: IntakeOk }
  | { outcome: "unknown" }
  | { outcome: "error"; message: string };

/** The reader's own words when the server's answer is unreadable / unusable —
 *  the caller passes its translator so this file stays hook-free. */
export type IntakeReadWords = (bm: string, zh: string, en: string) => string;

/** One reading through /api/intake. `forcedKind` skips the classifier. */
export async function readOneFileViaIntake(
  file: File,
  context: string,
  forcedKind: IntakeKind | undefined,
  t: IntakeReadWords,
): Promise<IntakeReadOutcome> {
  // 48 + A-4: shrink photos in the browser; relay a big PDF via Storage;
  // refuse honestly what neither road can carry.
  const prepared = await prepareUploadForSend(file);
  if (prepared.send === "refuse") return { outcome: "error", message: prepared.error };
  const form = new FormData();
  if (prepared.send === "file") form.append("file", prepared.file);
  else form.append("storagePath", prepared.storagePath);
  if (context.trim() !== "") form.append("context", context.trim());
  if (forcedKind) form.append("kind", forcedKind);
  const res = await fetch("/api/intake", { method: "POST", body: form });
  // P-1 (the "connection dropped" incident): the old code read ANY failure
  // here as a dropped connection — including the server being killed
  // mid-read, which is precisely when the quota may have been eaten with
  // nothing to show. If a response arrived but is unreadable, say THAT.
  let body: IntakeOk;
  try {
    body = (await res.json()) as IntakeOk;
  } catch {
    return {
      outcome: "error",
      message: t(
        "Pelayan tidak membalas semasa membaca fail itu. Ini bukan salah anda. Tunggu seminit, lihat baki kuota AI anda, kemudian cuba sekali lagi.",
        "读取文件的时候，伺服器没有回应。这不是您的问题。请等一分钟，看一下 AI 用量的余额，再试一次。",
        "The server did not reply while reading that file. This is not your fault. Wait a minute, check your remaining AI quota, then try again.",
      ),
    };
  }
  if (body.kind === "unknown") return { outcome: "unknown" };
  if (!res.ok || !body.page || !body.extraction) {
    return {
      outcome: "error",
      message:
        body.error ??
        t(
          "MinitAI tidak dapat membaca fail itu. Cuba sekali lagi.",
          "MinitAI 读不了这个文件。请再试一次。",
          "MinitAI could not read that file. Please try again.",
        ),
    };
  }
  return { outcome: "ok", body };
}
