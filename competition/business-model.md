# Minit — Business Model (Commercial Viability slide content)

> Drafted 10 July 2026. This fills the "weakest spot" flagged in
> `competition-facts.md` (Commercial Viability = 25% of judging).
> Everything below is deck-ready content + speaker notes. Items marked
> ⚠ VERIFY need a check before the deck is final.

---

## 1. Market size (VERIFIED — replaces the "[VERIFY count]" placeholder)

- **90,224 active registered societies in Malaysia** — official JPPM/ROS
  statistics page, data updated **10 July 2026**.
  Source: https://www.ros.gov.my/portal-main/statistics-details?id=statistik-pertubuhan-aktif
- Many societies also operate **branches** (JPPM tracks "pertubuhan induk" vs
  "pertubuhan cawangan" separately). Minit charges per organisational unit
  (HQ + each branch), so the addressable unit count is **larger than 90k**.
  Supporting datum (verified 10 Jul 2026): the last published breakdown (2009)
  showed 115,537 registered societies of which 69,735 were branch-operating —
  i.e. the branch structure is the NORM, not the exception. Use "90,224 active
  societies (JPPM, Jul 2026), the majority historically branch-structured".
- Do NOT use "300k+" — the official active count is 90,224. Using the
  official, dated, government number is more credible to judges anyway.

**Slide line:** *"90,224 active registered societies (JPPM, July 2026) — every
one legally required to file an Annual Return, keep AGM minutes, and account
for donations. Almost none have professional staff."*

## 2. The problem has a price tag (why someone pays)

- Non-compliance risk: fines and deregistration under the Societies Act; loss
  of bank account access; committee members personally exposed.
- Today's alternatives: a company-secretary-style service doing society
  filings charges per filing/per year ⚠ VERIFY local rates; volunteers doing
  it themselves costs evenings of unpaid work in a language (formal BM) many
  committee members don't write well.
- New pressure arriving NOW: **LHDN e-Invois obligations reached the smallest
  tier on 1 January 2026** (verified 10 Jul 2026): organisations with annual
  income/turnover above RM1 million must e-invoice (the exemption floor was
  raised from RM500k to RM1M in the Dec 2025 revision — and is expected to be
  reviewed downward); since 1 Jan 2026 any transaction above RM10,000 requires
  an INDIVIDUAL e-invoice (consolidated no longer permitted for it) — exactly
  the RM10k individual path Minit already implements. Large temple networks
  and federations with festival donation volume are in scope TODAY; smaller
  ones should prepare. ⚠ VERIFY how LHDN treats donation income for societies
  specifically (guideline nuance) before the deck freezes.

## 3. Who pays, and how much (proposed pricing)

Anchor logic: price like accounting SaaS for Malaysian SMEs, not enterprise
software. Cheap enough for a temple committee to approve without an AGM.

> ⚠️ **2026-07-29 CORRECTED.** The RM49 / RM39 / free-HQ tiers below were a
> 10 July draft that was **never submitted**. The pricing in the SUBMITTED deck
> (`deck/Pitch_Deck.pdf` p9) and in `Minit_AI_Cost_Model.xlsx` is the real one
> and they agree with each other. This file was the odd one out; it is now
> aligned. Anyone quoting pricing must use the table below.
>
> 🔴 **2026-08-05 — THIS FILE IS AGAIN THE ODD ONE OUT. DO NOT QUOTE THE TABLE BELOW.**
> The submitted deck p9 (`deck/Minit-Pitch-Deck-CURRENT.pdf`) and
> `summary-onepager.md` both now price by **volume, not by org type**:
> **RM39 small / RM99 active / RM188 high-volume, plus RM150 for an HQ account.**
> The "RM 200 per society" row below is a superseded 10 July figure that survived
> the 7/29 correction. **The current pricing lives in `summary-onepager.md`;
> quote that.** Reconciling this table is a decision for J, not an edit —
> the whole margin model is built on the RM39/99/188 mix, so changing the
> tiers changes the 85%.

| Tier | Price | For | Includes |
|---|---|---|---|
| **Free** | RM 0 | Any small society | 1 org, minutes drafting, constitution Q&A, watermark on documents |
| **Pertubuhan** | **RM 200/month per society** | Typical single society | Everything: receipts, donation register, eROSES paste-pack, AGM pack, e-Invois pack |
| **HQ + Branches** | **RM 188/month per branch + RM 150/month HQ account** | Federations, temple networks, unions | Central custody tracking, consolidated reporting, branch roll-up |
| **Setup** | one-time onboarding fee | New networks | Migration of existing records, committee training |

- **Network anchor:** a 20-branch network ≈ **RM 3,910/month ≈ RM 47k/year**
  from ONE customer. 25 such networks ≈ RM 1.2M ARR. There are thousands of
  multi-branch societies (temples, alumni, unions, sports bodies, political
  party branches).
- **Who signs the cheque:** the HQ treasurer/secretary — one decision covers
  all branches. This is the go-to-market shortcut: sell to federations, not
  one society at a time.
> 🔴 **2026-08-05 — the unit economics below are SUPERSEDED.**
> The live model is now code, not a spreadsheet: **`src/lib/unit-economics.ts`**,
> run it with **`npm run economics`**. It carries every variable at its expensive
> end and gives **RM19.56 cost per organisation per month, 73.4% gross margin**
> at a hundred organisations. (It also prices a 75.4% routing — **do not quote
> it**: that one moves handwriting extraction onto a model we have never run our
> eval against, so its margin rests on an untested accuracy assumption.)
> It also shows the finding this section misses:
> **which model you pick matters more than scale** — one *mid-tier* model for
> every task gives 27%, a frontier model at list price is negative, while the
> cheap single model we actually run today gives **66.6%** and the quoted
> routing gives 73.4%. That is because 83% of calls are classification and chat.
> Keep the section below for its assumptions and its reasoning; take the numbers
> from the script.
>
> ⚠️ **2026-08-06 更正**：这里以前写「27% on our current model」。**我们的 current model
> 不是那一档** —— `GEMINI_DEFAULT_MODEL` 2026-08-04 就换成 `gemini-3.5-flash-lite` 了。
> 跑 `npm run check:ai` 会印出今天实际解析到哪个模型、对应哪一档毛利。

- **Unit economics (modelled, not yet measured).** Using the assumptions in
  `Minit_AI_Cost_Model.xlsx` (500 donor-slip images, 60 ledger pages, 12
  meeting reports, 300 Q&As per branch per month; 20% retry buffer; FX 4.70;
  Gemini 2.5 Flash):

  | | AI cost / branch / month | Gross margin at RM188 |
  |---|---|---|
  | With prompt caching | RM 17.30 | **91%** |
  | Without caching (**current state — caching is NOT implemented**) | RM 31.50 | **83%** |

  On these assumptions the model produces a software-typical gross margin
  (>80%) at the real price even in the worse case. ⚠️ Three caveats, and none of
  them may be dropped when this is quoted: caching does not exist yet in
  `src/lib/ai/gemini.ts`; `ai_usage` still records no token counts, so
  **this is a model, not a measurement** (7/29 report, item D6); and the
  **RM 17–32 figure itself is superseded** — it assumes a festival-season branch
  (500 donor slips, 60 ledger pages, 300 Q&As a month) priced on Gemini 2.5 Flash.
  The current costing (`docs/AI-API-选型与成本.md`, 2026-08-03) gives
  **RM 0.43–4.39 of AI per organisation per month** on today's models and volumes.
  ⚠️ Never put RM 17–32 and RM 8–29 and RM 0.4–4.4 in front of a judge without
  saying which is AI-only, which includes cloud, and which volume they assume.

## 4. Go-to-market (in order)

1. **First deployments (August 2026)** — no organisation is live on Minit yet (confirmed 2026-07-29). The August goal is the first real society using it end to end, for proof, testimonials and real filings.
2. **Same-community referrals** — temple/clan/guild networks are densely
   connected; the treasurer of one is on the committee of three others.
3. **Umbrella bodies & federations** — one deal = tens of branches.
4. **Company secretaries / audit firms serving NGOs** — resell Minit instead
   of doing manual filings (channel, not competitor).

## 5. Moat / why us

- **Workflow depth, not a wrapper:** deterministic receipt numbering, custody
  state machine, e-Invois consolidation math — auditable code, not LLM output.
- **BM + mixed-language handwriting** as a first-class input — global tools
  don't touch this.
- **Compliance memory:** the org's constitution, past minutes and filings
  compound; switching away means losing the org's operating memory.
- **PDPA-by-design** — a real requirement for donor data, already built in.

## 6. Honest risks (judges respect this; keep one line in the deck)

- eROSES has no public API → we generate a "paste-pack", human submits. If
  the government opens an API, Minit integrates and gets stronger, not weaker.
- Adoption is committee-by-committee → mitigated by HQ-level sales.

## 7. The one-slide version

> **90,224 societies must comply; almost none have staff.**
> Minit turns photos of messy paperwork into compliant filings.
> **RM 39 / 99 / 188 per month by volume; RM 150 for a network HQ account — sold to HQs, not individuals.**
> A 20-branch network ≈ RM 3,910/month from one customer.
> **Modelled** cost RM 19.56 per organisation per month including cloud —
> a **73% modelled** gross margin at a hundred organisations, on pessimistic
> assumptions. Measured from August.

⚠️ The line above was rewritten 2026-08-05. The previous version said
"RM 200/society/month" (superseded pricing) and "margins are software margins"
(a claim stated as fact about a number nobody has measured). **"Modelled" is not
a hedge here — it is the difference between a projection and a misrepresentation,
and §12 makes material misrepresentation a disqualifying matter.**

---

### ⚠ VERIFY checklist before the deck is final
1. e-Invois phase-in date/threshold for small NGOs (LHDN site).
2. What secretarial services charge for society Annual Return filing (call 2–3).
3. Whether JPPM publishes a branch ("cawangan") count.
4. Screenshot the ROS statistics page (90,224, dated) as evidence for appendix.
