import { describe, expect, it } from "vitest";
import {
  auditStatusFor,
  checkFinancialResolution,
  findCommitteeSpendingLimit,
  governanceFindings,
  isSettledStatus,
  type FinancialResolutionInput,
  type GovernanceInput,
} from "@/lib/einvois-governance";
import { INDIVIDUAL_EINVOICE_THRESHOLD_CENTS } from "@/lib/einvois";
import type { ConfirmedClause } from "@/lib/constitution";

function res(over: Partial<FinancialResolutionInput> = {}): FinancialResolutionInput {
  return {
    vendorName: "Syarikat Awan Sdn Bhd",
    approvedAmountCents: 350_000, // RM3,500.00
    purpose: "Pembaikan bumbung dewan",
    ...over,
  };
}

function input(over: Partial<GovernanceInput> = {}): GovernanceInput {
  return { resolution: res(), einvoisEnabled: true, ...over };
}

describe("auditStatusFor", () => {
  it("puts an ordinary approval in the consolidated pack", () => {
    expect(auditStatusFor(input())).toBe("consolidated_pack");
  });

  it("requires an individual e-invoice at the LHDN threshold", () => {
    expect(
      auditStatusFor(
        input({ resolution: res({ approvedAmountCents: INDIVIDUAL_EINVOICE_THRESHOLD_CENTS }) })
      )
    ).toBe("individual_required");
  });

  it("stays consolidated one sen below the threshold", () => {
    expect(
      auditStatusFor(
        input({
          resolution: res({ approvedAmountCents: INDIVIDUAL_EINVOICE_THRESHOLD_CENTS - 1 }),
        })
      )
    ).toBe("consolidated_pack");
  });

  // Hard Rule 1 — an unreadable amount must never be silently classified.
  it("returns unknown when the amount could not be read", () => {
    expect(auditStatusFor(input({ resolution: res({ approvedAmountCents: null }) }))).toBe(
      "unknown"
    );
  });

  it("treats in-kind and zero-value approvals as not applicable", () => {
    expect(auditStatusFor(input({ resolution: res({ inKind: true }) }))).toBe("not_applicable");
    expect(auditStatusFor(input({ resolution: res({ approvedAmountCents: 0 }) }))).toBe(
      "not_applicable"
    );
  });

  it("tracks nothing when the organisation has e-Invois switched off", () => {
    expect(auditStatusFor(input({ einvoisEnabled: false }))).toBe("not_applicable");
  });

  // Recorded facts outrank derived expectations.
  it("reports exported and submitted from the ledger, not from the amount", () => {
    const big = res({
      approvedAmountCents: INDIVIDUAL_EINVOICE_THRESHOLD_CENTS * 2,
      ledger: { exportedAtIso: "2026-08-30T02:00:00Z" },
    });
    expect(auditStatusFor(input({ resolution: big }))).toBe("exported");

    const done = res({
      ledger: { exportedAtIso: "2026-08-30T02:00:00Z", submittedAtIso: "2026-08-31T02:00:00Z" },
    });
    expect(auditStatusFor(input({ resolution: done }))).toBe("submitted");
  });

  // Rule 4 — nothing in v1 may claim the government replied.
  it("has no status asserting government validation", () => {
    const statuses = new Set(
      [
        auditStatusFor(input()),
        auditStatusFor(input({ resolution: res({ ledger: { submittedAtIso: "x" } }) })),
      ].map(String)
    );
    for (const s of statuses) {
      expect(s).not.toMatch(/valid/i);
      expect(s).not.toMatch(/accept/i);
    }
  });
});

describe("governanceFindings — the society's own constitution", () => {
  // CLAUDE.md rule 10: no invented national limit. No clause = no finding.
  it("produces NO approval-limit finding when the constitution says nothing", () => {
    const findings = governanceFindings(
      input({ resolution: res({ approvedAmountCents: 5_000_000 }) })
    );
    expect(findings.some((f) => f.code === "approval_limit_exceeded")).toBe(false);
  });

  it("flags an approval above the society's own ceiling, and cites the clause", () => {
    const findings = governanceFindings(
      input({
        resolution: res({ approvedAmountCents: 500_000 }), // RM5,000.00
        committeeApprovalLimitCents: 300_000, // RM3,000.00
        committeeApprovalClauseRef: "Fasal 12.3",
      })
    );
    const hit = findings.find((f) => f.code === "approval_limit_exceeded");
    expect(hit).toBeDefined();
    expect(hit!.basis?.en).toContain("Fasal 12.3");
    expect(hit!.message.en).toContain("RM5,000.00");
    expect(hit!.message.en).toContain("RM3,000.00");
  });

  it("does not flag an approval exactly at the ceiling", () => {
    const findings = governanceFindings(
      input({
        resolution: res({ approvedAmountCents: 300_000 }),
        committeeApprovalLimitCents: 300_000,
      })
    );
    expect(findings.some((f) => f.code === "approval_limit_exceeded")).toBe(false);
  });
});

describe("governanceFindings — LHDN threshold and gaps", () => {
  it("explains the individual-e-invoice threshold with its in-force date", () => {
    const findings = governanceFindings(
      input({ resolution: res({ approvedAmountCents: INDIVIDUAL_EINVOICE_THRESHOLD_CENTS }) })
    );
    const hit = findings.find((f) => f.code === "individual_einvoice_required");
    expect(hit).toBeDefined();
    expect(hit!.basis?.en).toContain("1 January 2026");
  });

  it("reports an unreadable amount instead of guessing one", () => {
    const findings = governanceFindings(input({ resolution: res({ approvedAmountCents: null }) }));
    expect(findings.some((f) => f.code === "amount_unreadable")).toBe(true);
  });

  it("reports a missing vendor name", () => {
    const findings = governanceFindings(input({ resolution: res({ vendorName: "   " }) }));
    expect(findings.some((f) => f.code === "vendor_missing")).toBe(true);
  });

  it("stays quiet about vendors and thresholds for in-kind approvals", () => {
    const findings = governanceFindings(
      input({
        resolution: res({
          inKind: true,
          vendorName: "",
          approvedAmountCents: INDIVIDUAL_EINVOICE_THRESHOLD_CENTS * 3,
        }),
      })
    );
    expect(findings.some((f) => f.code === "vendor_missing")).toBe(false);
    expect(findings.some((f) => f.code === "individual_einvoice_required")).toBe(false);
  });

  // Rule 10 — this module reports, it never rules.
  it("never emits a severity above 'check', and is trilingual throughout", () => {
    const findings = governanceFindings(
      input({
        resolution: res({ approvedAmountCents: 5_000_000, vendorName: "" }),
        committeeApprovalLimitCents: 100_000,
        committeeApprovalClauseRef: "Fasal 9",
      })
    );
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(["info", "check"]).toContain(f.severity);
      expect(f.message.bm.length).toBeGreaterThan(0);
      expect(f.message.zh.length).toBeGreaterThan(0);
      expect(f.message.en.length).toBeGreaterThan(0);
    }
  });
});

describe("checkFinancialResolution", () => {
  it("returns status and findings together", () => {
    const out = checkFinancialResolution(
      input({ resolution: res({ approvedAmountCents: INDIVIDUAL_EINVOICE_THRESHOLD_CENTS }) })
    );
    expect(out.status).toBe("individual_required");
    expect(out.findings.map((f) => f.code)).toContain("individual_einvoice_required");
  });
});

describe("isSettledStatus", () => {
  it("treats exported, submitted and not-applicable as settled", () => {
    expect(isSettledStatus("exported")).toBe(true);
    expect(isSettledStatus("submitted")).toBe(true);
    expect(isSettledStatus("not_applicable")).toBe(true);
    expect(isSettledStatus("unknown")).toBe(false);
    expect(isSettledStatus("consolidated_pack")).toBe(false);
    expect(isSettledStatus("individual_required")).toBe(false);
  });
});

describe("findCommitteeSpendingLimit", () => {
  function clause(over: Partial<ConfirmedClause>): ConfirmedClause {
    return { clause_no: "12.3", heading: "Kewangan", text: "", page_ref: "m/s 7", ...over };
  }

  it("reads a ceiling written in the society's own clause", () => {
    const found = findCommitteeSpendingLimit([
      clause({
        text: "Jawatankuasa boleh meluluskan perbelanjaan sehingga RM3,000.00 tanpa kelulusan mesyuarat agung.",
      }),
    ]);
    expect(found?.limitCents).toBe(300_000);
    expect(found?.clause.clause_no).toBe("12.3");
  });

  it("returns null when no clause mentions a ringgit ceiling", () => {
    expect(
      findCommitteeSpendingLimit([
        clause({ text: "Jawatankuasa hendaklah bermesyuarat sekurang-kurangnya empat kali setahun." }),
      ])
    ).toBeNull();
  });

  it("returns null on an empty constitution rather than assuming a default", () => {
    expect(findCommitteeSpendingLimit([])).toBeNull();
  });

  it("refuses an implausible ceiling instead of misleading the treasurer", () => {
    expect(
      findCommitteeSpendingLimit([
        clause({ text: "Yuran masuk ialah RM2.00 bagi setiap ahli perbelanjaan jawatankuasa." }),
      ])
    ).toBeNull();
  });
});
