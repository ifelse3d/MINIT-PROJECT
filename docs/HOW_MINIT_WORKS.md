# How Minit Works — a plain-English guide

This guide explains what Minit does and *why it is built the way it is*, in everyday language. No coding knowledge needed. If you only read one section, read the first two.

---

## 1. The one big idea

Malaysian societies and temples spend huge effort turning messy paper into the tidy forms the government wants: meeting minutes, an annual return (eROSES), donation receipts, e-Invoice files, AGM papers. Normally a human does all that typing.

Minit flips it. **The AI does the reading and drafting. The human only checks and confirms.** We call this the *eROSES test*: effort should flow from the AI to the human, never the other way. So you will never see a big empty form asking you to key in data. You take a photo, the AI proposes, and you tap to confirm or fix.

---

## 2. Why some parts have AI and some parts don't

This is the question that started this guide: *"Why does the money part have manual adding, but no AI inside?"*

The truth is there **is** AI in the money part — but only for one job: **reading**. There is a strict split:

- **The AI reads.** It looks at your photo of a paper donation ledger (or messy handwritten notes) and pulls out the rows: donor name, amount, date. That is the AI's job, and it saves you from typing.
- **The computer code does the maths.** Adding up totals, giving each receipt a number, tracking cash, and building the e-Invoice totals are done by ordinary, tested program code — *never* by the AI.

Why keep the AI away from the maths? Because an AI can misread a "3" as an "8", drop a digit, or "helpfully" adjust a total so it looks right. For a meeting note a small slip is embarrassing; for money it is a legal and financial problem. Program code, by contrast, adds the same numbers the same way every time and can be tested. So Minit's rule is simple: **the AI extracts quantities; the code does the money.**

And the manual "add income" button? That is a deliberate, clearly-labelled exception. Most income arrives as a ledger photo the AI reads. But a one-off cash gift with no paper page still needs a home — so there is a short confirm-style form for it. Every row added that way is tagged `manual`, so an auditor can always see it was hand-typed, not AI-read.

---

## 3. Where your records are kept

Until now the money screen showed **sample data only**, held in the browser's short-term memory — so anything you added disappeared on refresh. That is what felt like "there's nowhere to keep the record."

It is now fixed for the demo: **records are saved in your browser's local storage.** Add a donation, refresh the page, and it is still there. There is a "Reset sample" button to clear it back to the demo data.

This is a stop-gap. The real database (Supabase) is the long-term home, scoped per organisation. When it is connected (on a paid plan), the save/load swaps over behind the scenes and the screens stay exactly the same. Note: while the app uses a free AI tier, only **sample / fictional data** should go in, because free tiers may train on what they see (a privacy/PDPA rule).

---

## 4. The money module, step by step

1. **Review the ledger (section 1).** The AI's reading of your donation-book photo appears as rows. Each field has a colour badge: **green = confirmed**, **amber = please check**, **red = missing**. Blurry rows are *not* allowed a receipt until you confirm them. You can edit any row — your edit becomes the truth and turns the field green.

2. **Register & receipts (section 2).** When you press "Issue receipts", the code gives every donation a **sequential, gap-free number** (like `MIN-2026-0001`, `-0002`, …). Numbers are never reused or skipped — that is what an auditor checks. Once a receipt is issued, its amount and name are **locked**. You can download the receipt PDF or send it by WhatsApp (a pre-filled `wa.me` link — Minit never auto-sends).
   - Receipts **do not** claim tax-deductibility unless your organisation has an approved LHDN status set, and even then it shows a warning explaining what that legally means.

3. **Cash custody (section 3).** Temple money often passes hand-to-hand before reaching HQ. Minit tracks three states: **with collector → handed over, waiting for HQ → confirmed by HQ.** The collector taps "hand over"; HQ taps "confirm received". A running figure shows how much cash has *not* yet reached HQ.

4. **Month-end e-Invoice pack (section 4).** Explained fully in the next section.

---

## 5. The e-Invoice part explained (why it feels "not done")

**What e-Invoice is.** Since 2024–2026 Malaysian organisations must report transactions to LHDN's **MyInvois** system. Instead of one e-Invoice per small donation, a society can bundle a whole month of small donations into a single **consolidated e-Invoice**.

**What Minit produces.** At month-end Minit builds a **pre-fill pack** — a spreadsheet (`.xlsx`) listing every value you need, plus an instruction sheet. The treasurer logs into the MyInvois Portal, downloads LHDN's official template, and copies the values across, then submits.

**Why not submit automatically?** Two reasons. First, the portal requires its own official multi-sheet template that changes over time — Minit does not forge it blind. Second, direct submission needs the organisation's digital certificate and is a bigger, later project. So v1 stays a safe, manual, human-checked upload. *That extra copy-across step is probably why it felt unfinished — but it is intentional.*

**The rules Minit follows (checked against LHDN, 15 July 2026):**

- **Consolidated buyer** is always name "General Public", TIN `EI00000000010`.
- **The RM10,000 rule:** any single donation of RM10,000 or more **cannot** be lumped into the monthly bundle — it needs its own individual e-Invoice with the donor's real identity. Minit splits these out automatically and leaves the donor's TIN **blank** for the treasurer to fill (never invented).
- **Classification codes:** the consolidated summary line uses code **004** ("Consolidated e-Invoice"); each individual donation uses code **007** ("Donation"). *(This was a fix — the consolidated line was previously using 007.)*
- **Deadline:** a month's consolidated e-Invoice must be submitted within **7 calendar days** after month-end. Minit now shows this date.

**What changed to make it usable in the demo:** there is now a **month picker** (it only offers months that actually have records), the section is **always visible** with a clear "issue receipts first" message when a month still has un-receipted donations, and the submission deadline is shown.

---

## 6. The other features, briefly

- **Inbox** — where you upload photos/PDFs (handwritten notes, ledgers, the constitution). Everything starts here.
- **Minutes** — the AI drafts compliant Bahasa Malaysia meeting minutes from your notes, and produces an eROSES "paste-pack" you can copy straight into the government portal.
- **Filings / Calendar** — tracks statutory deadlines (annual return, etc.) and the maths for due dates.
- **AGM pack** — generates the notice, agenda, attendance sheet and proxy forms for an Annual General Meeting.
- **Constitution** — ask a plain question about your organisation's rules and get an answer with the exact clause cited (it never makes up a clause).
- **Orgs** — supports an HQ with many branches (e.g. a temple network of 20+ halls), each kept separate.
- **Bank resolution** — extracts a clean bank-resolution statement from a meeting's decision.
- **Health / Settings** — system status and organisation settings (language, tax status, etc.).

---

## 7. The safety rules that protect you

These are built into every feature:

1. **The AI never invents.** If a fact is not in your photo, the field is marked *missing* and left blank — the AI will not guess a name or an amount. Every extracted fact carries where it came from and a confidence level.
2. **Money maths is code, not AI** (explained in section 2).
3. **Receipts never imply tax-deductibility** unless your approved status is set, with a hard warning.
4. **Privacy (PDPA).** Donor names and IC numbers are never logged; the AI never receives a full donor name or phone number; a "hide names" option protects donors when you print, share or screenshot (D18, 2026-08-27 — in-app lists show the names you typed); deleting an organisation removes its data.
5. **Everything is trilingual** (BM + Chinese + English) in the interface, and official documents are generated in Bahasa Malaysia. *(Corrected 2026-08-27 — this line said "bilingual" long after CLAUDE.md rule 9 was corrected to trilingual on 2026-08-21.)*
6. **Humans confirm everything; the AI only drafts.** Generated documents carry a line: *"Drafted by Minit, confirmed by [name] on [date]."*

---

*This guide describes the pilot/demo build. Verify the e-Invoice template and codes against the current LHDN MyInvois portal before any real submission.*
