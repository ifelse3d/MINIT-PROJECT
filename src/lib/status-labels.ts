// ---------------------------------------------------------------------------
// PLAIN-LANGUAGE LABELS FOR DATABASE ENUMS.
//
// WHY THIS FILE EXISTS (2026-07-28 audit)
// Several screens printed raw Postgres enum values straight at the user:
//
//   /inbox                → "done", "processing", "pending"
//   /minutes/history      → "confirmed"
//   /money/history        → "pending_remittance", "collected", "settled"
//   /orgs, /settings      → "hq_admin", "auditor_readonly", "treasurer"
//   /orgs empty state     → "ask an hq_admin to add you"
//
// Snake_case identifiers as user-facing text, in English only, for people in
// their 70s reading a Malay/Chinese interface. Worse, /money already had
// perfectly good trilingual custody wording in money-review.tsx that this page
// simply did not use.
//
// Everything user-visible that comes out of a DB enum goes through here, so a
// value can never appear as one thing on one screen and another on the next.
// Pure data: no JSX, no I/O.
// ---------------------------------------------------------------------------

export type TriLabel = { bm: string; zh: string; en: string };

/** `uploads.status` */
export const UPLOAD_STATUS_LABEL: Record<string, TriLabel> = {
  pending: { bm: "Menunggu dibaca", zh: "等待读取", en: "Waiting to be read" },
  processing: { bm: "AI sedang membaca", zh: "AI 正在读取", en: "The AI is reading it" },
  done: { bm: "Sudah dibaca", zh: "已读取", en: "Read" },
  failed: { bm: "Tidak dapat dibaca", zh: "读不出来", en: "Could not be read" },
};

/** `minutes_docs.status` */
export const MINUTES_STATUS_LABEL: Record<string, TriLabel> = {
  draft: { bm: "Draf — belum disahkan", zh: "草稿 —— 还没确认", en: "Draft — not confirmed" },
  confirmed: { bm: "Disahkan", zh: "已确认", en: "Confirmed" },
};

/**
 * `donations.custody_status` — kept word-for-word identical to CUSTODY_LABEL in
 * src/app/money/money-review.tsx so the register and the receipt history never
 * describe the same money differently.
 */
export const CUSTODY_STATUS_LABEL: Record<string, TriLabel> = {
  collected: { bm: "Dalam tangan pemungut", zh: "在收款人手上", en: "With collector" },
  pending_remittance: { bm: "Menunggu pengesahan HQ", zh: "等待总会确认", en: "Awaiting HQ" },
  settled: { bm: "Selesai", zh: "已完成", en: "Settled" },
};

/** `members_roles.role` — what the person can actually DO, not the enum name. */
export const ROLE_LABEL: Record<string, TriLabel> = {
  // 2026-07-29 — was "boleh buat semua / 可以做所有事 / can do everything".
  // That was never true and is now provably false: after
  // `20260728000000_lock_org_privileged_columns.sql`, an hq_admin CANNOT
  // change their own AI credits, free quota, tax-exempt status or parent org.
  // A role label should say what the person can actually do, so that someone
  // reading it knows whether to ask this person for help.
  hq_admin: {
    bm: "Pentadbir (urus ahli, buka cawangan, lihat & ubah semua rekod)",
    zh: "管理员（管成员、开分会、可看可改全部记录）",
    en: "Administrator (manage members, add branches, view & edit all records)",
  },
  secretary: {
    bm: "Setiausaha (minit & dokumen)",
    zh: "秘书（会议记录与文件）",
    en: "Secretary (minutes & documents)",
  },
  treasurer: {
    bm: "Bendahari (wang & resit)",
    zh: "财政（钱款与收据）",
    en: "Treasurer (money & receipts)",
  },
  collector: {
    bm: "Pemungut (kutip derma)",
    zh: "收款人（收捐款）",
    en: "Collector (collects donations)",
  },
  // B-2 (2026-08-25): invite codes made this role reachable for the first
  // time; until then it existed only in the DB check constraint.
  committee: {
    bm: "Ahli jawatankuasa (lihat & muat naik)",
    zh: "理事（可查看、可上传）",
    en: "Committee member (view & upload)",
  },
  auditor_readonly: {
    bm: "Juruaudit (lihat sahaja)",
    zh: "审计（只能查看）",
    en: "Auditor (view only)",
  },
};

/**
 * Look a label up, never crashing and never showing the raw identifier.
 * An unmapped value is far more likely to be a schema change than something the
 * user needs to read, so it degrades to a neutral dash.
 */
export function labelFor(
  table: Record<string, TriLabel>,
  value: string | null | undefined,
): TriLabel {
  if (!value) return { bm: "—", zh: "—", en: "—" };
  return (
    table[value] ?? {
      bm: "Tidak diketahui",
      zh: "不清楚",
      en: "Unknown",
    }
  );
}
