-- ============================================================================
-- Minit — Phase 0 initial schema
-- Creates every table from BUILD_PLAN.md Section 1 (18 tables).
--
-- HOW TO APPLY (beginner-friendly):
--   1. Open your Supabase project dashboard → SQL Editor → New query.
--   2. Paste this entire file and click "Run".
--
-- SECURITY POSTURE (Phase 0):
--   Row-level security (RLS) is ENABLED on every table but NO policies are
--   created yet. That means all public/anon access is blocked cold. The app
--   talks to the database server-side with the service-role key, which
--   bypasses RLS. Real per-org policies (HQ sees branches, branches see only
--   themselves) arrive in Phase 7 with auth.
--
-- CONVENTIONS:
--   - All primary keys: bigint identity (auto-incrementing integers).
--   - Money is ALWAYS integer cents (amount_cents) — never floats.
--   - Allowed values enforced with CHECK constraints (easy to read/extend).
--   - Org-scoped tables cascade-delete when their org is deleted
--     (supports the PDPA "delete organisation" requirement in Phase 7).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- orgs: organisations, forming a tree via parent_org_id (HQ → branches)
-- ---------------------------------------------------------------------------
create table orgs (
  id bigint generated always as identity primary key,
  -- restrict: an HQ with branches cannot be deleted until its branches are
  -- deleted first (Phase 7 delete-organisation handles this deliberately)
  parent_org_id bigint references orgs (id) on delete restrict,
  name text not null,
  letterhead_storage_path text,
  languages text[] not null default '{}',
  tax_exempt_status text not null default 'none'
    check (tax_exempt_status in ('none', 's44_6', 'pure_religious')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- members_roles: people and their roles within an org
-- ---------------------------------------------------------------------------
create table members_roles (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  user_id uuid, -- nullable pre-auth; will link to auth.users in Phase 7
  name text not null,
  role text not null check (
    role in ('hq_admin', 'committee', 'secretary', 'treasurer', 'collector', 'auditor_readonly')
  ),
  phone text
);

-- ---------------------------------------------------------------------------
-- uploads: every photographed/scanned document that enters the system
-- ---------------------------------------------------------------------------
create table uploads (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  filename text not null,
  storage_path text not null,
  kind text not null default 'other' check (
    kind in ('meeting_notes', 'ledger_page', 'constitution', 'attendance_sheet', 'expense', 'other')
  ),
  language_detected text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  uploaded_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- extractions: raw validated LLM JSON output for an upload.
-- Every non-missing field inside payload_json carries source_ref + confidence
-- (CLAUDE.md Hard Rule 1). Never log this content (Hard Rule 5).
-- ---------------------------------------------------------------------------
create table extractions (
  id bigint generated always as identity primary key,
  upload_id bigint not null references uploads (id) on delete cascade,
  org_id bigint not null references orgs (id) on delete cascade,
  payload_json jsonb not null,
  model_used text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- minutes_docs: drafted → confirmed BM meeting minutes
-- ---------------------------------------------------------------------------
create table minutes_docs (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  upload_id bigint references uploads (id) on delete set null,
  meeting_type text not null check (meeting_type in ('agm', 'egm', 'committee')),
  meeting_date date,
  draft_md text,
  final_md text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  confirmed_by text,
  confirmed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- paste_packs: eROSES Annual Return field name → value → source_ref.
-- org_id is denormalised here (and on reminders/rsvps) beyond what BUILD_PLAN
-- lists, so that Phase 7 RLS policies can be a uniform org_id check on every
-- table instead of error-prone joins.
-- ---------------------------------------------------------------------------
create table paste_packs (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  minutes_doc_id bigint not null references minutes_docs (id) on delete cascade,
  fields_json jsonb not null
);

-- ---------------------------------------------------------------------------
-- committee_roster: the org's operating "memory" of office bearers
-- ---------------------------------------------------------------------------
create table committee_roster (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  position text not null,
  person_name text not null,
  ic_masked text, -- ALWAYS masked; raw IC numbers are never stored here
  term_start date,
  term_end date,
  source_extraction_id bigint references extractions (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- donations: one row per donation. Money math is TypeScript, never the LLM
-- (Hard Rule 2). receipt_id foreign key is added after receipts exists,
-- because the two tables reference each other.
-- ---------------------------------------------------------------------------
create table donations (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  branch_org_id bigint references orgs (id) on delete set null,
  donor_name text,
  donor_phone text,
  donor_masked text, -- masked display name for list views (PDPA, Hard Rule 5)
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'MYR',
  purpose text,
  donated_at date,
  collector_member_id bigint references members_roles (id) on delete set null,
  receipt_id bigint, -- FK constraint added below, after receipts is created
  custody_status text not null default 'collected'
    check (custody_status in ('collected', 'pending_remittance', 'settled')),
  source_upload_id bigint references uploads (id) on delete set null,
  source_ref text
);

-- ---------------------------------------------------------------------------
-- receipts: sequential, gap-free per org (numbering logic lives in
-- /src/lib/receipts.ts from Phase 2; the unique constraint is the database
-- backstop). donation_id uses the default ON DELETE NO ACTION: deleting a
-- donation that has an issued receipt fails (void, don't delete — the
-- sequence must stay gap-free), but because NO ACTION is only checked at the
-- END of a statement, deleting a whole org still cascades cleanly through
-- donations and receipts together.
-- ---------------------------------------------------------------------------
create table receipts (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  receipt_no text not null,
  donation_id bigint not null references donations (id),
  pdf_storage_path text,
  language text,
  delivered_via text not null default 'none'
    check (delivered_via in ('whatsapp_link', 'email', 'print', 'none')),
  issued_at timestamptz not null default now(),
  unique (org_id, receipt_no)
);

alter table donations
  add constraint donations_receipt_id_fkey
  foreign key (receipt_id) references receipts (id) on delete set null;

-- ---------------------------------------------------------------------------
-- remittance_batches: collector → HQ handover record (custody state machine
-- lives in /src/lib/custody.ts from Phase 3).
-- receipt_ids is bigint[] (BUILD_PLAN says int[], but receipt ids here are
-- bigint — a deliberate deviation). Postgres cannot enforce foreign keys on
-- array elements, so /src/lib/custody.ts must be the SOLE writer of this
-- column and must always re-derive total_cents from the live receipt rows,
-- never trust the stored array alone.
-- ---------------------------------------------------------------------------
create table remittance_batches (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  branch_org_id bigint references orgs (id) on delete set null,
  collector_member_id bigint references members_roles (id) on delete set null,
  receipt_ids bigint[] not null default '{}',
  total_cents bigint not null default 0 check (total_cents >= 0),
  handed_over_at timestamptz,
  confirmed_by_hq text, -- name of the HQ person who confirmed receipt of cash
  status text not null default 'pending' check (status in ('pending', 'confirmed'))
);

-- ---------------------------------------------------------------------------
-- einvois_packs: month-end MyInvois Batch Upload .xlsx consolidation packs
-- ---------------------------------------------------------------------------
create table einvois_packs (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  month date not null, -- first day of the month the pack covers, e.g. 2026-07-01
  consolidated_json jsonb not null,
  xlsx_storage_path text,
  generated_at timestamptz not null default now(),
  unique (org_id, month) -- backstop: one consolidation pack per org per month
);

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------
create table expenses (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  description text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  category text,
  spent_at date,
  source_upload_id bigint references uploads (id) on delete set null,
  source_ref text
);

-- ---------------------------------------------------------------------------
-- constitutions: extracted clauses of the org's constitution
-- clauses_json = array of {clause_no, heading, text, page_ref}
-- ---------------------------------------------------------------------------
create table constitutions (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  upload_id bigint references uploads (id) on delete set null,
  clauses_json jsonb not null
);

-- ---------------------------------------------------------------------------
-- qa_log: constitution Q&A cache. Only question/answer text is stored —
-- never document contents beyond that (Hard Rule 5).
-- ---------------------------------------------------------------------------
create table qa_log (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  question text not null,
  answer text not null,
  cited_clause_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- events_meetings
-- ---------------------------------------------------------------------------
create table events_meetings (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  venue_text text,
  online_url text,
  kind text not null check (kind in ('agm', 'committee', 'activity', 'class'))
);

-- ---------------------------------------------------------------------------
-- reminders: "offset" is a reserved word in SQL, so it must always be written
-- in double quotes in raw SQL. The supabase-js client is unaffected.
-- ---------------------------------------------------------------------------
create table reminders (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  event_id bigint not null references events_meetings (id) on delete cascade,
  "offset" text not null check ("offset" in ('7d', '1d', '2h')),
  channel text not null check (channel in ('wa_link', 'email')),
  sent_at timestamptz -- null until sent
);

-- ---------------------------------------------------------------------------
-- rsvps: captured from the no-login RSVP page (Phase 8)
-- ---------------------------------------------------------------------------
create table rsvps (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  event_id bigint not null references events_meetings (id) on delete cascade,
  person_name text not null,
  phone text,
  response text not null check (response in ('yes', 'no', 'maybe')),
  via text
);

-- ---------------------------------------------------------------------------
-- deadlines: compliance calendar (e.g. Annual Return = AGM date + 60 days)
-- ---------------------------------------------------------------------------
create table deadlines (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  kind text not null check (kind in ('annual_return_60d', 'einvois_monthend', 'custom')),
  due_date date not null,
  source text, -- where this deadline came from, e.g. "AGM minutes confirmed 2026-06-01"
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes: every org-scoped table gets an org_id index (all app queries are
-- scoped by org), plus the foreign keys we will join on constantly.
-- ---------------------------------------------------------------------------
create index idx_orgs_parent on orgs (parent_org_id);
create index idx_members_roles_org on members_roles (org_id);
create index idx_uploads_org on uploads (org_id);
create index idx_extractions_org on extractions (org_id);
create index idx_extractions_upload on extractions (upload_id);
create index idx_minutes_docs_org on minutes_docs (org_id);
create index idx_paste_packs_org on paste_packs (org_id);
create index idx_paste_packs_minutes_doc on paste_packs (minutes_doc_id);
create index idx_committee_roster_org on committee_roster (org_id);
create index idx_donations_org on donations (org_id);
create index idx_donations_receipt on donations (receipt_id);
create index idx_receipts_org on receipts (org_id);
create index idx_receipts_donation on receipts (donation_id);
create index idx_remittance_batches_org on remittance_batches (org_id);
-- einvois_packs needs no separate org_id index: unique (org_id, month) covers it
create index idx_expenses_org on expenses (org_id);
create index idx_constitutions_org on constitutions (org_id);
create index idx_qa_log_org on qa_log (org_id);
create index idx_events_meetings_org on events_meetings (org_id);
create index idx_reminders_org on reminders (org_id);
create index idx_reminders_event on reminders (event_id);
create index idx_rsvps_org on rsvps (org_id);
create index idx_rsvps_event on rsvps (event_id);
create index idx_deadlines_org on deadlines (org_id);

-- ---------------------------------------------------------------------------
-- Row-level security: enabled everywhere, zero policies until Phase 7.
-- Result: anon/public keys can read NOTHING; only the server-side
-- service-role key (which bypasses RLS) can touch data.
-- ---------------------------------------------------------------------------
alter table orgs enable row level security;
alter table members_roles enable row level security;
alter table uploads enable row level security;
alter table extractions enable row level security;
alter table minutes_docs enable row level security;
alter table paste_packs enable row level security;
alter table committee_roster enable row level security;
alter table donations enable row level security;
alter table receipts enable row level security;
alter table remittance_batches enable row level security;
alter table einvois_packs enable row level security;
alter table expenses enable row level security;
alter table constitutions enable row level security;
alter table qa_log enable row level security;
alter table events_meetings enable row level security;
alter table rsvps enable row level security;
alter table reminders enable row level security;
alter table deadlines enable row level security;
