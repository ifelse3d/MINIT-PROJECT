# Pitch Deck Outline — Minit (MAIC Nexus Challenge, T5)

12 slides, English (organiser rule: all materials English-only; the BM
product screenshots are evidence, captioned in English). Export to **PDF**
(the only published format requirement). Each slide has: the message, what's
on it, and speaker notes. Screenshots `S1…S6` come from
`screenshot-shotlist.md`. [Brackets] = fill before freezing.

**Judging rubric this deck must serve** (verified, see `competition-facts.md`):
Technical Feasibility 25% → slides 5–6 · Commercial Viability 25% → slides
8–9 · Industry Relevance 20% → slides 2–3 · Scalability 15% → slide 10 ·
ESG/National Impact 15% → slides 2 & 12. Commercial Viability ties for the
biggest weight — the business-model half of slide 8 is NOT optional.

---

## Slide 1 — Title
**Message:** Instant credibility and clarity.
- "Minit" + logo [YOU]
- One-liner: *"Photograph the mess. Get compliant documents. Humans confirm, AI drafts."*
- Team name, MAIC Nexus Challenge — **T5: AI for Public Services & Smart Cities**
**Notes:** Say the one-liner and stop. Do not explain yet. T5's own focus
list — citizen agents, multilingual LLMs, civic tech — is literally Minit;
echo those three phrases somewhere in your talk.

## Slide 2 — The Problem
**Message:** Malaysia's societies run on volunteers drowning in paperwork.
- Registered societies in Malaysia: [VERIFY count — ROS/JPPM annual stats]
- The people doing eROSES Annual Returns, AGM packs, donation records are
  volunteer secretaries and treasurers — often older, part-time, multilingual
- The records are handwritten, mixed Malay/Chinese/English, on paper
- Consequences: late/wrong filings → deregistration risk; donation
  records that can't survive an audit; new e-Invois obligations landing on
  organisations with zero systems
**Notes:** Tell the founder's real story here — a real temple network, real
filing pain. One concrete anecdote beats three statistics.

## Slide 3 — Why Now
**Message:** Two deadlines make this urgent, one technology makes it possible.
- e-Invois consolidation obligations now reach small organisations [VERIFY current LHDN phase-in dates]
- eROSES digitalisation: the filing is online but the source records are not
- Vision-language AI can finally read handwritten mixed-language documents
**Notes:** Position: the gap is not "no software exists" — it's that all
existing software makes the volunteer do data entry. That transition sets up slide 4.

## Slide 4 — The Solution & The One Design Law
**Message:** Effort flows from AI to human, never human to AI.
- Photograph messy inputs (meeting notes, donation ledgers, constitution)
- Minit drafts: BM minutes, eROSES paste-pack, numbered receipts, AGM pack,
  clause-cited constitution answers
- The human's only job: **confirm or correct** — never key data into a form
- "The eROSES test": any feature that needs typing structured data is wrong
**Notes:** This slide is the thesis. Everything after is proof.

## Slide 5 — Demo: the hero workflow (screenshots)
**Message:** It works on REAL handwriting, today.
- S1 photo of the real handwritten mixed-language note (the "before")
- S2 extraction review screen: fields with green/amber/red confidence badges
- S3 generated BM minutes with audit line
- S4 eROSES paste-pack table (field name → value → source)
**Notes:** Walk the journey: "This note was written by a real secretary in
three languages. Two minutes later —" flip through S2→S4. Point at an amber
badge: "and when the AI isn't sure, it says so — it never fills the gap with
a guess."

## Slide 6 — Trust architecture (the "real AI" slide)
**Message:** Built for auditors, not demos.
- **Never invents:** every extracted field carries its source (photo region)
  and a confidence rating; missing means missing
- **Money is never LLM math:** receipt numbering (sequential, gap-free),
  register totals, e-Invois consolidation — all deterministic, unit-tested code
- **Everything human-confirmed:** documents carry "Drafted by Minit,
  confirmed by [name] on [date]"
- **PDPA by design:** donor data masked by default, org-scoped storage,
  delete-organisation removes everything
- Accuracy: [X]% of fields correct across [N] real filings [placeholder —
  Phase 6 eval produces this; say "measured on real government-accepted
  filings" when it exists]
**Notes:** Judges will probe hallucination. This slide answers before they ask.

## Slide 7 — The money trail
**Message:** From cash in a donation box to an LHDN-ready file.
- Ledger photo → structured register → sequentially numbered receipts →
  WhatsApp delivery → collector→HQ custody tracking → month-end MyInvois
  Batch Upload .xlsx
- [Replace flow text with S5/S6 screenshots after Phase 2–3 — for the
  14 July deck a clean diagram of the flow is enough]
**Notes:** Emphasise custody: cash handled by volunteers across 20+ halls is
where money leaks; Minit gives HQ a live unremitted-balance view.

## Slide 8 — Market & Business Model
**Message:** A big, unserved, compliance-bound market — and how we get paid.
**(Commercial Viability = 25% of the score. This slide earns it.)**
- [VERIFY] registered societies under ROS + [VERIFY] other NGO forms
- Every one must file annually; many handle donations; e-Invois broadens the pain
- Beachhead: multi-branch religious organisations (temple networks, mosque
  committees, churches) — highest document volume, real money custody needs
- Business model [YOU — decide, don't placeholder]: e.g. subscription per
  organisation (HQ tier covering branches), secretariat/auditor channel as
  reseller, setup service for constitution ingestion
**Notes:** Do not claim "we'll take X% of market". Claim the beachhead, show
the expansion logic, and say a real price number out loud — judges reward a
tested willingness-to-pay story ("our pilot pays RM X/month" beats any TAM).

## Slide 9 — Pilot & traction
**Message:** Not hypothetical — a real network is onboarding.
- Pilot: a 20+ hall temple network (HQ + branches) [YOU: confirm naming permission]
- Milestones: first real filing through Minit in July; festival-season
  donation volume Aug–Sept; auditor-facing custody reports
- [Update with numbers as they happen: filings done, receipts issued, RM tracked]
**Notes:** If asked "users?" — the answer is the pilot plus the founder's own
filings: real government-accepted documents, logged.

## Slide 10 — Roadmap
**Message:** Disciplined, already in motion.
- Now: hero workflow live (this deck's screenshots)
- July: money module (receipts, custody, e-Invois pack)
- Aug: AGM pack, constitution Q&A, published accuracy number, hosted demo
- Sept+: official WhatsApp Business API, MyInvois API via service provider,
  more org types
**Notes:** Keep v1 boundaries honest: WhatsApp = click-to-send links now,
official API later; e-Invois = official batch .xlsx now, API later. Judges
reward knowing what NOT to build.

## Slide 11 — Team
**Message:** The people who live this problem.
- [YOU: names, roles, photos]
- Founder's edge: [X] years running compliance for [the pilot org type] —
  the golden test cases are the founder's own past accepted filings
**Notes:** One line each. The founder's lived experience IS the moat here.

## Slide 12 — The Ask / Close (ESG & National Impact)
**Message:** End on the mission, not on features.
- "Every society in Malaysia deserves a compliant paper trail without a
  full-time clerk."
- National impact framing: governance + auditability for the charity sector,
  PDPA by design, compliance inclusion for non-English-speaking volunteers —
  civic-tech modernisation exactly where eROSES and e-Invois digitalisation
  are pushing
- What we want from MAIC: the HATI incubation + Solarvest equity path
  (champion = RM100k cash + RM100k equity) and T5 partner introductions
- Artifact link: [live URL after Phase 7] · Contact: [YOU]
**Notes:** Close with the before/after: hold up the messy note (S1), then the
compliant BM minutes (S3). Silence. Thank you.

---

## Production notes
- English-only deck (organiser rule). Product screenshots stay in BM — that's
  authenticity, not a bug — with one-line English captions.
- One idea per slide, minimum text, screenshots big.
- Export to **PDF** for submission (confirmed requirement). No slide limit is
  published — aim ≤14 pages anyway; ask support@maicnexus.com.
- If shortlisted: Semi-Final is a LIVE demo day in KL (Oct) — the deck's demo
  slides must match what the live product can actually do on stage.
