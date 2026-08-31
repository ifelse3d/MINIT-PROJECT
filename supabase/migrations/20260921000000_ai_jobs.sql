-- ============================================================================
-- Migration 43 — ai_jobs: 排队慢慢读。One row per long document that is being
-- read a few pages at a time.
-- (工作单 105 §1，J 2026-08-31 晚拍板：「超過 10 頁的 FILE 讀不到」的根治。)
--
-- HOW TO APPLY (beginner-friendly):
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file, press RUN. "Success. No rows returned" = done.
--   (Or double-click salin-migration.bat and pick 43 to copy it.)
--
-- WHY:
--   Vercel kills one request at 60 seconds. One AI attempt gets 45 of them,
--   which is about 10–18 dense pages (the arithmetic is written out at the
--   top of src/lib/ai/http.ts). A constitution has been cut into pieces by
--   the BROWSER since work order 81 — but the pieces lived in a JavaScript
--   variable, so closing the tab threw away a document that had already been
--   paid for, and nobody else could pick it up.
--
--   This table is that progress, moved somewhere it survives: which document,
--   how many pages, how many batches, how many are in, what has been read so
--   far, and what it has cost. The browser calls /api/job/step in a loop; the
--   row is what makes "come back later" and "my colleague finishes it" work.
--
--   Deployment fact behind the design (105 §1-1): this project runs on Vercel
--   HOBBY, whose cron fires once a DAY. A server-side pusher is therefore not
--   available at any useful cadence, so the browser drives — which needs no
--   new plan, no new vendor and no new secret.
--
-- 🔴 PDPA (Hard Rule 5). `result` holds the SAME extracted facts the review
--   pages already hold, scoped by org_id exactly like every other table, and
--   it goes when the organisation goes (the FK cascades). It is never logged
--   and never leaves the org. `source_path` points at the uploaded original
--   in the `uploads` bucket, whose own RLS is checked on the first path
--   segment (= org id); /api/job/step deletes that object as soon as the last
--   batch is in, so a finished job leaves no copy behind.
--
-- 🔴 FAILS SOFT, on purpose. While this table is missing, /api/job/start
--   answers "the queue is not ready" and every door falls back to the
--   single-request read it has always done — which is exactly today's
--   behaviour, including today's honest refusal for a document too long for
--   one request. Nothing that works today stops working if this is not run.
-- ============================================================================

create table if not exists ai_jobs (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  -- Hard Rule 8 idiom: the signed-in human the read was charged to, stamped
  -- by the server from the session. Best-effort — metering must never depend
  -- on knowing the person (same rule as ai_usage.user_id).
  created_by uuid,

  -- What kind of paperwork this is, as decided by the classifier at the door.
  kind text not null check (kind in ('meeting_notes', 'ledger_page', 'constitution')),
  status text not null default 'queued'
    check (status in ('queued', 'reading', 'done', 'failed')),

  -- The original, kept in Storage until the last batch is in. Never a data
  -- URL, never bytes in the database.
  source_path text not null check (char_length(source_path) <= 500),
  file_name text not null check (char_length(file_name) <= 200),
  -- What the person typed alongside the upload (spellings, hints). Travels to
  -- the prompt as LABELLED DATA on every batch, exactly like a direct upload.
  context text check (char_length(context) <= 2000),

  total_pages int not null check (total_pages >= 0),
  total_batches int not null check (total_batches >= 1),
  batches_done int not null default 0 check (batches_done >= 0),
  -- 🔴 The page high-water mark the NEXT batch's price is measured from
  -- (D47 deltas). Only ever moves when a batch is actually delivered.
  pages_done int not null default 0 check (pages_done >= 0),
  -- Consecutive failures of the CURRENT batch; reset by a good one.
  attempts int not null default 0 check (attempts >= 0),

  -- What has been read so far: the merged extraction, in the same shape the
  -- review pages take. Null until the first batch lands.
  result jsonb,
  -- The member-side deduction so far, for the honest "this cost N" line.
  actions_charged int not null default 0 check (actions_charged >= 0),
  -- A6 free-plan fence pages taken when the job was created. Kept here so a
  -- job that gives up having read NOTHING can hand every one of them back —
  -- the fence counts pages the AI read, and it read none.
  fence_pages int not null default 0 check (fence_pages >= 0),

  -- Optimistic lock: while this is in the future, another tab's step leaves
  -- the job alone rather than reading the same pages twice.
  leased_until timestamptz,
  -- The last thing that went wrong, as a short CODE, never a message and
  -- never anything off the page (PDPA).
  last_error text check (char_length(last_error) <= 60),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- "What is this org still reading?" — the only query the doors run.
create index if not exists idx_ai_jobs_org_open
  on ai_jobs (org_id, created_at desc)
  where status in ('queued', 'reading');

create index if not exists idx_ai_jobs_org on ai_jobs (org_id, created_at desc);

alter table ai_jobs enable row level security;

-- Same shape as every org-scoped table (phase 7): read within the accessible
-- tree, write within the writable tree. An auditor_readonly account can SEE
-- that a read is happening and cannot start or advance one — the route also
-- checks the "upload" capability before charging anything.
create policy ai_jobs_select on ai_jobs
  for select to authenticated
  using (org_id in (select public.accessible_orgs()));

create policy ai_jobs_insert on ai_jobs
  for insert to authenticated
  with check (org_id in (select public.accessible_orgs_writable()));

create policy ai_jobs_update on ai_jobs
  for update to authenticated
  using (org_id in (select public.accessible_orgs_writable()))
  with check (org_id in (select public.accessible_orgs_writable()));

create policy ai_jobs_delete on ai_jobs
  for delete to authenticated
  using (org_id in (select public.accessible_orgs_writable()));

comment on table ai_jobs is
  'One long document being read a few pages at a time (work order 105 §1). The browser calls /api/job/step until status is done; the row is what lets a closed tab, a reload or a colleague on another phone pick the same document up without paying for it twice.';

comment on column ai_jobs.pages_done is
  'High-water mark of pages actually delivered. The next batch is priced from here (D47 deltas), so a failed-and-refunded batch must leave it untouched.';

comment on column ai_jobs.leased_until is
  'While in the future, another tab''s /api/job/step leaves this job alone. Longer than the route''s own vendor budget so a lease never expires under a step that is still legitimately working.';

-- ----------------------------------------------------------------------------
-- Claim the next batch, atomically. Two tabs (or a tab and a phone) can call
-- /api/job/step at the same moment; exactly one of them may hold the job.
--
-- Returns the claimed row, or NO ROWS when somebody else holds it or there is
-- nothing left to do. SECURITY INVOKER — never DEFINER — so the caller's RLS
-- is still the boundary (the same rule cari_minit's function is written to).
-- ----------------------------------------------------------------------------
create or replace function public.claim_ai_job(p_job_id bigint, p_lease_ms int)
returns setof ai_jobs
language sql
security invoker
set search_path = public
as $$
  update ai_jobs
     set status = 'reading',
         leased_until = now() + make_interval(secs => p_lease_ms / 1000.0),
         updated_at = now()
   where id = p_job_id
     and status in ('queued', 'reading')
     and batches_done < total_batches
     and (leased_until is null or leased_until < now())
  returning *;
$$;

comment on function public.claim_ai_job(bigint, int) is
  'Take the lease on one ai_jobs row if it is free. Zero rows back means another tab has it, or the document is finished — both are normal answers, not errors.';
