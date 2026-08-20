# BUILD_PLAN.md — Minit (companion to CLAUDE.md)

This file lives in the repo root next to `CLAUDE.md` and `PROMPTS.md`. Claude Code should read `CLAUDE.md` first, then this file. Humans: run the phases IN ORDER, one fresh Claude Code session per phase, using the exact prompts in `PROMPTS.md`.

## SECTION 1 — Data model (Supabase tables; create in Phase 0)

- `orgs` (id, parent_org_id nullable, name, letterhead_storage_path, languages text[], tax_exempt_status [none|s44_6|pure_religious], created_at)
- `members_roles` (id, org_id, user_id nullable pre-auth, name, role [hq_admin|committee|secretary|treasurer|collector|auditor_readonly], phone)
- `uploads` (id, org_id, filename, storage_path, kind [meeting_notes|ledger_page|constitution|attendance_sheet|expense|other], language_detected, status [pending|processing|done|failed], uploaded_at)
- `extractions` (id, upload_id, org_id, payload_json, model_used, created_at) — raw validated JSON with per-field source_ref + confidence
- `minutes_docs` (id, org_id, upload_id, meeting_type [agm|egm|committee], meeting_date, draft_md, final_md, status [draft|confirmed], confirmed_by, confirmed_at)
- `paste_packs` (id, minutes_doc_id, fields_json) — eROSES field name → value → source_ref
- `committee_roster` (id, org_id, position, person_name, ic_masked, term_start, term_end, source_extraction_id) — the "memory"
- `donations` (id, org_id, branch_org_id, donor_name, donor_phone, donor_masked, amount_cents, currency, purpose, donated_at, collector_member_id, receipt_id, custody_status [collected|pending_remittance|settled], source_upload_id, source_ref)
- `receipts` (id, org_id, receipt_no UNIQUE per org sequential, donation_id, pdf_storage_path, language, delivered_via [whatsapp_link|email|print|none], issued_at)
- `remittance_batches` (id, org_id, branch_org_id, collector_member_id, receipt_ids int[], total_cents, handed_over_at, confirmed_by_hq, status)
- `einvois_packs` (id, org_id, month, consolidated_json, xlsx_storage_path, generated_at) — .xlsx matching the MyInvois Batch Upload template
- `expenses` (id, org_id, description, amount_cents, category, spent_at, source_upload_id, source_ref)
- `constitutions` (id, org_id, upload_id, clauses_json [clause_no, heading, text, page_ref])
- `qa_log` (id, org_id, question, answer, cited_clause_ids, created_at) — cache; never log beyond Q&A text
- `events_meetings` (id, org_id, title, starts_at, venue_text nullable, online_url nullable, kind [agm|committee|activity|class])
- `reminders` (id, event_id, offset [7d|1d|2h], channel [wa_link|email], sent_at nullable)
- `rsvps` (id, event_id, person_name, phone, response [yes|no|maybe], via)
- `deadlines` (id, org_id, kind [annual_return_60d|einvois_monthend|custom], due_date, source, status)

## SECTION 2 — LLM pipeline (the judged "real AI")
1. **Classify** upload → kind + language (Haiku-class).
2. **Extract** per kind (Sonnet-class, image/document blocks): meeting notes → {meeting_type, date, attendees[], resolutions[], figures[], office_bearers[]} each field with source_ref + confidence; ledger page → donation rows; constitution → clauses[]. Strict JSON, zod-validated, retry-once.
3. **Draft** BM minutes from confirmed extraction (template in /src/prompts; org letterhead; audit line). Rule stated in the prompt: *anything not present in the extraction must not appear in the document.*
4. **Paste-pack**: map confirmed fields to eROSES Annual Return field names (mapping table maintained by the team in /src/prompts/eroses-map.ts — content, not code).
5. **Constitution Q&A**: question + clauses_json (filtered by keyword first) → answer with cited clause numbers; refuse if no clause supports an answer.
6. **Announcements** (Haiku): event details → BM/中文/EN WhatsApp text.

## SECTION 3 — Build phases (overview; exact prompts in PROMPTS.md)

| Phase | What | Time | Accept when |
|---|---|---|---|
| 0 | Scaffold: project, Supabase, migration, /health | ½ day | `npm run dev` works, /health OK, migration applied, first commit pushed |
| 1 | **HERO WORKFLOW**: photo of handwritten note → reviewable fields → BM minutes → eROSES paste-pack | 1–2 days | Real mixed-language note produces correct fields, minutes, paste-pack. **Screenshot everything — deck needs these by 11–12 July.** |
| 2 | Money 1: ledger photo → register → sequential receipts + wa.me links | 1–2 days | Real ledger page → confirmed donations → numbered receipt PDFs |
| 3 | Money 2: custody state machine + HQ dashboard + MyInvois Batch Upload .xlsx | 1 day | Handover flow works; month-end .xlsx generated; all math unit-tested |
| 4 | AGM pack (notice/agenda/attendance/proxy) + bank-resolution extract | 1 day | Full BM pack generated from roster; extract from a confirmed minutes_doc |
| 5 | Constitution Q&A + compliance calendar | 1 day | Clause-cited answers; refusal without support; 60-day deadline auto-created |
| 6 | **Eval harness** → the deck's accuracy number | 1 day | `npm run eval` prints per-field accuracy from 10+ golden cases |
| 7 | Auth, RLS by org tree, PDPA delete, Vercel deploy | 1–2 days | Live URL = the competition artifact link; Demo Mode org seeded |
| 7.5a | AI usage meter + credits (free quota, manual top-up, no payments) | ½–1 day | Every AI call metered per org; over-quota blocks with bilingual message |
| 7.5b | “Tanya Minit” one-shot AI search (record search / constitution / navigation) | 1 day | Summary + “Go to page” button; fixed intents only; costs shown; quota-gated |
| 7.6 | “Studio” redesign: v2 glass UI becomes the app; all v1 features kept | 1–2 days | Every route restyled; nav complete; Tanya Minit as floating button; /v2 deleted |
| 8 | Ops layer (events, RSVP page, announcements) + narrow 10-intent assistant | post-submission | Only if Phases 1–7 are solid |

## SECTION 4 — Beginner survival rules
1. One phase per session; approve the plan before code.
2. Paste FULL errors verbatim — never paraphrase an error.
3. Run + click everything, then commit per phase (`git add -A && git commit -m "phase N done"`).
4. If Claude Code proposes Redis / queues / vector DB / Twilio-now / member app / unofficial WhatsApp libraries: say no, point to CLAUDE.md.
5. API key only in `.env.local`; spend limit set in the Anthropic Console.
6. `npm run build` + `npm run test` must pass before ending a phase.

## SECTION 5 — Timeline against the competition
- **8–12 July:** Phase 0–1 → hero screenshots into the deck. Submit deck+summary by **14 July** regardless of build state.
- **15–31 July:** Phases 2–4 → first REAL filing + first real ledger through the tool; start temple-network onboarding.
- **1–31 Aug:** Phases 5–7 → accuracy number, hosted demo URL as artifact, demo video v1; festival-season donation volume accumulating.
- **Sept:** Phase 8 only if solid; otherwise polish, drill Q&A, convert an auditor to paid.
- **Oct/Nov:** freeze; refresh numbers only.

## Definition of champion-grade
Real handwritten documents in → compliant BM documents out with per-field sources → honest gaps → deterministic money → a published accuracy number → a live URL → government-accepted filings logged → a 20-branch network actually using it. Everything in this plan serves those eight things.
