# MinitAI

**AI compliance and operating memory for Malaysian registered societies.**

MAIC Nexus Challenge 2026 · Track T5 — AI for Public Services & Smart Cities · Team **Ifelse**

---

## The problem

Malaysia has **90,224 active registered societies** (JPPM, July 2026). Every one of them files an annual
return with the Registrar of Societies, minutes its meetings, and issues numbered receipts for its
donations. There is no exemption threshold — it applies to all 90,224. Almost none can afford paid staff.

The work falls to volunteer secretaries and treasurers whose source records are handwritten notes that
mix Malay, Chinese and English on the same page.

eROSES made the *filing* digital. The *records behind it* are still on paper.

## What MinitAI does

Users photograph their records; MinitAI drafts the compliant output.

| From | MinitAI produces |
|---|---|
| Handwritten meeting notes | Bahasa Malaysia minutes, and a ready-to-paste eROSES annual-return pack |
| A paper donation ledger | A donation register with sequentially numbered, gap-free receipts, and cash-custody tracking |
| The organisation's constitution | Answers with the governing clause cited — or a refusal when no clause applies |

**One design law: effort flows from AI to human, never the reverse.** Every screen is a one-tap
confirmation of something the AI already proposed, never a blank form.

## The architecture claim worth judging

A misread word in a meeting note is an embarrassment. A misread digit in a receipt is a legal and
financial problem. So the two are separated in code:

```
photo/PDF ──► provider abstraction ──► vision model ──► structured, sourced fields
                (src/lib/ai/provider.ts)                          │
                                                                  ▼
                                              ┌───────────────────────────────────┐
                                              │  deterministic money layer         │
                                              │  receipt numbering · register      │
                                              │  totals · cash custody             │
                                              │  NO LANGUAGE MODEL MAY ENTER HERE  │
                                              └───────────────────────────────────┘
```

Three rules govern every AI call:

1. **The AI never invents.** A field marked *missing* is structurally incapable of carrying a value — a
   type constraint in the extraction contract, not a prompt instruction. Every field carries the region
   of the source document it came from and a confidence rating: `confirmed` / `check` / `missing`.
   Our evaluation counts invented values as a separate metric that must be zero.
2. **No language model performs financial arithmetic.** Receipt numbering, register totals and
   cash-custody state are deterministic TypeScript covered by **1,398 passing unit tests**. The model
   extracts quantities; code computes money.
3. **A named human confirms every output** before any official document is generated, and each document
   carries an audit line recording who confirmed it and when. Draft outputs are watermarked.

## Per-task model routing

All model calls are server-side only, behind a single provider abstraction selected by environment
variables, so a vendor can be replaced without touching feature code. Four vendors are implemented;
two carry live traffic.

| Task | Model | Why |
|---|---|---|
| Read photographed documents, read long constitutions | Google Gemini (`gemini-3.5-flash-lite`) | Benchmarked winner on our own pipeline |
| Draft documents | the same Gemini model | Same document context |
| Classify an upload | OpenAI (`gpt-5-nano`) | Trivial decision, cheapest capable model |
| Assistant conversation turns | OpenAI (`gpt-5.6-luna`) | Conversation, not document reading |
| All money arithmetic | **no model — TypeScript** | Tested, repeatable, auditable |

This routing was **measured, not assumed.** We benchmarked four vision models (two Gemini, two OpenAI)
on real photographed documents through the real pipeline, scoring extracted completeness, latency
against production timeouts, and cost per page. Two candidates could not finish a page inside our
45-second production limit; one cost roughly seven times more and returned fewer extracted items.
Benchmark outputs and cost ledgers are retained in the repository.

Model access is on **paid tiers whose terms do not train on submitted content** — a PDPA requirement,
not a preference.

## Privacy, enforced in code

- Document contents and donor personal data never reach application logs.
- The model is never given a donor's full name or telephone number.
- Personal data is masked by default when printing, sharing or screenshotting.
- Every query and stored file is scoped per organisation by Postgres row-level security.
- Deleting an organisation erases both its rows and its stored files.
- Receipts never imply tax-deductible status unless approved s.44(6) status is explicitly configured.

Every ID number and personal name in this repository is fabricated test data.

## Stack

Next.js (TypeScript, React) on Vercel · Supabase Postgres with row-level security · Google Gemini and
OpenAI behind one provider interface · server-side PDF generation for minutes, receipts, financial
statements, AGM packs and activity reports · Capacitor shell for Android and iOS.

## Run it

```bash
npm install
cp .env.example .env.local     # fill in your own keys
npm run dev
```

```bash
npm test                        # unit tests
```

## Status, stated plainly

The product is deployed and in first use with real organisations. Four things are deliberately **not**
claimed:

- **Handwriting accuracy is not yet measured.** Our published figure — 93.6% of 125 fields, measured
  29 August 2026 — was measured on *typeset* pages. It measures reading print, not the handwritten
  mixed-language notes the product is for. A measured handwriting figure will be published before
  judging, whatever it turns out to be.
- **The system does not yet reconcile a financial report.** Testing on a real handwritten treasurer's
  report showed it reads every figure correctly but does not yet check that opening balance plus income
  minus expenditure equals the stated closing balance. That check is deterministic and is next.
- **LHDN e-Invois support is behind a flag and not offered.**
- **The gross margin is modelled, not invoiced.** We publish the formula and its variables so the
  number can be checked rather than believed.

We would rather show a judge a smaller verified number than a larger unverifiable one.

## AI use in building this

Developed with AI pair-programming assistance (Anthropic Claude) under human direction and review. The
team defines the specification and acceptance criteria, approves each change, and tests every feature
manually. The full AI usage disclosure is part of our competition submission.

## Licence

Copyright © 2026 Khor Jia Yi and Tan Shi Hui (Team Ifelse). All rights reserved.
Published for evaluation only — see [LICENSE](LICENSE). Visible is not the same as free to reuse.
