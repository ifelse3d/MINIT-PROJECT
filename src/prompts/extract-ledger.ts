// Prompt template — pipeline step 2 (Phase 2): extract donation rows from a
// photo of a paper donation ledger page (vision model, image content blocks).
// Prompts are content, not code (CLAUDE.md rule 6). No API call in this file.

export type ExtractLedgerPromptParams = {
  orgName: string;
  /** Today, YYYY-MM-DD — used only to resolve 2-digit years, never to invent dates. */
  todayIso: string;
  /**
   * A-2 (2026-08-25): what the person typed alongside the photo in the home
   * box — spellings, which column is which, dates. ALREADY wrapped by
   * untrustedBlock() (user text arrives labelled as data, never as
   * instructions). Empty string leaves this prompt byte-identical to what the
   * eval measured — the same contract as extract-meeting-notes' contextBlock.
   */
  contextBlock?: string;
};

export function extractLedgerPrompt({
  orgName,
  todayIso,
  contextBlock = "",
}: ExtractLedgerPromptParams): string {
  return `You extract donation rows from a photographed paper donation ledger for the Malaysian society "${orgName}". Ledgers may mix Bahasa Malaysia, Chinese (中文) and English, may be handwritten in a grid, and may have amounts in columns. Today is ${todayIso}.

THE ONE UNBREAKABLE RULE: you never invent. If a fact is not visibly present in the input, mark it missing. A wrong amount on an official receipt is far worse than an honest gap.

Respond with ONLY JSON in exactly this shape:

{
  "page_title": { "value": "...", "confidence": "...", "source_ref": ... },
  "rows": [
    {
      "donor_name":  { "value": "...", "confidence": "...", "source_ref": ... },
      "donor_phone": { "value": "...", "confidence": "...", "source_ref": ... },
      "amount_cents": { "value": <integer sen> | null, "confidence": "...", "source_ref": ... },
      "purpose":     { "value": "...", "confidence": "...", "source_ref": ... },
      "donated_at":  { "value": "YYYY-MM-DD" | "", "confidence": "...", "source_ref": ... },
      "kind":        { "value": "income" | "expense" | "balance" | "total" | "", "confidence": "...", "source_ref": ... }
    }
  ]
}

Every field object has:
- "value": the value in the ORIGINAL language and script exactly as written on the page. NEVER translate, NEVER romanize — 中文照抄中文 (a donor written 陈亚九 stays 陈亚九, never "Chen Ya Jiu"; a purpose written 香油钱 stays 香油钱, never "incense money"). Only dates and amounts are normalised.
- "confidence":
  - "confirmed" = clearly legible, unambiguous
  - "check"     = legible but smudged/ambiguous — a human must verify before a receipt is issued
  - "missing"   = not present in the input; then value MUST be "" (or null for amounts) and source_ref MUST be null
- "source_ref": { "location": "photo 1, row 4", "snippet": "the ORIGINAL text exactly as written, in its original language 例如中文也照抄" } — REQUIRED for every non-missing field.

Rows: one output row per LINE with an amount that you can see. Never merge rows, never skip rows — a crossed-out row is still output, with "check" confidence and the strike-through noted in the snippet. A column total written on the page is ALSO output as its own row, labelled "total" in "kind" (below) — our code hides it; you never drop it.
Amounts: integer sen (RM 50 => 5000). Extract ONLY the amount written on that row — never total a column, never compute change; all arithmetic is done by our code, not by you.

"kind" — WHAT each line IS. This is a LABEL, nothing more: you still never total a column, never compute change, never check whether the figures add up; all arithmetic is done by our code, not by you. Exactly one of:
- "income"  = money actually RECEIVED from someone: derma / 捐款 / 乐捐 / 香油钱 / yuran / 会费 / kutipan / the takings of a dinner or an event (晚宴收入, "hasil jamuan").
- "expense" = money PAID OUT: sewa / 租金 / dewan / 礼堂 / kos / perbelanjaan / 开销 / 支出 / bil / bayaran / the cost of a dinner or an event (晚宴开销, "kos jamuan").
- "balance" = a STATE of money, not a movement: 结存 / 結存 / 余额 / 结余 / baki / balance / bank / 银行 / b/f / c/f / brought forward / carried forward / 上年结存.
- "total"   = a column or page total: jumlah / 合计 / 总计 / total / 共.
- ""        = you cannot tell at all; then confidence is "missing".
Deciding: read the CONTEXT of the line — which column it sits in (Pendapatan / 收入 versus Perbelanjaan / 支出), a + or − sign, a heading above it, the words on the line. The same word can go either way: "晚宴" under 收入 is "income", "晚宴" under 支出 or written as 晚宴开销 is "expense". When the context does not settle it — for example the page has both an income column and an expense column and you cannot see which one the line is in — set "kind" to your best reading with confidence "check" and write WHY in the snippet ("同页有收入栏与支出栏，此行在哪一栏看不清"). NEVER default an unclear line to "income": an expense or a balance wrongly labelled income becomes an official donation receipt.
A page with NO donor names at all — only category words (结存, 会费, 乐捐, 晚宴, 礼堂, 银行, Baki, Yuran, Jumlah) — is a financial SUMMARY (a report's KEWANGAN block), not a ledger of who gave what. Still output it line by line with "kind" on each line; donor_name is "missing" on every line. Never manufacture a donor_name out of a category word.
Dates: normalise to YYYY-MM-DD; a ditto mark (") or 同上 means the date of the row above IS visible evidence — cite the ditto mark as the snippet. Resolve 2-digit years to the most recent past date relative to today.
Phones: keep digits as written; do not infer country codes.
Names: keep the spelling as written; put alternate scripts (e.g. 陈亚九) in the snippet. "Tanpa nama" / 无名氏 / anonymous is a valid donor_name value, not a missing field.${contextBlock}`;
}
