# DEPLOY.md — putting Minit on the internet (Vercel + Supabase)

Written for beginners. Follow top to bottom. Nothing here requires a credit
card (Vercel Hobby + Supabase Free are enough for the competition demo).


## 🔴 The function region must match the database region (2026-08-28)

`vercel.json` pins Vercel's Serverless Functions to **`sin1` (Singapore)**.
That is not a preference — it is the fix for the app being unusably slow.

**How it was found.** J reported the live app taking forever to load. Measured:

| | |
|---|---|
| Public pages (`/login`, `/terms`, `/privacy`) | **0.4s** |
| A logged-in page (the home page) | **4.4–5.9s** to finish streaming |
| First hit of a route after a deploy (cold) | **12–15s** |
| Time the database itself spends on a query | **14ms** |

The database doing 14ms of work while the page takes 4.5 seconds means the time
is travel, not work. Two headers settle where:

- `X-Vercel-Id: sin1::iad1::…` — the request enters at Singapore, but the
  **function runs in `iad1`, Washington D.C.**
- `db.<ref>.supabase.co` resolves to `2406:da18:…`, which AWS's own published
  ip-ranges.json lists as **`ap-southeast-1`, Singapore.**

So every question the app asked the database crossed the Pacific and came back —
roughly 250ms each — and a logged-in page asks eight to twelve of them.

**Do not remove this file, and do not change the region on its own.** If the
database is ever moved, this must move with it; they belong in the same region
or every page in the app pays for it. (Hobby plans allow exactly one region,
which is why the array has one entry — adding a second fails the build.)

The same round trips are also why `getSessionUser` / `getActiveOrg` are wrapped
in React `cache()` and why the home page reads in one `Promise.all`: when a
round trip costs 250ms, doing them in series is the whole bill.


## 0. THE IRON RULE (read this before anything else)

> **Every migration must be applied BEFORE the code that needs it is deployed.**
> (`docs/DECISIONS.md`, D8.)

This has already bitten us once: `src/app/money/actions.ts` still refuses to
write `client_id` because the code shipped and the migration did not. If you
deploy code against a database that is missing a migration, you get an app
that *looks* fine and silently drops data.

**This file was out of date until 2026-08-03** — it listed 2 migrations when
there were 6. If you followed it, you built a production database with **no
receipt lock, no `client_id`, no privileged-column lock and no `ai_usage`
table**. If that is your current database, run the missing files (step 1) now.

## 1. Prepare Supabase (one-time)

1. Open your Supabase project → **SQL Editor**.
2. Run the migration files IN ORDER (paste each file, click Run).
   Order matters — later files depend on earlier ones.

   ⚠ **This list says six. `supabase/migrations/` now holds TEN.** The four
   the table below does not mention are `20260730000000_receipt_series.sql`,
   `20260803000000_ai_usage_cost.sql` (applied 2026-08-18, verified column by
   column) and the two from 2026-08-19, `_org_glossary` and
   `_committee_official_name` (**both applied — verified against the live
   database on 2026-08-19, and `npm run status` re-checks them every run**).
   Whether a fresh database needs them in this order has never been tested,
   because this table has only ever been used against one database.
   **Before a NEW deployment, list the folder rather than trusting this table.**

   | # | File | What it does | Applied? |
   |---|---|---|---|
   | 1 | `20260708000000_init.sql` | tables, storage buckets | ☐ |
   | 2 | `20260719000000_phase7_auth_rls.sql` | auth + RLS by org tree | ☐ |
   | 3 | `20260719150000_phase75_ai_usage.sql` | `ai_usage` meter + `spend_ai_credit` | ☐ |
   | 4 | `20260726000000_client_id_and_receipt_lock.sql` | receipt identity lock, `client_id`, `source` | ☐ |
   | 5 | `20260729000000_admin_grant_ai_credits.sql` | `minit_admin.*` — the ONLY way to add credits | ☐ |
   | 6 | `20260728000000_lock_org_privileged_columns.sql` | locks `extra_credits` / `monthly_free_quota` / `tax_exempt_status` / `parent_org_id` | ☐ |

   ⚠ **5 before 6 — the file dates lie.** Migration 6 (`20260728…`) locks the
   privileged columns; migration 5 (`20260729…`) installs the back door you
   need in order to grant credits *after* that lock exists. Running 6 first
   leaves a window where **nobody**, including you, can add AI credits.
   (This reversal was decided on 2026-07-29 — see `docs/archive/2026-07-29-进度报告.md` §0.)

   The step-by-step operator's guide with verification queries for #4–#6 is
   `supabase/manual/2026-07-29-RUNBOOK-apply-P0-1-and-P0-2.sql`. Use that
   rather than pasting files blind — it tells you what you should see after
   each part, and how to roll back.

   Tick the boxes above as you go, and **commit this file** — right now the
   only record of what has been applied is somebody's memory. (The long-term
   fix is Supabase CLI + `supabase db push`, which keeps the record for you.)

3. Check **Storage**: after migration #2 you should see four private
   buckets: `uploads`, `receipts`, `letterheads`, `einvois`.

4. **Authentication → Sign In / Up**: make sure the **Email** provider is ON.
   Then pick the right column — **these are not the same environment**:

   | Setting | Demo / competition artifact | Real organisations (production) |
   |---|---|---|
   | **Confirm email** | OFF — so a judge can sign up in 5 seconds | **ON.** Off means any typed-in address becomes an account |
   | SMTP | not needed | configure it, or confirmation emails never arrive |
   | Data allowed | fictional only | see the PDPA gate below |

   ⚠ **Confirm email = OFF is an open door.** Combined with P0-3 (no limit on
   how many organisations one account can create) and the default
   `monthly_free_quota = 100` per org, one person with a keyboard can mint
   unlimited free AI. Acceptable for a demo with sample data. **Not**
   acceptable the day a real temple signs up.

   ✅ **PDPA gate — CLEARED 2026-08-20.** This used to read "the current AI
   provider is the Gemini free tier, which may train on inputs, so real donor
   names must not go near it". That is no longer true: the Gemini project is
   on **Tier 1** (paid), confirmed on the AI Studio screen with real charges
   on the Spend page. Real organisation data may now enter the system.
   No API reports a billing tier, so re-check it by eye:
   aistudio.google.com → Usage & Billing → the badge beside the title.
   `npm run status` prints this line together with the date it was last seen.

## 2. Seed Demo Mode (optional but recommended)

On your computer, with `.env.local` filled in:

```
npm run seed:demo
```

This creates the demo HQ + 2 branches, three demo logins (the script prints
them), sample donations with sequential receipts, a confirmed minutes doc,
and storage files. All data is fictional (PDPA-safe).

## 3. Environment variables

These go in `.env.local` locally AND in Vercel (Project → Settings →
Environment Variables). Values come from Supabase → Project Settings → API.

| Variable | Secret? | What it is |
|---|---|---|
| `AI_PROVIDER` | no | `gemini` (current) or `anthropic` |
| `GEMINI_API_KEY` | **yes** | reads the handwriting (server-only). **Tier 1 / paid since 2026-08-20** — the free-tier "may train on your inputs" restriction no longer applies |
| `OPENAI_API_KEY` | **yes** | classify + chat (`gpt-5-nano`), paid since 2026-08-07 |
| `OPENAI_IMAGE_DETAIL` | no | `high`. **Do not change** — `original` was measured and reads a name wrong |
| `AI_MODEL_CLASSIFY` / `_CHAT` / `_EXTRACT` / `_LONG_DOC` | no | one model per job. **A value with no colon is silently ignored** and everything falls back to Gemini — `npm run check:ai` exists to catch exactly that |
| `ANTHROPIC_API_KEY` | **yes** | only if `AI_PROVIDER=anthropic` |
| `SUPABASE_URL` | no | project URL (server) |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes!** | bypasses RLS — server-only, never expose |
| `NEXT_PUBLIC_SUPABASE_URL` | no | same project URL, for the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | the PUBLIC "anon" key (safe: RLS protects data) |

⚠ Double-check you did NOT put the service_role key into any
`NEXT_PUBLIC_*` variable. `NEXT_PUBLIC_` means "shipped to every browser".

## 4. Deploy to Vercel

> 🇨🇳 A beginner-level walkthrough of this section, in Chinese, with the
> screenshot task after it: **`docs/上线与截图-给J的步骤.md`**.

🔴 **THE TRAP: Vercel deploys `master` by default, and `master` is stale.**
As of 2026-08-20 `origin/master` is `3797c05 "Save 2026-08-07-2204"` — **27
commits behind** `codex/r1c-local-closure-20260810`, which is the branch the
app is actually developed on. Deploying the default gets you the 7 August
build: no glossary, no `/members`, step 3 not wired to a model, no
accessibility fix. It looks fine, which is why nobody would notice.

**Set Project → Settings → Git → Production Branch to
`codex/r1c-local-closure-20260810`, then Redeploy.** Do not merge into master
to fix this — a setting is reversible in one click and a bad merge is not.

1. Push the repo to GitHub (`.env.local` is git-ignored — verify with
   `git status` that no env file is staged). Use `push-cabang.bat`; do NOT
   use `push-to-github.bat`, whose `git add -A` would commit ~96 MB of
   `r1-output/` including a `node_modules`.
2. On vercel.com: **Add New → Project → Import** the GitHub repo.
   Framework preset: Next.js (auto-detected). No build settings to change.
3. Add all the environment variables from the table above
   (Production + Preview + Development). `salin-env-vercel.bat` puts them on
   the clipboard in the exact shape that box accepts, so it is one paste
   rather than twelve — and never prints a key.
4. Click **Deploy**, then fix the Production Branch as above.
   The live URL is your competition artifact link (evidence 6), and it also
   clears the public-artifact `NO-GO`.

## 5. Verify the deployment

1. Open `https://your-app.vercel.app/health` — every check must be green.
2. Open the root URL — you must land on **/login** (proxy is working).
3. Sign in as `demo-hq@minit.example` → you should see HQ + both branches
   on the Organisations page.
4. Sign in as `demo-cawangan@minit.example` → ONLY Cawangan Utara visible.
5. Sign in as `demo-auditor@minit.example` → HQ + Cawangan Selatan, and
   saving/issuing anything is refused (read-only).
6. Register a brand-new account → it sees NO orgs until it creates one.

## Troubleshooting

- **Login loops back to /login** → `NEXT_PUBLIC_SUPABASE_*` vars missing in
  Vercel, or Email provider disabled in Supabase.
- **"Table missing" on /health** → a migration was skipped (step 1.2 — check
  the tick-boxes; `ai_usage` missing means #3, receipt columns missing means #4).
- **"cannot add AI credits / permission denied on orgs"** → you ran migration
  #6 (the lock) without #5 (the back door). Run #5, then use
  `select * from minit_admin.grant_ai_credits(<org id>, <amount>);` — a plain
  `update orgs set extra_credits = …` is blocked on purpose, for everyone.
- **Sign-up says "check your email"** → Confirm email is ON in Supabase;
  either turn it off (demo) or configure SMTP (production).
- **npm run seed:demo says bucket missing** → Phase 7 migration not applied.
