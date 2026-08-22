# /eval — how Minit measures its own accuracy (Phase 6)

`npm run eval` runs the REAL extraction pipeline (same prompts, same AI
provider, same validation as the app) over every "golden case" in
`eval/cases/`, compares the AI's answers against the human-written correct
answers, and prints an accuracy table. A timestamped report lands in
`eval/reports/` (git-ignored — reports may quote document contents).

This produces the deck's headline number:
**"X% of fields extracted correctly across N cases."**

## Running it

1. Make sure `GEMINI_API_KEY` is in `.env.local` (project root).
2. `npm run eval`
3. Read the table in the terminal, or open the newest file in `eval/reports/`.

Each run makes real API calls (≈ RM0.10/photo on a paid tier; free on the
free tier). Cases run one at a time with a pause, so 10 cases take ~1 minute.

## Comparing MODELS — `npm run bench`

`npm run eval` measures ONE model. Use it for "did my prompt change help".

`npm run bench` runs this same suite once per model and prints one table:
accuracy, invented-field count, cost per run, and seconds per case.

```
npm run bench                 # the default line-up (scripts/bench-models.ts)
npm run bench --dry-run       # show the plan, call nothing
npm run bench gemini:gemini-3.5-flash-lite anthropic:claude-haiku-4-5
```

A model whose key is not in `.env.local` is skipped with a reason, not run and
failed. A model with no row in its vendor price table reports cost as `?`,
never as 0.

🔴 **Read the warning the table prints.** Every case below is a synthetic
PRINTED .png, and Minit'''s hard job is HANDWRITTEN mixed-language pages. Winning
this table proves a model reads printed text well and nothing more. Choosing the
extractor on it alone would repeat the 95.2% mistake.

## Anatomy of a golden case

```
eval/cases/case-01-minutes-agm/
  input.png    ← the photo the AI will read (or input.txt for `events` cases)
  case.json    ← the type + the CORRECT answers, written by a human
```

`case.json`:

```json
{
  "type": "minutes",            // minutes | ledger | constitution | events
  "description": "what this case tests",
  "orgName": "Pertubuhan Contoh Harmoni",
  "todayIso": "2026-07-01",     // fixed "today" so 2-digit years resolve the same every run
  "expected": { ... }           // plain values only — see existing cases for each type's shape
}
```

Rules for `expected`: a field the document does NOT contain is `""` (or
`null` for amounts) — that is how we catch the AI inventing things. Amounts
are integer **sen** (RM50 = 5000). Dates are `YYYY-MM-DD`.

## Replacing the placeholders with real cases (team task)

The 10 shipped cases are FICTIONAL wiring tests. The real accuracy number
must come from real past filings:

1. Photograph a real document (meeting notes / ledger page / constitution page).
2. Create a new folder `eval/cases/case-NN-name/`, drop the photo in as `input.jpg`.
3. Copy a `case.json` from an existing case of the same type; type the correct
   answers in by hand (this is the one place where human data entry is correct —
   you are writing the answer key, not using the product).
4. `npm run eval`.

**PDPA warning:** on the FREE Gemini tier, inputs may be used for training.
Real documents with real names only after a paid tier is configured.
Reports in `eval/reports/` are git-ignored for the same reason.

## Reading the report

- **Accuracy by field type** — dates/amounts/enums are exact-match; names and
  text tolerate case/punctuation differences (see `src/lib/eval-score.ts`).
- **Invented fields** — the AI produced a value where the answer key says the
  document has none. This is the worst failure class (Hard Rule 1) and the
  deck should be able to say **0**.
- **Failures** — every wrong field with expected vs got, for prompt tuning.

To compare models: set `GEMINI_MODEL` then run eval (PowerShell:
`$env:GEMINI_MODEL="gemini-3-flash"; npm run eval`) and compare reports.
