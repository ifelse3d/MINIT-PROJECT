# R1 MAIC Submission and Owner Go/No-Go Checklist

**Status:** private R1 review draft. Checking every box does not itself authorise publication or submission. The final two authority boxes require a separate owner decision.

## 1. Official-format gates

- [ ] Re-open the official MAIC application portal and Rules & Regulations on the actual rehearsal/submission date; record URL, date/time, reviewer and any changed constraint.
- [ ] Competition track remains `T5 — AI for Public Services & Smart Cities`; no track change is attempted after the portal lock.
- [x] All submitted materials and presentations are English-only. Product screenshots may contain a supported product locale only when their explanatory captions are English.
- [x] Pitch deck is a readable PDF.
- [x] Pitch deck is no more than the official 12-slide ceiling.
- [x] R1 deck contains exactly 10 slides, with no hidden, appendix or duplicated slide.
- [x] Written project summary is one English plain-text payload with no Markdown heading, table, appendix, citation token, bilingual duplicate, internal instruction or unsupported control character.
- [x] Written project summary is no more than the official 500-word ceiling.
- [x] Written project summary is also no more than the R1 internal 450-word safety ceiling.
- [x] Counter A: exact final summary payload counted with a Unicode-aware whitespace counter; command, count and SHA-256 retained.
- [x] Counter B: the same payload counted independently with a second tokenizer; command, count and SHA-256 retained.
- [x] Both counters agree or any tokenizer difference is reconciled conservatively below 450 before the portal rehearsal.
- [x] AI usage disclosure is included as a required application artifact and matches the final implementation/evidence state.
- [ ] Team size, Malaysian-citizen/MyKad eligibility, one-person/one-team rule and team-member details are rechecked against the current official portal before any submission.

**Evidence record**

| Gate | Actual | Evidence path / reviewer | Status |
|---|---|---|---|
| Official portal/rules recheck | PENDING | Owner-controlled portal rehearsal | NOT VERIFIED |
| Deck PDF / slide count | 10 PPTX slides; 0 hidden; 10 notes; 10 PDF pages | Final PPTX/PDF, inspection record and render comparison | PASS |
| Summary Counter A | 319 words; SHA-256 `C0A24E30F793F4CCA27AA4350AD1B289CA1FF63D0A8E96FC232573A7452C7D56` | PowerShell Unicode whitespace counter below | PASS |
| Summary Counter B | 319 words; same SHA-256 | Independent Python `\S+` tokenizer below | PASS |
| AI disclosure present | Final local file; SHA-256 `6F64559AE9B86DADE185041369CCEE03D7D2C88D09263DD78344B9B967C11D39` | `02_AI_DISCLOSURE.txt` | PASS |
| Eligibility/team details | PENDING owner evidence | Owner record | NOT VERIFIED |

**Final local artifact snapshot**

- Summary Counter A command: `(([IO.File]::ReadAllText((Resolve-Path 'competition/r1-draft/01_PROJECT_SUMMARY.txt'), [Text.Encoding]::UTF8) -split '\s+') | Where-Object { $_ }).Count` → `319`.
- Summary Counter B command: `python -c "from pathlib import Path; import re; t=Path(r'competition/r1-draft/01_PROJECT_SUMMARY.txt').read_text(encoding='utf-8'); print(len(re.findall(r'\S+',t)))"` → `319`.
- Exact truth boundary appears once in the summary and on 10/10 final slides.
- Exact `PROPOSED • FICTIONAL DATA` status appears on 10/10 final slides.
- Final slide 2 uses the source-consistent fictional location `Dewan Komuniti Seri Damai`.
- Final PPTX: 10 slide XML entries, 10 presentation slide IDs, 0 hidden slides, 10 speaker-note bodies and 10/10 notes with claim IDs plus `[Sources]`.
- Final PDF: 10 readable rendered pages; no extractable text layer. PPTX/PDF render pairs are 10/10 at 1,920×1,080.
- Final deck identities before this checklist update: PPTX SHA-256 `5681248D51797E37A3756AF74C72CCCA723454C989FEA0992810C8272BDF20AF`; PDF SHA-256 `53EC36A310B990B369CB9C0F7AC6E1692E7891DB2CB495DF7CDF9E433CB1C1F3`; inspection record SHA-256 `E3F474940400BB21B3337FA8CEE36508EDCE5D2649E0D42137A845A0D50EDDDC`.

## 2. Non-submitting portal rehearsal

- [ ] Use the owner-controlled account and a rehearsal path that does not press the final submit control.
- [ ] Paste the exact final `01_PROJECT_SUMMARY.txt`; confirm no truncation, smart-character replacement, encoding damage or hidden formatting.
- [ ] Upload the exact final 10-slide PDF; confirm filename, file size, page count, rendering and no hidden slide.
- [ ] Paste/upload the exact final `02_AI_DISCLOSURE.txt`; confirm no truncation or formatting change.
- [ ] Confirm every mandatory field can be completed without inventing a pilot, customer, public URL, commercial figure, team credential or government relationship.
- [ ] Capture only redacted evidence that contains no account secret, personal contact, payment detail or submission token.
- [ ] Exit without publishing or submitting.

## 3. Claim and material gates

- [ ] Every material sentence in summary, deck, speaker notes, demo script, disclosure, captions, metadata and Q&A maps to `03_CLAIM_LEDGER.md`.
- [x] Every dated runtime claim retains date, environment/model, sample, denominator and limitation in the same visible or spoken context.
- [ ] Every R1 screen reproduced in any artifact visibly says `SYNTHETIC DEMO RECORD`.
- [x] Every slide visibly says `PROPOSED • FICTIONAL DATA` and carries `Fictional competition demo — proposed workflow, not production`.
- [x] Every future capability is visibly labelled `PROPOSED`; no roadmap design is rendered as completed.
- [x] The 9 August 93.6% result, if used, says 117/125, ten fictional synthetic typeset fixtures, Gemini `gemini-3.5-flash-lite`, zero fields scored as invented under the repository method, and all material limitations.
- [x] The stored 95.2% result, if used at all, appears only beside the 93.6% rerun and is framed as run variability.
- [x] No internal simulated score appears in outward-facing material.
- [ ] `04_PROHIBITED_PHRASE_CHECK.md` has been run on final source, deck, notes, PDF/PPTX metadata, captions, video metadata and Q&A.
- [x] Automated candidates were manually classified by two reviewers; unresolved `REMOVE` or `REWRITE` count is zero.
- [x] Prohibited present-tense claim count at exit is exactly zero.
- [ ] Named team members approve names, roles, contributions and external facts; no credential is inferred.

## 4. AI disclosure gates

- [x] Source still confirms Gemini and OpenAI support; Anthropic is not described as implemented.
- [x] Dated local task/model routing is either freshly rechecked or explicitly retained as 9 August 2026 local audit evidence only.
- [x] Model work is separated from deterministic TypeScript work.
- [x] Evaluation date, model, fixture type, sample size, denominator, result and limitations are complete and consistent across all materials.
- [x] `zero fields scored as invented` is never turned into an impossibility or hallucination guarantee.
- [x] Legacy human review is described as partial, not universal.
- [x] R1 deterministic fixture mode is not described as a live-model result.
- [x] Any optional approved live-model result is visibly labelled live, uses only the approved fictional fixture, and has retained bounded failure evidence. No optional live-model result is present in the final local pack.
- [x] Provider tier, DPA, training/use settings, retention, safety logging, residency and deletion behavior remain explicitly unverified unless documentary evidence is added.
- [x] Historical real-personal-data processing remains explicitly unverified unless a privileged owner/legal inventory closes it.
- [x] AI-assisted-development/content disclosure lists only verified tools, scope and review facts; incomplete model/version/reviewer/provenance details remain explicit.

## 5. R1 demo and evidence gates

- [x] Persistent exact boundary appears on every route screen: `Fictional competition demo — proposed workflow, not production`.
- [x] Only the fixed fictional organisation, actors, walkway-light request and generated/typeset images are present.
- [x] No real contact, identity, address, payment, organisation onboarding, production record or external delivery input exists.
- [ ] `ms`, `en` and `zh-Hans` hero-path parity tests pass; if one fails, its claim is removed rather than weakened.
- [x] Selected locale is server-stored; response preview uses that locale and verified facts in deterministic fixture mode.
- [x] Every AI proposal field is visibly `UNVERIFIED`; AI cannot advance an authoritative state.
- [x] Named fictional human correction high → normal retains source, before/after values, reason, versions, server identity and timestamp.
- [x] Pre-verification assignment, direct close, forged actor/time, stale version and illegal transitions fail closed and retain safe events within the isolated R1 API/store boundary.
- [x] Duplicate submission and lost-response retries create one request/transition for one idempotency key.
- [x] Deterministic timeout, 429, 503 and malformed-output fixture paths are bounded, honest and do not show false success. Real provider transport/timing remains `NOT VERIFIED`.
- [x] Assignment, progress, resolution proposal and separate resolution verification preserve role boundaries.
- [x] `Simulate send` is the only delivery action; no screen, log or narration says a message was sent or delivered.
- [x] Ordered audit history contains intake, AI attempt/failure/result, correction, verification, assignment, progress, resolution proposal/approval, response approval/simulation and requester outcome where implemented.
- [x] Metrics derive from stored event timestamps, show their definition/denominator and remain labelled synthetic demo calculations.
- [x] Two fresh sessions and one unrelated fictional tenant cannot read, mutate, infer or reset each other’s request through the isolated R1 UI/direct API proof. This is not a production-tenancy claim.
- [x] Deterministic reset removes only session-created synthetic state and restores the fixed seed without touching legacy product data.
- [ ] All applicable COMP, ART, HERO, SEC, LANG, A11Y and relevant ENG IDs have actual command, environment, fixture, expected, actual and pass/fail evidence; unrun tests say `NOT VERIFIED`.

## 6. Deck, demo and accessibility rehearsal

- [x] All ten slides render without overflow, hidden copy, clipped footer, accidental transparency, tiny text or illegible evidence.
- [x] Speaker notes contain claim IDs and evidence sources but no unsupported narration.
- [ ] Deck and PDF metadata contain no stale title, unsafe claim, secret, local user path or real personal data.
- [x] Demo narration script is scheduled to complete in no more than 3:00; the final script ends at 2:58 to preserve recording margin. A recorded rehearsal remains pending.
- [x] The first scripted spoken scene says exactly: `Fictional competition demo — proposed workflow, not production.`
- [ ] Every recorded fallback is labelled prerecorded local synthetic test evidence and comes from a passed test.
- [x] Final desktop and 390×844 local journeys pass the recorded geometry/semantics review without overlap, clipping, horizontal loss, hidden disclaimer or unreachable action. Full three-locale parity remains separately unchecked.
- [ ] Keyboard order, visible focus, error focus, semantic names/roles/states, dynamic announcements and AI/unverified distinction pass.
- [ ] Colour is not the sole signal; contrast, 200% text resize, zoom and reflow meet the declared WCAG 2.2 AA target.
- [ ] Slow/failing network tests do not duplicate or corrupt state.
- [ ] Native/domain reviewers approve safety, consent, status, response and civic terminology for each claimed locale, or the missing review is explicitly listed as `NOT VERIFIED` before owner decision.

## 7. Artifact packaging and public-access rules

- [ ] R1 review package includes only R1 reports, `competition/r1-draft` material, relevant source diffs/patches, test outputs, redacted evidence, manifest, branch/HEAD/status and launcher/readme.
- [ ] Package excludes secrets, `.env` values, node_modules, caches, real data, full unsafe Git history and unrelated owner files.
- [ ] Secret/PII/private-endpoint/licence/provenance scan is run on the exact final package and binaries.
- [ ] Review ZIP manifest and SHA-256 are retained and rechecked after the final write.
- [ ] Current repository and Git history remain private and unpublished.
- [ ] No artifact URL or source repository is made public without explicit owner publication approval.
- [ ] **Only after owner publication approval:** if an artifact link is submitted, it is publicly accessible without a login wall during the judging window and is verified in a fresh anonymous/incognito desktop and mobile session.
- [ ] **Only after owner publication approval:** if a repository artifact is used, the selected sanitised repository satisfies the official minimum commit/day rule, has an explicit licence, and passes secret/PII/history/asset review. The current repository is not used by default.
- [ ] Public title, description, captions, thumbnail, filenames, metadata and access page pass the same claim scan as the deck.
- [ ] Takedown/incident owner and judging-window availability owner are named before any public access.

## 8. Final authority gate

- [ ] Independent adversarial reviewer confirms the artifact cannot reasonably be mistaken for a deployed product, pilot, government system, official output, real delivery or measured outcome.
- [ ] Owner reviews all `unknown`, `NOT VERIFIED`, failed and residual-risk items; none are hidden by the review bundle.
- [ ] Owner signs the exact final claim ledger, summary hash, deck/PDF hashes, disclosure hash, demo/video hash if present, artifact manifest and test report.
- [ ] Owner gives a separate, dated **publication go/no-go**. Without `GO`, nothing is hosted or made public.
- [ ] Owner gives a separate, dated **submission go/no-go**. Without `GO`, the portal is not submitted.
- [ ] Even with `GO`, no push, merge, pilot, production enablement, real-data processing or R2 work is implied by R1.

## Current disposition

`OWNER REVIEW REQUIRED — NOT AUTHORISED FOR PUBLICATION OR SUBMISSION`

**Claim IDs:** CLM-001, CLM-007–CLM-030.
