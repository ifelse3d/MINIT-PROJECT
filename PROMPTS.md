# PROMPTS.md — Copy-paste prompts for every Claude Code session

**How to use:** one phase = one FRESH Claude Code session. Open the terminal in the repo folder, run `claude`, then copy-paste the whole prompt block for that phase. Nothing needs editing. When Claude Code proposes its plan, read it, then reply "approved, proceed" (or ask questions first). At the end of each phase, run the app, click everything, then say "commit this phase".

---

## PHASE 0 — Scaffold (½ day)

```
Read CLAUDE.md and BUILD_PLAN.md fully, then propose your plan before coding.

Task: Create the Next.js App Router + TypeScript + Tailwind + shadcn/ui project per the locked stack and folder conventions in CLAUDE.md. Add:
1. Server-side Supabase client setup.
2. A .env.example listing ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (and .gitignore covering .env*).
3. One SQL migration file creating every table in BUILD_PLAN.md Section 1.
4. A /health page proving database connectivity.

Do NOT add auth, queues, a vector DB, or any WhatsApp/MyInvois API integration. Plan first; wait for my approval.
```

Accept when: `npm run dev` works, /health shows DB OK, migration applied in Supabase, first commit pushed.

---

## PHASE 1 — HERO WORKFLOW (1–2 days) ← deck screenshots come from here

```
Read CLAUDE.md and BUILD_PLAN.md fully, then propose your plan before coding.

Task: Implement the hero workflow for ONE hardcoded demo org:
1. /inbox: multi-file upload (jpg/png/pdf) to Supabase Storage with rows in `uploads`.
2. A server action processUpload(id) running pipeline steps 1–2 from BUILD_PLAN.md Section 2: classify the upload (kind + language, cheap model), then extract structured fields (vision model, Anthropic image/document content blocks) as strict zod-validated JSON where EVERY field carries source_ref and confidence per CLAUDE.md Hard Rule 1. Handle Malay and Chinese handwriting: output fields in BM/English but keep the original snippet.
3. An extraction review screen: each field with its confidence badge (confirmed=green, check=amber, missing=red) and source snippet, with confirm/edit per field.
4. generateMinutes(extractionId): draft compliant BM meeting minutes (pipeline step 3) into `minutes_docs`, with the audit line from Hard Rule 8.
5. A paste-pack panel (pipeline step 4): table of eROSES field name → value → source.

All prompts go in /src/prompts as exported template strings. Plan first; wait for my approval.
```

Accept when: a photo of a REAL handwritten mixed-language meeting note produces reviewable fields → compliant BM minutes → a paste-pack. **Screenshot every screen for the pitch deck.**

---

## PHASE 2 — Money module part 1: ledger → register → receipts (1–2 days)

```
Read CLAUDE.md and BUILD_PLAN.md fully, then propose your plan before coding.

Task:
1. Ledger-page upload → extraction into `donations` rows, with the same review-confirm screen pattern as Phase 1.
2. /src/lib/receipts.ts: deterministic, unit-tested (vitest) sequential gap-free receipt numbering per org (e.g. MIN-2026-0001). The LLM never numbers or sums anything (CLAUDE.md Hard Rule 2).
3. Receipt PDF generation on the org letterhead in the donor's language, with a QR placeholder.
4. A wa.me click-to-send link per receipt (v1 WhatsApp rule in CLAUDE.md — no Twilio, no unofficial libraries).
5. Duplicate warning: same donor + same day + same amount.

Plan first; wait for my approval.
```

---

## PHASE 3 — Money module part 2: custody + e-Invois pack (1 day)

```
Read CLAUDE.md and BUILD_PLAN.md fully, then propose your plan before coding.

Task:
1. /src/lib/custody.ts: unit-tested state machine collected → pending_remittance → settled, with `remittance_batches` (handover record listing exact receipt numbers; HQ confirmation flips status to settled).
2. HQ dashboard: per-branch donation totals and unremitted balances.
3. /src/lib/einvois.ts: month-end consolidation generating (a) a human-readable summary and (b) an .xlsx file matching the MyInvois Portal Batch Upload template — mirror the official template columns, max 100 documents per file, split automatically if more. Add a clearly marked [VERIFY against current LHDN template + guideline] comment block. Include the individual-pack path for RM10,000+ donations requiring donor identity fields.
4. Tax-deductibility warning behaviour per CLAUDE.md Hard Rule 3.

All arithmetic deterministic and unit-tested. Do NOT integrate the MyInvois API. Plan first; wait for my approval.
```

---

## PHASE 4 — AGM pack + bank-resolution extract (1 day)

```
Read CLAUDE.md and BUILD_PLAN.md fully, then propose your plan before coding.

Task: From `committee_roster` and org settings, generate the AGM Pack:
1. Notice of meeting — notice period read from the ingested constitution if present, otherwise from an org setting with a visible warning.
2. Agenda.
3. Printable attendance sheet (designed to be photographed back into /inbox later).
4. Proxy form.
All in BM, on the org letterhead, watermarked "DRAF — sila semak sebelum guna" until confirmed.
5. Bank-resolution extract: one-click certified minutes extract of signatory changes, generated from a confirmed minutes_doc.

Plan first; wait for my approval.
```

---

## PHASE 5 — Constitution Q&A + compliance calendar (1 day)

```
Read CLAUDE.md and BUILD_PLAN.md fully, then propose your plan before coding.

Task:
1. Constitution upload → clauses_json extraction (clause_no, heading, text, page_ref).
2. Q&A box: keyword-filter clauses first, then answer WITH cited clause numbers; refuse politely if no clause supports an answer (never give legal advice — "here is what your constitution says"). Cache answers in qa_log.
3. Compliance calendar: auto-create an annual_return_60d deadline when an AGM minutes_doc is confirmed (due = meeting_date + 60 days); recurring einvois_monthend deadline; /calendar page with status badges.
4. Reminders v1 = on-screen + generated WhatsApp text the user copies manually (no Twilio).

Plan first; wait for my approval.
```

---

## PHASE 6 — Eval harness (1 day) ← produces the deck's accuracy number

```
Read CLAUDE.md and BUILD_PLAN.md fully, then propose your plan before coding.

Task: Create /eval:
1. A folder of golden cases: each = input photo + expected extraction JSON.
2. `npm run eval`: runs the extraction pipeline over all cases, prints per-field-type accuracy and a failure list, and saves a timestamped report to /eval/reports.
Start with 10 placeholder cases wired end-to-end; the team will replace them with real ones.

Plan first; wait for my approval.
```

Team task (NOT Claude Code): replace placeholders with golden cases built from the founder's REAL past government-accepted filings. Record the headline: "X% of fields extracted correctly across N real filings."

---

## PHASE 7 — Multi-org, auth, PDPA, deploy (1–2 days)

```
Read CLAUDE.md and BUILD_PLAN.md fully, then propose your plan before coding.

Task:
1. Supabase email/password auth.
2. Row-level security by org_id INCLUDING the parent/branch tree: HQ roles see descendant orgs; branch roles see only their org; auditor_readonly sees assigned orgs across the portfolio.
3. Settings → "Delete organisation": removes all rows AND storage objects, irreversible, with a confirm dialog (CLAUDE.md Hard Rule 5).
4. Verify no document contents, donor names or ICs appear in any logs; donor names masked by default in list views.
5. Prepare for Vercel deploy: env vars documented, `npm run build` clean.
6. Keep a seeded "Demo Mode" org with anonymised sample documents.

Plan first; wait for my approval.
```

Then deploy to Vercel → that URL becomes the competition **artifact link** (repo stays private).

---

## PHASE 7.5a — AI usage meter + credits (½–1 day) ← build BEFORE 7.5b

```
Read CLAUDE.md and BUILD_PLAN.md fully, then propose your plan before coding.

Task: meter every AI call per org, block when over quota, manual credit top-up. No payment integration.

1. New migration: table `ai_usage` (id, org_id, action text, created_at) with RLS by org_id like other tables. Add to `orgs`: `monthly_free_quota int not null default 100`, `extra_credits int not null default 0`.
2. New `src/lib/ai/usage.ts` (pure TypeScript, deterministic — CLAUDE.md Hard Rule 2 spirit):
   - `getUsage(orgId)` → { usedThisMonth, quota, extraCredits, remaining, blocked } (calendar month, Asia/Kuala_Lumpur).
   - `checkAndRecordUsage(orgId, action)` → records one row and returns ok, OR throws a typed `QuotaExceededError` WITHOUT calling the AI. Consuming order: free quota first, then extra_credits (decrement).
   - Full vitest coverage: month boundary, quota exactly reached, credits consumed, zero-credit block.
3. Wrap EVERY server-side call site of `getVisionProvider()` with `checkAndRecordUsage` (search the codebase for all of them — extract-minutes, extract-events, ledger, constitution, etc.). On QuotaExceededError the API route returns 402 with a typed JSON body; never a crash.
4. UI:
   - Settings: usage card "Tindakan AI bulan ini / AI actions this month: X / quota (+Y kredit)" with a progress bar; when blocked, show bilingual message "Kuota AI habis — hubungi kami untuk tambah kredit / AI quota used up — contact us to add credit". Badge colours per CLAUDE.md rule 9.
   - Everywhere an AI action is triggered (upload/extract buttons), show remaining count subtly; if blocked, disable with the same message. NO payment flow, NO card forms.
5. Top-up is manual: HQ admin can edit `extra_credits` for its branch orgs in /orgs (one number input + save, admin-only — this is a one-tap admin action, not user data entry, so it passes the eROSES test).
6. Do NOT log document contents or donor data in ai_usage — action is a short enum string only (Hard Rule 5).

Plan first; wait for my approval.
```

---

## PHASE 7.5b — "Tanya Minit" AI search (1 day) ← requires 7.5a

```
Read CLAUDE.md and BUILD_PLAN.md fully, then propose your plan before coding.

Task: replace the home-page assistant teaser (src/app/assistant-teaser.tsx) with a working one-shot AI search. This is NOT a chatbot (Hard Rule 10): one question in → one answer out → done. No conversation history, no follow-ups.

1. Flow: user types a question → POST /api/ask → cheap intent classification (new prompt in /src/prompts/ask-intent.ts, zod-validated, retry once per Hard Rule 7) over EXACTLY these intents:
   [record_search, constitution_question, navigation_help, out_of_scope]
2. Per intent:
   - navigation_help: NO second AI call. Answer from a static route map in /src/lib/ask-routes.ts (page path + bilingual one-line description for every route in CLAUDE.md folder conventions). Return the description + a button to the page.
   - record_search: server queries Supabase (scoped by active org_id, RLS applies) across donations, receipts, minutes_docs, events_meetings, deadlines using filters the classifier extracted (date range, name, type). Donor names masked as in list views. Totals/counts computed in TypeScript, NEVER by the LLM (Hard Rule 2). Then ONE summarise call (new prompt /src/prompts/ask-summarise.ts) that receives only the already-filtered rows and writes a 2–3 sentence bilingual summary. If a fact isn't in the rows, it is not in the answer (Hard Rule 1). Button links to the right page with filters in the query string, e.g. /money?tab=register.
   - constitution_question: reuse the EXISTING constitution Q&A logic from Phase 5 (src/lib/constitution.ts) — do not duplicate it. Button → /constitution.
   - out_of_scope: polite bilingual refusal, zero extra AI calls, and it does NOT consume quota.
3. Metering: record_search costs 2 AI actions (classify + summarise), constitution_question costs its existing cost + 1, navigation_help costs 1 (classify only) — all through checkAndRecordUsage from Phase 7.5a. Show "≈ berapa tindakan AI / AI actions" next to the search button, and remaining balance under the box. When quota is blocked, the search box is disabled with the 7.5a message.
4. UI: replace the teaser card with a single input + button on the home page, results render inline below: summary text, source badges (confirmed/check per rule 9) where applicable, and one primary "Pergi ke halaman / Go to page" button. Bilingual labels via the existing Tri component.
5. Never log the question text with donor data conclusions; qa_log style storage only if already established in Phase 5, org-scoped (Hard Rule 5).
6. vitest: intent zod schemas, route map completeness (every /src/app route has an entry), cost calculation.

Plan first; wait for my approval.
```

---

## PHASE 7.6 — "Studio" redesign: v2 look becomes THE app (1–2 days)

```
Read CLAUDE.md and BUILD_PLAN.md fully, then propose your plan before coding.

Goal: the glass "Studio" design prototyped in /src/app/v2 + /src/components/v2 becomes the ONE real UI at "/". Every v1 feature survives; only the look changes. This is a RESTYLE, not a rewrite: page logic, server actions, API routes, lib code and tests must not change behaviour.

Before anything: git commit the current working state so we can roll back.

1. Root layout (src/app/layout.tsx) adopts the v2 shell for the whole app: Inter font, GradientBlobs background, floating glass Sidebar (tablet/desktop), TopSearch, and on phones the v2 MobileTopBar + menu drawer (the v1 bottom tab bar is REMOVED — user decision). Keep LanguageProvider + the BM/中/EN switcher and active-org display working exactly as now.
2. Navigation single source of truth stays /src/components/nav-items.ts (CLAUDE.md-listed routes). Update the v2 Sidebar + mobile drawer to consume it (hrefs WITHOUT the /v2 prefix) and add the missing destinations: inbox, filings, history, plus settings and orgs reachable from the sidebar footer / top bar (gear + org chip). NOTHING that is reachable today may become unreachable.
3. Tanya Minit moves into the floating AI button (v2 AILauncher, ✨) on EVERY page: right drawer on desktop, bottom sheet on phones. Port the REAL component logic from src/app/ask-minit.tsx (one-shot /api/ask, cost + remaining display, blocked state, Go-to-page button) into the v2 ai-panel shell. Delete the home-page search box afterwards. It stays one question → one answer — NOT a chat (CLAUDE.md Hard Rule 10); the panel must not accumulate history.
4. Restyle every route's internals with the v2 kit (glass cards, page-header, stat-card, activity list, motion): /, /inbox, /minutes, /filings, /money (all tabs: register, receipts, custody, e-invois), /agm-pack, /constitution, /calendar, /history, /orgs (incl. the AI credit form), /settings (incl. the AI usage meter card and the delete-organisation danger zone), /login, /health. The v2 prototype pages contain MOCK content — never copy their data; always re-plumb the real v1 server components/queries into the new markup. Confidence badges keep rule-9 colours (green/amber/red).
5. Delete /src/app/v2 and any now-unused v1-only chrome (bottom-nav, old site-header) once every route is migrated. No orphaned imports.
6. Constraints: no new npm dependencies; trilingual labels via <Tri> everywhere; big tap targets (elderly volunteers); generated documents untouched (they are BM, rule 9); no logic edits inside /src/lib, /src/prompts, /src/app/api beyond import paths.
7. Verify: npm run test and npm run build must pass; then list every route and what to click to confirm nothing was lost (a feature-parity checklist, route by route, including: photo upload → extraction still works, receipts still generate, quota blocking still shows, org switching + credit top-up still work).

Migrate route by route with small commits (shell first, then one page per commit) — never one giant commit.

Plan first; wait for my approval.
```

---

## PHASE 8 — Ops layer + narrow assistant (post-submission only, only if 1–7 are solid)

```
Read CLAUDE.md and BUILD_PLAN.md fully, then propose your plan before coding.

Task:
1. Events/meetings light CRUD with venue OR online_url (tap-to-join link shown in reminders).
2. RSVP capture page reachable from a WhatsApp link: name + phone + yes/no, NO login; committee sees the tally + a printable sign-in sheet.
3. Announcement drafting (cheap model): event details → BM/中文/EN WhatsApp text to copy.
4. The narrow assistant: text input → cheap-model intent router over EXACTLY these intents [record_donation, check_schedule, rsvp, event_info, receipt_reissue, unremitted_balance, filing_status, constitution_question, handover_status, help] → execute → short confirmation. Out-of-scope input → polite refusal (CLAUDE.md Hard Rule 10). Every assistant action creates a normal reviewable record.

Plan first; wait for my approval.
```

---

## Fix-it prompts (use any time)

**When something breaks:**
```
Here is the full error, verbatim:
[PASTE THE ENTIRE ERROR HERE]
Fix this. Explain in plain English what was wrong and what you changed.
```

**When you don't understand a change:**
```
Explain what you changed and why, in plain English, for a beginner.
```

**When Claude Code suggests something forbidden:**
```
No. CLAUDE.md locks the stack — no vector DB, no Redis, no queues, no Twilio in v1, no unofficial WhatsApp libraries, no member-facing app. Follow the file.
```

**End of every phase:**
```
Run npm run build and npm run test. If both pass, commit everything with the message "phase N done". Then tell me exactly how to test this phase manually in the browser, step by step.
```
