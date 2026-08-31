import { describe, expect, it } from "vitest";
import {
  advanceJob,
  estimateJob,
  isLeased,
  isResumable,
  jobActionsDelta,
  jobPercent,
  jobReadActions,
  JOB_BATCH_PAGES,
  JOB_MAX_ATTEMPTS,
  needsQueue,
  nextBatchIndex,
  planJobBatches,
  type JobCounters,
} from "./jobs-core";

const job = (over: Partial<JobCounters> = {}): JobCounters => ({
  status: "queued",
  totalPages: 12,
  batchesDone: 0,
  totalBatches: 3,
  pagesDone: 0,
  attempts: 0,
  leasedUntil: null,
  ...over,
});

describe("planJobBatches", () => {
  it("cuts a long document into whole batches", () => {
    expect(planJobBatches(12)).toEqual([
      { from: 1, to: 4 },
      { from: 5, to: 8 },
      { from: 9, to: 12 },
    ]);
  });

  it("gives the last batch whatever is left over", () => {
    expect(planJobBatches(9)).toEqual([
      { from: 1, to: 4 },
      { from: 5, to: 8 },
      { from: 9, to: 9 },
    ]);
  });

  it("an uncountable document is ONE batch — the pre-queue behaviour", () => {
    expect(planJobBatches(0)).toEqual([{ from: 1, to: 1 }]);
    expect(planJobBatches(-3)).toEqual([{ from: 1, to: 1 }]);
  });
});

describe("needsQueue", () => {
  it("a document that fits one request never enters the queue", () => {
    for (let p = 1; p <= JOB_BATCH_PAGES; p++) expect(needsQueue(p)).toBe(false);
  });
  it("anything longer does", () => {
    expect(needsQueue(JOB_BATCH_PAGES + 1)).toBe(true);
    expect(needsQueue(30)).toBe(true);
  });
});

describe("pricing (D47, one formula for every queued read)", () => {
  it("keeps D47's pinned numbers", () => {
    expect(jobReadActions(4)).toBe(1);
    expect(jobReadActions(5)).toBe(1);
    expect(jobReadActions(8)).toBe(2);
    expect(jobReadActions(20)).toBe(4);
    expect(jobReadActions(21)).toBe(5);
    expect(jobReadActions(50)).toBe(34);
  });

  it("the deltas of every batch add up to the whole document's price", () => {
    for (const pages of [4, 5, 8, 9, 12, 20, 21, 33, 50]) {
      const batches = planJobBatches(pages);
      let done = 0;
      let charged = 0;
      for (const b of batches) {
        charged += jobActionsDelta(done, b.to);
        done = b.to;
      }
      expect(charged).toBe(jobReadActions(pages));
    }
  });

  it("a batch inside an already-paid block of five is free", () => {
    // Pages 1–4 bought the whole first block; page 5 rides it.
    expect(jobActionsDelta(4, 5)).toBe(0);
  });
});

describe("nextBatchIndex", () => {
  it("points at the batch after the ones already in", () => {
    expect(nextBatchIndex(job({ batchesDone: 1, status: "reading" }))).toBe(1);
  });
  it("is null once the document is finished or dead", () => {
    expect(nextBatchIndex(job({ status: "done", batchesDone: 3 }))).toBeNull();
    expect(nextBatchIndex(job({ status: "failed" }))).toBeNull();
    expect(nextBatchIndex(job({ batchesDone: 3, status: "reading" }))).toBeNull();
  });
});

describe("leases", () => {
  const now = Date.parse("2026-08-31T12:00:00Z");
  it("a live lease belongs to somebody else", () => {
    expect(isLeased(job({ leasedUntil: "2026-08-31T12:00:30Z" }), now)).toBe(true);
  });
  it("an expired or absent lease is free to take", () => {
    expect(isLeased(job({ leasedUntil: "2026-08-31T11:59:00Z" }), now)).toBe(false);
    expect(isLeased(job({ leasedUntil: null }), now)).toBe(false);
    expect(isLeased(job({ leasedUntil: "not a date" }), now)).toBe(false);
  });
});

describe("isResumable — what the browser may pick up after a reload", () => {
  it("half-read work is resumable", () => {
    expect(isResumable(job({ status: "reading", batchesDone: 1 }))).toBe(true);
    expect(isResumable(job({ status: "queued" }))).toBe(true);
  });
  it("finished and given-up jobs are not silently restarted", () => {
    expect(isResumable(job({ status: "done", batchesDone: 3 }))).toBe(false);
    expect(isResumable(job({ status: "failed", batchesDone: 1 }))).toBe(false);
  });
});

describe("advanceJob", () => {
  it("a good batch moves the counters and clears the lease", () => {
    const after = advanceJob(
      job({ status: "reading", batchesDone: 1, pagesDone: 4, attempts: 2, leasedUntil: "x" }),
      { from: 5, to: 8 },
      { kind: "ok" },
    );
    expect(after.batchesDone).toBe(2);
    expect(after.pagesDone).toBe(8);
    expect(after.attempts).toBe(0);
    expect(after.leasedUntil).toBeNull();
    expect(after.status).toBe("reading");
  });

  it("the last batch finishes the job", () => {
    const after = advanceJob(
      job({ status: "reading", batchesDone: 2, pagesDone: 8 }),
      { from: 9, to: 12 },
      { kind: "ok" },
    );
    expect(after.status).toBe("done");
    expect(after.batchesDone).toBe(3);
  });

  it("🔴 a failed batch never moves pagesDone — the retry must not pay twice", () => {
    const before = job({ status: "reading", batchesDone: 1, pagesDone: 4 });
    const after = advanceJob(before, { from: 5, to: 8 }, { kind: "retry" });
    expect(after.pagesDone).toBe(4);
    expect(after.batchesDone).toBe(1);
    expect(after.attempts).toBe(1);
    expect(after.status).toBe("reading");
  });

  it("gives up after JOB_MAX_ATTEMPTS", () => {
    let j = job({ status: "reading", attempts: JOB_MAX_ATTEMPTS - 1 });
    j = advanceJob(j, { from: 5, to: 8 }, { kind: "retry" });
    expect(j.attempts).toBe(JOB_MAX_ATTEMPTS);
    expect(j.status).toBe("failed");
  });

  it("a quota refusal stops immediately, without burning the attempts", () => {
    const after = advanceJob(job({ status: "reading" }), { from: 5, to: 8 }, { kind: "stop" });
    expect(after.status).toBe("failed");
    expect(after.attempts).toBe(1);
  });

  it("a batch out of order can never drag pagesDone backwards", () => {
    const after = advanceJob(
      job({ status: "reading", batchesDone: 2, pagesDone: 8 }),
      { from: 1, to: 4 },
      { kind: "ok" },
    );
    expect(after.pagesDone).toBe(8);
  });
});

describe("jobPercent", () => {
  it("reads as a percentage of batches", () => {
    expect(jobPercent({ batchesDone: 0, totalBatches: 4 })).toBe(0);
    expect(jobPercent({ batchesDone: 1, totalBatches: 4 })).toBe(25);
    expect(jobPercent({ batchesDone: 4, totalBatches: 4 })).toBe(100);
  });
  it("never divides by zero", () => {
    expect(jobPercent({ batchesDone: 0, totalBatches: 0 })).toBe(0);
  });
});

describe("estimateJob — what the person is told BEFORE it starts", () => {
  it("quotes pages, batches, actions and time", () => {
    const e = estimateJob(12, 15);
    expect(e.pages).toBe(12);
    expect(e.batches).toBe(3);
    expect(e.actions).toBe(3);
    expect(e.quotaPct).toBe(20);
    expect(e.seconds).toBe(Math.ceil(12 * 3.1));
  });

  it("🔴 never flatters a real deduction to 0%", () => {
    // 1 action out of a 500-action pool is 0.2% — it still shows 1%.
    expect(estimateJob(5, 500).quotaPct).toBe(1);
  });

  it("no pool known: the action count stands on its own", () => {
    expect(estimateJob(12, 0).quotaPct).toBeNull();
    expect(estimateJob(12, null).quotaPct).toBeNull();
  });
});
