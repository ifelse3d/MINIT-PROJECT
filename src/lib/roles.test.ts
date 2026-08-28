import { describe, expect, it } from "vitest";
import { can, isRole, permissionError, ROLES } from "./roles";

// B-4 (2026-08-25): the role→capability table J approved (建議①). These tests
// ARE the table — a change here should be a deliberate product decision.

describe("roles table (建議①, v1)", () => {
  it("hq_admin can do everything", () => {
    for (const cap of ["manage_org", "minutes_write", "money_write", "money_collect", "upload"] as const) {
      expect(can("hq_admin", cap)).toBe(true);
    }
  });

  it("secretary: minutes + upload, no money, no admin", () => {
    expect(can("secretary", "minutes_write")).toBe(true);
    expect(can("secretary", "upload")).toBe(true);
    expect(can("secretary", "money_write")).toBe(false);
    expect(can("secretary", "money_collect")).toBe(false);
    expect(can("secretary", "manage_org")).toBe(false);
  });

  it("treasurer: all of money + upload, no minutes, no admin", () => {
    expect(can("treasurer", "money_write")).toBe(true);
    expect(can("treasurer", "money_collect")).toBe(true);
    expect(can("treasurer", "upload")).toBe(true);
    expect(can("treasurer", "minutes_write")).toBe(false);
    expect(can("treasurer", "manage_org")).toBe(false);
  });

  it("collector: record donations + own hand-over ONLY (cannot issue receipts)", () => {
    expect(can("collector", "money_collect")).toBe(true);
    expect(can("collector", "upload")).toBe(true);
    // Issuing receipts is money_write — the W-3 smoke test's whole point.
    expect(can("collector", "money_write")).toBe(false);
    expect(can("collector", "minutes_write")).toBe(false);
    expect(can("collector", "manage_org")).toBe(false);
  });

  it("committee: read + upload only", () => {
    expect(can("committee", "upload")).toBe(true);
    expect(can("committee", "minutes_write")).toBe(false);
    expect(can("committee", "money_collect")).toBe(false);
  });

  it("auditor_readonly: nothing at all", () => {
    for (const cap of ["manage_org", "minutes_write", "money_write", "money_collect", "upload", "calendar_write"] as const) {
      expect(can("auditor_readonly", cap)).toBe(false);
    }
  });

  it("calendar: every role except the auditor may write", () => {
    for (const role of ["hq_admin", "secretary", "treasurer", "collector", "committee"] as const) {
      expect(can(role, "calendar_write")).toBe(true);
    }
    expect(can("auditor_readonly", "calendar_write")).toBe(false);
  });

  it("fails CLOSED on unknown roles, the empty string and null", () => {
    for (const cap of ["manage_org", "minutes_write", "money_write", "money_collect", "upload"] as const) {
      expect(can("superuser", cap)).toBe(false);
      expect(can("", cap)).toBe(false);
      expect(can(null, cap)).toBe(false);
      expect(can(undefined, cap)).toBe(false);
    }
  });

  it("isRole matches exactly the six database roles", () => {
    expect(ROLES).toHaveLength(6);
    for (const r of ROLES) expect(isRole(r)).toBe(true);
    expect(isRole("admin")).toBe(false);
  });

  it("every refusal names who CAN do it, in all three languages", () => {
    // B-2 (work order 51): the three-LINE joinUserError shape, so
    // useLocalizedError can show only the reader's language.
    for (const cap of ["manage_org", "minutes_write", "money_write", "money_collect", "upload"] as const) {
      const msg = permissionError(cap);
      expect(msg.split("\n")).toHaveLength(3);
    }
  });
});
