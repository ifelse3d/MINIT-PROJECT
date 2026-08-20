# Minit R1 Competition Deck — Final 10-Slide Content

**Deck-wide status treatment:** place `PROPOSED • FICTIONAL DATA` beside every slide title and the exact footer `Fictional competition demo — proposed workflow, not production` on every slide. Every reproduced interface frame must also carry `SYNTHETIC DEMO RECORD`. These labels are on-slide copy, not speaker-note caveats.

## Slide 1 — Minit: Human-Verified Community Request-to-Resolution

**On-slide copy**

- `PROPOSED • FICTIONAL DATA`
- A narrow civic-service handoff for Malaysian community organisations
- AI proposes. Named humans decide. The audit trail remembers.
- MAIC Nexus Challenge — T5: AI for Public Services & Smart Cities
- Footer: `Fictional competition demo — proposed workflow, not production`

**Visual / evidence instruction:** Use a clean request-to-resolution path with three labelled nodes only: `REQUEST`, `HUMAN-VERIFIED ACTION`, `TRACEABLE OUTCOME`. Do not use government, customer or partner logos.

**Speaker note:** Minit is an early-stage civic-operations MVP. R1 does not present a deployment; it presents one inspectable proposed workflow using fictional data. The beneficiary is a community member whose low-risk request must survive multilingual handoffs without granting AI decision authority.

**Claim IDs:** CLM-001, CLM-002, CLM-026.

## Slide 2 — The civic handoff we are testing

**On-slide copy**

- `PROPOSED PROBLEM HYPOTHESIS`
- Multilingual requests can lose context across volunteer handoffs.
- Acknowledgement, assignment and outcome need one reconstructable record.
- Scope: one non-emergency broken walkway light beside a fictional community hall.
- Excluded: emergencies, identity/contact collection, payments, official filings and real delivery.
- Footer: `Fictional competition demo — proposed workflow, not production`

**Visual / evidence instruction:** Show a three-column hypothesis diagram: `REQUEST ARRIVES` → `VOLUNTEER HANDOFFS` → `OUTCOME NEEDS CONFIRMATION`. Add `SYNTHETIC DEMO RECORD` to the fictional request card. Do not use prevalence, market-size, impact or adoption figures.

**Speaker note:** This slide states a problem to validate, not a measured claim. The competition artifact fixes one low-risk scenario so reviewers can inspect authority, language, failure and isolation boundaries without real people or production records.

**Claim IDs:** CLM-001, CLM-012, CLM-026, CLM-028.

## Slide 3 — One fictional request, end to end

**On-slide copy**

- `PROPOSED WORKFLOW • SYNTHETIC DEMO RECORD`
- `received` → `triage_proposed` → `awaiting_human_verification`
- `verified` → `assigned` → `in_progress`
- `resolution_proposed` → `resolved` → `closed_confirmed` or `reopened`
- Every command: idempotency key + expected version
- Locales: `ms` • `en` • `zh-Hans`
- Footer: `Fictional competition demo — proposed workflow, not production`

**Visual / evidence instruction:** Use a left-to-right state ribbon. Colour AI-created `triage_proposed` amber and all authoritative transitions dark blue. Mark the route screenshot `SYNTHETIC DEMO RECORD` and use only fictional actors.

**Speaker note:** The server, not the browser, enforces this path. AI can create the triage proposal only. A duplicate request or lost-response retry reuses its idempotency key; a stale expected version fails rather than overwriting a newer decision.

**Claim IDs:** CLM-001, CLM-010, CLM-011, CLM-012, CLM-016.

## Slide 4 — AI proposes. Humans decide.

**On-slide copy**

- `PROPOSED CONTROL • DETERMINISTIC FIXTURE MODE`
- AI proposal: category, urgency, location, missing information, summary
- Every field: `UNVERIFIED`
- Source and proposal stay side by side
- Fictional reviewer: urgency `high` → `normal`
- Reason + input version + proposal version + server timestamp retained
- Footer: `Fictional competition demo — proposed workflow, not production`

**Visual / evidence instruction:** Use the actual R1 verification screen if its tests pass. Left: generated/typeset fictional source. Right: proposal cards with amber `UNVERIFIED` labels and a visible before/after correction. Overlay `SYNTHETIC DEMO RECORD` and `Deterministic demo fixture — no live model call`.

**Speaker note:** The model output is useful because it structures an ambiguous request, but it is not authority. The named fictional reviewer compares the source, corrects urgency and approves an exact version. The client cannot supply reviewer identity or approval time.

**Claim IDs:** CLM-001, CLM-010, CLM-013, CLM-014.

## Slide 5 — Authority stays server-side

**On-slide copy**

- `PROPOSED SECURITY BOUNDARY • DEMO-ONLY`
- Session token is opaque; tenant and role resolve on the server
- No raw tenant chooser
- No automatic parent/HQ access to descendant case content
- Illegal transition: denied + safe security event
- Second session / unrelated tenant: denied in direct-access tests
- Footer: `Fictional competition demo — proposed workflow, not production`

**Visual / evidence instruction:** Show a boundary diagram: browser command → server session/role/state checks → disposable synthetic store. Beside it, show a redacted denial test result labelled `R1 ISOLATED DEMO EVIDENCE`, not a generic security badge.

**Speaker note:** This is scoped evidence for the isolated route only. The browser sends an action, idempotency key and expected version; it does not select the tenant, actor or approval time. Passing R1 denial tests does not establish production-safe multi-tenancy for the legacy MVP.

**Claim IDs:** CLM-001, CLM-015, CLM-016, CLM-025.

## Slide 6 — Resolution is proposed, then verified

**On-slide copy**

- `PROPOSED HUMAN WORKFLOW • SYNTHETIC DEMO RECORD`
- Fictional dispatcher assigns only after verification
- Fictional resolver sees minimum necessary case data
- Repair update + generated after-image → `resolution_proposed`
- Authorised fictional human verifies → `resolved`
- Earlier events remain; corrections append later events
- Footer: `Fictional competition demo — proposed workflow, not production`

**Visual / evidence instruction:** Use a two-panel actual R1 screen after tests pass: resolver progress on the left, authorised resolution approval on the right. Both images must say `GENERATED / TYPESET FICTIONAL FIXTURE`. Show actor, version and event ID, with no real address or contact.

**Speaker note:** A resolver can record progress and propose an outcome but cannot close directly. The separate verifier retains the exact evidence and version. This shows role separation and reconstructability in a disposable fictional store; it is not a product-grade operational claim.

**Claim IDs:** CLM-001, CLM-010, CLM-012, CLM-016, CLM-017.

## Slide 7 — Three explicit locales, one stored contract

**On-slide copy**

- `PROPOSED R1 LANGUAGE CONTRACT`
- Bahasa Melayu `ms`
- English `en`
- Simplified Chinese `zh-Hans`
- Preserve original requester text
- Response preview follows the stored locale
- Human approval + `Simulate send`
- `zh-Hant`: future work, not claimed
- Footer: `Fictional competition demo — proposed workflow, not production`

**Visual / evidence instruction:** Show the same verified fictional fact set rendered in three compact response-preview cards, each marked `SYNTHETIC DEMO RECORD`. Include a visible stored-locale field and a `Simulate send` control. Do not show sent/delivered states.

**Speaker note:** R1 names the BCP 47 variants rather than claiming generic Chinese support. The server stores the requester-selected locale and the preview uses verified facts in that locale. Native/domain sign-off remains required before public release.

**Claim IDs:** CLM-001, CLM-011, CLM-019, CLM-027.

## Slide 8 — Evidence, not adjectives

**On-slide copy**

- `AUDITED MVP — DATED EVIDENCE`
- 9 Aug 2026 • Gemini `gemini-3.5-flash-lite`
- 117 / 125 fields • ten fictional synthetic typeset fixtures
- Zero fields scored as invented under the repository method
- Not handwriting • not grounding proof • not a hallucination guarantee
- `R1 DEMO EVIDENCE`: ordered events, synthetic timing, correction count, denial tests
- Footer: `Fictional competition demo — proposed workflow, not production`

**Visual / evidence instruction:** Split the slide. Left: the qualified audit result with its full denominator and limitations. Right: actual R1 test/evidence tiles only after they pass, each labelled `SYNTHETIC DEMO CALCULATION` or `ISOLATED DEMO TEST`. Never use a single green “secure” or “accurate” badge.

**Speaker note:** The extraction number is a dated, small, stochastic typeset-fixture result. It does not answer a handwriting question. R1 adds a separate class of evidence: whether a proposed workflow preserves human authority, events, retries, locale and isolation in a fictional demo.

**Claim IDs:** CLM-001, CLM-003, CLM-004, CLM-005, CLM-006, CLM-007, CLM-013, CLM-017, CLM-018.

## Slide 9 — Keep the boundary visible

**On-slide copy**

- `CURRENT`: audited MVP contains real model calls and deterministic workflows
- `DEMO-ONLY`: fixed fictional case, actors, images, store and metrics
- `PROPOSED`: Community Request-to-Resolution product direction
- `NOT VERIFIED`: provider terms, past real-data status, production tenancy, pilot and impact
- `PRODUCT-GRADE WORK`: lawful data gate, tenancy, operations, native review and independent security evidence
- Private/proprietary R1 artifact; no publication authority
- Footer: `Fictional competition demo — proposed workflow, not production`

**Visual / evidence instruction:** Use five clearly separated labelled lanes. Do not use a roadmap arrow that visually implies completion. Accessibility may be shown only as `WCAG 2.2 AA TARGET` until final tests pass.

**Speaker note:** This is the truth architecture. The isolated demo does not rehabilitate unsafe legacy financial, legal, deletion or multi-tenant paths. Provider and historical data facts remain unknown. No pilot, customer, deployment, government acceptance or measured impact is claimed.

**Claim IDs:** CLM-001, CLM-009, CLM-020, CLM-022, CLM-023, CLM-025, CLM-027, CLM-028.

## Slide 10 — The ask is review, not belief

**On-slide copy**

- `PROPOSED NEXT GATE`
- Inspect the fictional workflow
- Challenge the AI/human boundary
- Re-run state, retry, language, mobile and isolation tests
- Review the claim ledger and limitations
- Owner go/no-go required before publication or submission
- No pilot or production enablement in R1
- Footer: `Fictional competition demo — proposed workflow, not production`

**Visual / evidence instruction:** Use a review-gate card with four checks: `TRUTH`, `AUTHORITY`, `ISOLATION`, `ACCESS`. End with a local artifact/evidence icon, not a public URL, customer logo or national-impact graphic.

**Speaker note:** The contribution is an inspectable claim: a proposed civic-service handoff can keep AI in a suggestion role while humans hold authority and the evidence remains reconstructable. The next decision is whether the owner accepts the evidence for a private competition draft—not whether the system is ready for real people or publication.

**Claim IDs:** CLM-001, CLM-020, CLM-025, CLM-026, CLM-028, CLM-030.
