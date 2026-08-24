import { z } from "zod";

// ---------------------------------------------------------------------------
// Request contracts for the OFFICIAL-document routes (S0-1, 2026-08-25).
//
// These two bodies are deliberately tiny: they NAME a record, they never carry
// its contents. The server reads every printed fact back from the database
// under RLS. Kept in a pure module so the contract itself is unit-tested —
// a forged field arriving in the body must be provably unable to reach a PDF
// or a tax file.
// ---------------------------------------------------------------------------

/** POST /api/receipt-pdf — names ONE receipt of the caller's active org. */
export const receiptPdfBodySchema = z.object({
  receiptNo: z.string().min(1).max(40),
});

/** POST /api/einvois-xlsx — names ONE month (and which ≤100-doc file of it). */
export const einvoisXlsxBodySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  fileIndex: z.number().int().nonnegative().default(0),
});
