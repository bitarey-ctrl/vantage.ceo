-- ─────────────────────────────────────────────────────────────
-- 021 — Advisor's Read (daily-cached Command page pull-quote)
-- One generated one-line "read" per user per local day, derived from their
-- open decisions + recent consequences. Cached so the Command page doesn't
-- re-generate on every load.
-- ─────────────────────────────────────────────────────────────

create table if not exists advisor_reads (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles(id) on delete cascade,
  quote         text not null,
  -- Count of decisions + consequences the quote was drawn from, shown as
  -- "Drawn from N connected signals" in the UI.
  source_count  integer not null default 0,
  -- The user's local calendar date (YYYY-MM-DD) at generation time — the
  -- idempotency key so we only generate once per user per local day.
  local_date    text not null,
  created_at    timestamptz not null default now()
);

create unique index if not exists idx_advisor_reads_profile_date
  on advisor_reads(profile_id, local_date);

alter table advisor_reads enable row level security;

-- advisor_reads: scoped to profile owner
drop policy if exists "advisor_reads: own profile" on advisor_reads;
create policy "advisor_reads: own profile" on advisor_reads
  for all using (auth.uid() = profile_id);
