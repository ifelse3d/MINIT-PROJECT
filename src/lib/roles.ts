// ---------------------------------------------------------------------------
// ROLES → WHAT THEY MAY DO. One source of truth (B-4, 2026-08-25, 建議①).
//
// The database designed six roles on day one (members_roles.role); until
// today the code only ever used hq_admin and a scattering of
// `role === "auditor_readonly"` refusals. This table is the v1 pragmatic
// version J approved:
//
//   hq_admin          everything
//   secretary         minutes + eROSES (and the shared records they rest on)
//   treasurer         all of money
//   collector         record donations + their own hand-overs, nothing else
//   committee         read + upload
//   auditor_readonly  read everything, write nothing
//
// The check belongs in the SERVER ACTION, not just in a hidden button — the
// same principle as countUnreviewed and the sample guard. Per-role RLS
// deepening is explicitly post-competition (work order 24 §1); RLS today
// proves MEMBERSHIP, this table constrains what a member may write.
//
// Pure data + pure functions, unit-tested. Fail-closed: an unknown role can
// read and do nothing else.
// ---------------------------------------------------------------------------

export const ROLES = [
  "hq_admin",
  "committee",
  "secretary",
  "treasurer",
  "collector",
  "auditor_readonly",
] as const;
export type Role = (typeof ROLES)[number];

export function isRole(v: string | null | undefined): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

export type Capability =
  /** Org administration: members & invites, org settings, renaming, org type,
   *  the e-Invois switch, deleting the organisation. */
  | "manage_org"
  /** Confirm & save minutes, roster, glossary, calendar/deadline records —
   *  the secretary's desk. */
  | "minutes_write"
  /** Money: issue receipts, edit the register, HQ-confirm hand-overs,
   *  the e-Invois pack. */
  | "money_write"
  /** Record donations and hand over ONE'S OWN collected cash — the
   *  collector's slice of money (treasurer/hq_admin have it implicitly). */
  | "money_collect"
  /** Send a page to the AI to be read (spends the org's quota). */
  | "upload"
  /** Add/remove shared calendar events and tick deadlines done. Not in 建議①'s
   *  table; v1 call: coordinating activities is committee work, so every role
   *  EXCEPT the read-only auditor may write the calendar. */
  | "calendar_write";

const CAPS: Record<Role, ReadonlySet<Capability>> = {
  hq_admin: new Set([
    "manage_org",
    "minutes_write",
    "money_write",
    "money_collect",
    "upload",
    "calendar_write",
  ]),
  secretary: new Set(["minutes_write", "upload", "calendar_write"]),
  treasurer: new Set(["money_write", "money_collect", "upload", "calendar_write"]),
  collector: new Set(["money_collect", "upload", "calendar_write"]),
  committee: new Set(["upload", "calendar_write"]),
  auditor_readonly: new Set(),
};

/** May this role do this? Unknown roles (including the empty string
 *  roleForOrg() returns when no membership row was found) can do nothing. */
export function can(role: string | null | undefined, cap: Capability): boolean {
  if (!isRole(role)) return false;
  return CAPS[role].has(cap);
}

/** The standard trilingual refusal, naming who CAN do it — a refusal that
 *  does not say who to ask is a dead end (STATE §6, 8/19 principle). */
export function permissionError(cap: Capability): string {
  const who: Record<Capability, { bm: string; zh: string; en: string }> = {
    manage_org: {
      bm: "pentadbir (hq_admin)",
      zh: "管理员",
      en: "an administrator",
    },
    minutes_write: {
      bm: "setiausaha atau pentadbir",
      zh: "秘书或管理员",
      en: "the secretary or an administrator",
    },
    money_write: {
      bm: "bendahari atau pentadbir",
      zh: "财政或管理员",
      en: "the treasurer or an administrator",
    },
    money_collect: {
      bm: "pemungut, bendahari atau pentadbir",
      zh: "收款人、财政或管理员",
      en: "a collector, the treasurer or an administrator",
    },
    upload: {
      bm: "ahli dengan peranan menulis",
      zh: "有操作权限的成员",
      en: "a member with a writing role",
    },
    calendar_write: {
      bm: "mana-mana ahli kecuali juruaudit",
      zh: "除审计外的任何成员",
      en: "any member except the auditor",
    },
  };
  const w = who[cap];
  return `Peranan anda tidak boleh membuat tindakan ini — minta ${w.bm} / 您的角色不能做这个操作，请找${w.zh} / Your role cannot do this — ask ${w.en}`;
}
