import { describe, expect, it } from "vitest";
import { translatePlanAdminError } from "./plan-errors";

// 116 §3: J pressed "Change plan" on org 483 and was told "The call failed —
// try again". Retrying could never have worked: admin_set_org_plan writes
// orgs.monthly_free_quota, which the privileged-column trigger locks, and the
// function never took the escape hatch. Migration 44 fixes the function; this
// keeps the MESSAGE honest if the lock ever refuses again.
describe("translatePlanAdminError", () => {
  it("names the privileged-column lock instead of saying 'try again'", () => {
    expect(
      translatePlanAdminError(
        "orgs.monthly_free_quota is not user-editable: an organisation must not be able to raise its own AI quota.",
      ),
    ).toEqual({ ok: false, reason: "db_locked" });
  });

  it("still tells a missing migration apart from a missing org", () => {
    expect(translatePlanAdminError("could not find function admin_set_org_plan")).toEqual({
      ok: false,
      reason: "db_behind",
    });
    expect(translatePlanAdminError("no such organisation")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(translatePlanAdminError("Not a platform admin")).toEqual({
      ok: false,
      reason: "not_admin",
    });
  });

  it("falls back to the generic reason for anything unrecognised", () => {
    expect(translatePlanAdminError("connection reset")).toEqual({ ok: false, reason: "db" });
  });
});
