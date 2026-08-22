import "server-only";

import { getSupabaseServer } from "@/db/supabase-server";
import { isConfirmedClauseArray, searchClauses, sortClauses } from "@/lib/constitution";
import {
  annualReturnDeadline,
  upcomingEinvoisDeadlines,
  DEADLINE_LABELS,
  sortDeadlines,
} from "@/lib/deadlines";
import { checkToolArgs, toolArgError, type ToolSpec } from "./tool-core";

// ---------------------------------------------------------------------------
// WHAT THE ASSISTANT CAN LOOK UP.
//
// docs/助手重做-设计.md §5 step 3: five tools beyond cari_minit. This file is
// all five, plus the registry the runner dispatches through.
//
// 🔴 THREE RULES, AND THEY ARE NOT NEGOTIABLE.
//
// 1. USER-SCOPED CLIENT, ALWAYS (Hard Rule 5). Every query below goes through
//    getSupabaseServer(), so the signed-in person's RLS decides what is
//    visible. The `org_id` filters are belt AND braces — they make the intent
//    readable and they narrow the query — but RLS is the boundary. Swapping in
//    the service-role client anywhere here would let the assistant read every
//    society in the database, and nothing else in the system would notice.
//
// 2. NO TOOL COMPUTES MONEY (Hard Rule 2). Totals are summed by TypeScript from
//    rows the database returned. The model is never asked to add anything up,
//    and never sees a number it is expected to arrive at itself.
//
// 3. DONOR NAMES STAY MASKED (Hard Rule 5). `donor_masked` is selected;
//    `donor_name` and `donor_phone` are not, anywhere in this file. A model
//    that never receives a full donor name cannot repeat one — which is a
//    stronger guarantee than telling it not to.
//
// A NOTE ON THE DESCRIPTIONS. They are written for the MODEL to choose by, and
// they are the highest-leverage strings in the feature. "Search donations"
// tells a model nothing about when to reach for it. Saying what QUESTION the
// tool answers, in the words a treasurer would use, is what makes the
// difference between an assistant that looks things up and one that guesses.
// ---------------------------------------------------------------------------

const MONTH_RE = /^\d{4}-\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** How many rows any one tool may hand back. */
const MAX_ROWS = 50;

export type ToolContext = {
  orgId: number;
  /** Today in Malaysia, so "this year" means the same thing everywhere. */
  todayIso: string;
};

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<unknown>;

// ===========================================================================
// 1. Money received
// ===========================================================================

const dermaSpec: ToolSpec = {
  name: "cari_derma",
  description:
    "Money this society RECEIVED. Use this for any question about donations or " +
    "collections: how much was collected in a month or between two dates, how " +
    "many donations there were, how much is still cash in hand, whether a month " +
    "has donations without receipts. Returns the society's own recorded rows " +
    "with the totals already worked out. Donor names are masked for privacy.",
  parameters: {
    month: {
      type: "string",
      description: "One month, as YYYY-MM. Use this OR from/to, not both.",
    },
    from: { type: "string", description: "Start date, YYYY-MM-DD (inclusive)." },
    to: { type: "string", description: "End date, YYYY-MM-DD (inclusive)." },
  },
};

const dermaHandler: ToolHandler = async (args, ctx) => {
  const month = typeof args.month === "string" ? args.month : "";
  const from = typeof args.from === "string" ? args.from : "";
  const to = typeof args.to === "string" ? args.to : "";

  let start = "";
  let end = "";
  if (MONTH_RE.test(month)) {
    start = `${month}-01`;
    // Last day of the month, without a date library and without off-by-one:
    // day 0 of the NEXT month is the last day of this one.
    const [y, m] = month.split("-").map(Number);
    end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  } else if (DAY_RE.test(from) || DAY_RE.test(to)) {
    start = DAY_RE.test(from) ? from : "";
    end = DAY_RE.test(to) ? to : "";
  } else {
    return {
      error:
        "Give either month as YYYY-MM (e.g. 2026-07), or from/to as YYYY-MM-DD. " +
        "Do not guess a period the user did not name — ask them which month.",
    };
  }

  const supabase = await getSupabaseServer();
  let query = supabase
    .from("donations")
    // donor_name and donor_phone are deliberately NOT selected. See rule 3.
    .select("donor_masked, amount_cents, purpose, donated_at, custody_status, receipt_id", {
      count: "exact",
    })
    .eq("org_id", ctx.orgId);
  if (start) query = query.gte("donated_at", start);
  if (end) query = query.lte("donated_at", end);

  const { data, count, error } = await query
    .order("donated_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) return { error: "Could not read the donation records." };
  const rows = data ?? [];

  // Hard Rule 2: TypeScript adds this up, not the model — and never the model
  // from a partial page either, which is why the caveat below exists.
  const totalCents = rows.reduce((sum, r) => sum + Number(r.amount_cents ?? 0), 0);
  const unreceipted = rows.filter((r) => r.receipt_id === null).length;
  const inHandCents = rows
    .filter((r) => r.custody_status === "collected")
    .reduce((sum, r) => sum + Number(r.amount_cents ?? 0), 0);

  const total = count ?? rows.length;
  return {
    period: month || `${start || "…"} … ${end || "…"}`,
    donation_count: total,
    rows_returned: rows.length,
    // Said in the payload, not left for the model to work out: with more than
    // MAX_ROWS donations the totals below cover the rows returned, not the
    // period. A model that quietly reports a partial total as the month's
    // takings is the worst failure this whole feature can produce.
    totals_cover:
      total > rows.length
        ? `ONLY the ${rows.length} rows returned, NOT all ${total} donations in this period. Say so.`
        : "every donation in this period",
    total_cents: totalCents,
    still_cash_in_hand_cents: inHandCents,
    donations_without_a_receipt: unreceipted,
    rows: rows.map((r) => ({
      donor: r.donor_masked,
      amount_cents: r.amount_cents,
      purpose: r.purpose,
      date: r.donated_at,
      custody: r.custody_status,
      has_receipt: r.receipt_id !== null,
    })),
  };
};

// ===========================================================================
// 2. One receipt
// ===========================================================================

const resitSpec: ToolSpec = {
  name: "cari_resit",
  description:
    "One receipt, by its number. Use this when somebody names a receipt — " +
    "'is PSH-2026-0042 real', 'when was receipt 0042 issued', 'how much was on " +
    "it'. Also use it to list the receipts issued in a month. Donor names are " +
    "masked for privacy.",
  parameters: {
    receipt_no: {
      type: "string",
      description: "Full or partial receipt number, e.g. PSH-2026-0042 or 0042.",
    },
    month: { type: "string", description: "A month of issue, YYYY-MM." },
  },
};

const resitHandler: ToolHandler = async (args, ctx) => {
  const receiptNo = typeof args.receipt_no === "string" ? args.receipt_no.trim() : "";
  const month = typeof args.month === "string" ? args.month : "";
  if (!receiptNo && !MONTH_RE.test(month)) {
    return { error: "Give a receipt_no, or a month as YYYY-MM." };
  }

  const supabase = await getSupabaseServer();
  let query = supabase
    .from("receipts")
    .select(
      "receipt_no, issued_at, donation:donations!receipts_donation_id_fkey (donor_masked, amount_cents, purpose, donated_at, custody_status)",
      { count: "exact" },
    )
    .eq("org_id", ctx.orgId);
  if (receiptNo) query = query.ilike("receipt_no", `%${receiptNo}%`);
  if (MONTH_RE.test(month)) {
    const [y, m] = month.split("-").map(Number);
    query = query
      .gte("issued_at", `${month}-01`)
      .lte("issued_at", `${new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)}T23:59:59.999Z`);
  }

  const { data, count, error } = await query.order("id", { ascending: false }).limit(MAX_ROWS);
  if (error) return { error: "Could not read the receipt records." };

  const rows = (data ?? []) as unknown as {
    receipt_no: string;
    issued_at: string;
    donation: {
      donor_masked: string | null;
      amount_cents: number;
      purpose: string | null;
      donated_at: string | null;
      custody_status: string;
    } | null;
  }[];

  if (rows.length === 0) {
    return {
      found: 0,
      // The distinction matters more here than anywhere: "no such receipt" and
      // "that receipt exists but belongs to another society" are the same empty
      // result to us, and RLS makes sure we cannot tell them apart. Say the
      // honest thing.
      note:
        "No receipt in THIS society's records matches. That does not prove the " +
        "receipt is fake — it may belong to a different society, or predate Minit.",
    };
  }

  return {
    found: count ?? rows.length,
    rows_returned: rows.length,
    receipts: rows.map((r) => ({
      receipt_no: r.receipt_no,
      issued_at: r.issued_at,
      donor: r.donation?.donor_masked ?? null,
      amount_cents: r.donation?.amount_cents ?? null,
      purpose: r.donation?.purpose ?? null,
      donated_at: r.donation?.donated_at ?? null,
      custody: r.donation?.custody_status ?? null,
    })),
  };
};

// ===========================================================================
// 3. The constitution
// ===========================================================================

const fasalSpec: ToolSpec = {
  name: "cari_fasal",
  description:
    "The society's OWN constitution, clause by clause, exactly as written. Use " +
    "this for any question about the rules: how much notice a meeting needs, " +
    "who may sign cheques, what the quorum is, how office bearers are elected, " +
    "what it takes to change the constitution. Returns clause numbers and " +
    "verbatim text — quote it, never paraphrase it.",
  parameters: {
    query: {
      type: "string",
      description:
        "Words to find, or a clause number. Malay, Chinese or English — search " +
        "the language the constitution is written in.",
    },
  },
  required: ["query"],
};

const fasalHandler: ToolHandler = async (args, ctx) => {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return { error: "Give something to search for." };

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("constitutions")
    .select("clauses_json")
    .eq("org_id", ctx.orgId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      found: 0,
      note:
        "Minit has not read this society's constitution yet. Tell them to " +
        "photograph it on the Constitution page — do not answer from general " +
        "knowledge about Malaysian societies.",
    };
  }
  const parsed: unknown = data.clauses_json;
  if (!isConfirmedClauseArray(parsed)) {
    return { found: 0, note: "The stored constitution could not be read." };
  }

  const hits = searchClauses(sortClauses(parsed), query).slice(0, 8);
  if (hits.length === 0) {
    return {
      found: 0,
      clauses_in_total: parsed.length,
      // Two very different things, and the reader is often deciding whether
      // they are ALLOWED to do something.
      note:
        "No clause contains that. It may genuinely not be in this constitution, " +
        "or that page may not have been photographed yet. Say which you cannot tell.",
    };
  }
  return {
    found: hits.length,
    clauses: hits.map((c) => ({
      clause_no: c.clause_no,
      heading: c.heading,
      text: c.text,
      page: c.page_ref,
    })),
  };
};

// ===========================================================================
// 4. Who holds which position
// ===========================================================================

const ajkSpec: ToolSpec = {
  name: "senarai_ajk",
  description:
    "Who holds which position in this society — chairman, secretary, treasurer, " +
    "committee members. Use this for 'who is our treasurer', 'who can sign', " +
    "'when does the committee's term end'. Returns the recorded roster.",
  parameters: {
    position: {
      type: "string",
      description:
        "Optional. Part of a position name to filter by, e.g. Bendahari, " +
        "treasurer, 财政.",
    },
  },
};

const ajkHandler: ToolHandler = async (args, ctx) => {
  const position = typeof args.position === "string" ? args.position.trim() : "";
  const supabase = await getSupabaseServer();
  let query = supabase
    .from("committee_roster")
    // ic_masked is stored already masked; it is still left out. A committee
    // member's IC is never part of an answer to "who is our treasurer".
    .select("position, person_name, term_start, term_end")
    .eq("org_id", ctx.orgId);
  if (position) query = query.ilike("position", `%${position}%`);

  const { data, error } = await query.limit(MAX_ROWS);
  if (error) return { error: "Could not read the committee roster." };
  const rows = data ?? [];
  if (rows.length === 0) {
    return {
      found: 0,
      note:
        position
          ? "Nobody is recorded in that position. The roster may be incomplete rather than the position vacant."
          : "No committee roster has been recorded yet. It is filled in from confirmed minutes, or by hand on the Members page.",
    };
  }
  return {
    found: rows.length,
    committee: rows.map((r) => ({
      position: r.position,
      name: r.person_name,
      term_start: r.term_start,
      term_end: r.term_end,
    })),
  };
};

// ===========================================================================
// 5. What is due
// ===========================================================================

const tarikhSpec: ToolSpec = {
  name: "tarikh_akhir",
  description:
    "Compliance dates this society has to meet: when the annual return is due " +
    "to the Registry of Societies, when each month's e-Invois file has to reach " +
    "the tax office. Use this for 'when is our annual return due', 'have we " +
    "missed anything', 'what is coming up'. The dates are worked out from this " +
    "society's own confirmed AGM and the statutory month-ends.",
  parameters: {},
};

const tarikhHandler: ToolHandler = async (_args, ctx) => {
  const supabase = await getSupabaseServer();
  // The AGM the annual return hangs off. Latest confirmed one wins.
  const { data: agm } = await supabase
    .from("minutes_docs")
    .select("meeting_date, confirmed_by, confirmed_at")
    .eq("org_id", ctx.orgId)
    .eq("meeting_type", "agm")
    .eq("status", "confirmed")
    .order("meeting_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const deadlines = [...upcomingEinvoisDeadlines(ctx.todayIso, 3)];
  if (agm?.meeting_date) {
    deadlines.push(
      annualReturnDeadline(
        agm.meeting_date as string,
        (agm.confirmed_by as string | null) ?? "AJK",
        ((agm.confirmed_at as string | null) ?? (agm.meeting_date as string)).slice(0, 10),
      ),
    );
  }

  // Which of them somebody has already ticked off. A deadline reported as due
  // when the treasurer filed it in June is how an assistant teaches people to
  // ignore it.
  const { data: done } = await supabase
    .from("deadlines")
    .select("kind, due_date")
    .eq("org_id", ctx.orgId)
    .eq("status", "done")
    .limit(200);
  const doneKeys = new Set(
    (done ?? []).map((d) => `${String(d.kind)}:${String(d.due_date)}`),
  );

  const sorted = sortDeadlines(deadlines, ctx.todayIso);
  return {
    today: ctx.todayIso,
    annual_return_known: Boolean(agm?.meeting_date),
    note: agm?.meeting_date
      ? undefined
      : "No confirmed AGM is recorded, so the annual return date cannot be worked out. Say that rather than guessing one.",
    deadlines: sorted.map((d) => ({
      kind: d.kind,
      label: DEADLINE_LABELS[d.kind].en,
      due_date: d.dueDateIso,
      already_done: doneKeys.has(`${d.kind}:${d.dueDateIso}`),
      source: d.source,
    })),
  };
};

// ===========================================================================
// The registry
// ===========================================================================

type RegisteredTool = { spec: ToolSpec; handler: ToolHandler };

const REGISTRY: RegisteredTool[] = [
  { spec: dermaSpec, handler: dermaHandler },
  { spec: resitSpec, handler: resitHandler },
  { spec: fasalSpec, handler: fasalHandler },
  { spec: ajkSpec, handler: ajkHandler },
  { spec: tarikhSpec, handler: tarikhHandler },
];

/** Every tool the assistant may be handed, for the vendor declaration. */
export const ORG_TOOL_SPECS: readonly ToolSpec[] = REGISTRY.map((t) => t.spec);

/**
 * Run one tool the model asked for.
 *
 * An unknown name and bad arguments both come back as a RESULT, not a throw:
 * the model has to see the problem to correct itself on the next round, which
 * is the entire point of function calling. Throwing would end the conversation
 * with "something went wrong on Minit's side" over a typo the model could have
 * fixed by itself.
 */
export async function runOrgTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<unknown> {
  const entry = REGISTRY.find((t) => t.spec.name === name);
  if (!entry) {
    return toolArgError(name, `There is no tool called "${name}".`);
  }
  const checked = checkToolArgs(entry.spec, rawArgs);
  if (!checked.ok) return toolArgError(name, checked.error);
  try {
    return await entry.handler(checked.args, ctx);
  } catch {
    // PDPA: the question and the rows are user content and are never logged.
    return toolArgError(name, "That lookup failed. Do not guess the answer.");
  }
}
