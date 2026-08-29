-- ============================================================
-- VANTAGE — Initial Schema
-- Run this in Supabase SQL Editor:
--   app.supabase.com → your project → SQL Editor → New query
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Enums ───────────────────────────────────────────────────
create type impact_level as enum ('high', 'medium', 'low', 'none');

create type decision_category as enum (
  'hiring', 'pricing', 'expansion', 'product', 'team',
  'regulatory', 'partnerships', 'fundraising', 'marketing',
  'operations', 'other'
);

create type urgency_level as enum ('low', 'medium', 'high', 'critical');

create type decision_status as enum ('draft', 'active', 'pending', 'resolved', 'archived');

create type signal_source as enum ('perplexity', 'rss', 'manual');

create type consequence_status as enum ('pending', 'accepted', 'rejected');

create type brief_type as enum ('daily', 'weekly');

create type recommendation_status as enum ('pending', 'accepted', 'dismissed');

-- ─── Table: profiles ─────────────────────────────────────────
-- Mirrors auth.users 1-to-1; created on first sign-up via trigger.
create table profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text not null,
  full_name            text,
  company_name         text,
  industry             text,
  company_stage        text,
  geography            text,
  revenue_range        text,
  business_model       text,
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ─── Table: ceo_context ──────────────────────────────────────
-- Stores the rich strategic context captured during onboarding.
create table ceo_context (
  id                             uuid primary key default uuid_generate_v4(),
  profile_id                     uuid not null references profiles(id) on delete cascade,
  strategic_priorities           jsonb not null default '[]',
  revenue_model                  text,
  monthly_revenue_range          text,
  competitors                    jsonb not null default '[]',
  avoided_decision               text,
  avoided_decision_stated_reason text,
  sector                         text,
  sector_tags                    text[] not null default '{}',
  geography_detail               text,
  past_decision_regrets          jsonb not null default '[]',
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  unique (profile_id)
);

-- ─── Table: decisions ────────────────────────────────────────
create table decisions (
  id                           uuid primary key default uuid_generate_v4(),
  profile_id                   uuid not null references profiles(id) on delete cascade,
  title                        text not null,
  category                     decision_category not null,
  rationale                    text not null default '',
  predicted_outcome            text not null default '',
  confidence_score             integer not null default 3 check (confidence_score between 1 and 5),
  urgency_level                urgency_level not null default 'medium',
  emotional_context            text,
  alternatives_considered      jsonb not null default '[]',
  status                       decision_status not null default 'draft',
  actual_outcome               text,
  outcome_variance_cost        numeric,
  outcome_variance_description text,
  outcome_reviewed_at          timestamptz,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

-- ─── Table: signals ──────────────────────────────────────────
-- Raw ingested signals — not profile-scoped (shared across users).
create table signals (
  id           uuid primary key default uuid_generate_v4(),
  source       signal_source not null,
  title        text not null,
  content      text not null default '',
  url          text,
  published_at timestamptz,
  created_at   timestamptz not null default now()
);

-- ─── Table: consequences ─────────────────────────────────────
-- AI-processed consequences derived from signals, scoped per profile.
create table consequences (
  id                    uuid primary key default uuid_generate_v4(),
  profile_id            uuid not null references profiles(id) on delete cascade,
  signal_id             uuid references signals(id) on delete set null,
  brief_id              uuid,
  so_what               text not null,
  primary_impact        text not null,
  secondary_impact      text,
  tertiary_risk         text,
  action_recommendation text not null,
  urgency_window        text not null,
  urgency_days          integer not null default 7,
  confidence_score      integer not null default 50 check (confidence_score between 0 and 100),
  impact_matrix         jsonb not null default '{"revenue":"medium","cost":"medium","competitive_position":"medium","regulatory_exposure":"none"}',
  consequence_horizons  jsonb not null default '[]',
  status                consequence_status not null default 'pending',
  responded_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─── Table: blind_spot_patterns ──────────────────────────────
create table blind_spot_patterns (
  id              uuid primary key default uuid_generate_v4(),
  profile_id      uuid not null references profiles(id) on delete cascade,
  pattern_type    text not null,
  alert_message   text not null,
  confidence      integer not null default 50 check (confidence between 0 and 100),
  detection_data  jsonb not null default '{}',
  is_active       boolean not null default true,
  detected_at     timestamptz not null default now(),
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── Table: health_scores ────────────────────────────────────
create table health_scores (
  id            uuid primary key default uuid_generate_v4(),
  profile_id    uuid not null references profiles(id) on delete cascade,
  score         integer not null default 50 check (score between 0 and 100),
  delta         integer not null default 0,
  rationale     text not null default '',
  components    jsonb not null default '{"signal_quality":50,"decision_velocity":50,"blind_spot_risk":50,"action_bias":50}',
  calculated_at timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- ─── Table: briefs ───────────────────────────────────────────
create table briefs (
  id                     uuid primary key default uuid_generate_v4(),
  profile_id             uuid not null references profiles(id) on delete cascade,
  type                   brief_type not null default 'daily',
  health_score           integer,
  health_score_delta     integer,
  health_score_rationale text,
  top_signals            jsonb not null default '[]',
  required_actions       jsonb not null default '[]',
  generated_at           timestamptz not null default now(),
  created_at             timestamptz not null default now()
);

-- ─── Table: recommendations ──────────────────────────────────
create table recommendations (
  id                    uuid primary key default uuid_generate_v4(),
  profile_id            uuid not null references profiles(id) on delete cascade,
  brief_id              uuid references briefs(id) on delete set null,
  consequence_id        uuid references consequences(id) on delete set null,
  linked_consequence_id uuid references consequences(id) on delete set null,
  description           text not null,
  time_window           text not null,
  category              text,
  status                recommendation_status not null default 'pending',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─── Deferred FK: consequences.brief_id → briefs ─────────────
alter table consequences
  add constraint consequences_brief_id_fkey
  foreign key (brief_id) references briefs(id) on delete set null;

-- ─── Indexes ─────────────────────────────────────────────────
create index if not exists idx_ceo_context_profile      on ceo_context(profile_id);
create index if not exists idx_decisions_profile        on decisions(profile_id);
create index if not exists idx_decisions_status         on decisions(status);
create index if not exists idx_decisions_created        on decisions(created_at desc);
create index if not exists idx_signals_source           on signals(source);
create index if not exists idx_signals_created          on signals(created_at desc);
create index if not exists idx_consequences_profile     on consequences(profile_id);
create index if not exists idx_consequences_status      on consequences(status);
create index if not exists idx_consequences_signal      on consequences(signal_id);
create index if not exists idx_consequences_brief       on consequences(brief_id);
create index if not exists idx_blind_spots_profile      on blind_spot_patterns(profile_id);
create index if not exists idx_blind_spots_active       on blind_spot_patterns(profile_id, is_active);
create index if not exists idx_health_scores_profile    on health_scores(profile_id);
create index if not exists idx_health_scores_calculated on health_scores(calculated_at desc);
create index if not exists idx_briefs_profile           on briefs(profile_id);
create index if not exists idx_briefs_generated         on briefs(generated_at desc);
create index if not exists idx_recommendations_profile  on recommendations(profile_id);
create index idx_recommendations_brief    on recommendations(brief_id);

-- ─── updated_at auto-trigger ─────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger trg_ceo_context_updated_at
  before update on ceo_context
  for each row execute function set_updated_at();

create trigger trg_decisions_updated_at
  before update on decisions
  for each row execute function set_updated_at();

create trigger trg_consequences_updated_at
  before update on consequences
  for each row execute function set_updated_at();

create trigger trg_blind_spots_updated_at
  before update on blind_spot_patterns
  for each row execute function set_updated_at();

create trigger trg_recommendations_updated_at
  before update on recommendations
  for each row execute function set_updated_at();

-- ─── Profile auto-create trigger ─────────────────────────────
-- Creates a profiles row whenever a new user signs up via Supabase Auth.
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── Row Level Security ──────────────────────────────────────
alter table profiles            enable row level security;
alter table ceo_context         enable row level security;
alter table decisions           enable row level security;
alter table signals             enable row level security;
alter table consequences        enable row level security;
alter table blind_spot_patterns enable row level security;
alter table health_scores       enable row level security;
alter table briefs              enable row level security;
alter table recommendations     enable row level security;

-- profiles: users can only read/write their own row
create policy "profiles: own row" on profiles
  for all using (auth.uid() = id);

-- ceo_context: scoped to profile owner
create policy "ceo_context: own profile" on ceo_context
  for all using (auth.uid() = profile_id);

-- decisions: scoped to profile owner
create policy "decisions: own profile" on decisions
  for all using (auth.uid() = profile_id);

-- signals: readable by all authenticated users (shared signal pool)
create policy "signals: authenticated read" on signals
  for select using (auth.role() = 'authenticated');

-- signals: only service role can insert (from cron / ingestion)
create policy "signals: service role insert" on signals
  for insert with check (auth.role() = 'service_role');

-- consequences: scoped to profile owner
create policy "consequences: own profile" on consequences
  for all using (auth.uid() = profile_id);

-- blind_spot_patterns: scoped to profile owner
create policy "blind_spot_patterns: own profile" on blind_spot_patterns
  for all using (auth.uid() = profile_id);

-- health_scores: scoped to profile owner
create policy "health_scores: own profile" on health_scores
  for all using (auth.uid() = profile_id);

-- briefs: scoped to profile owner
create policy "briefs: own profile" on briefs
  for all using (auth.uid() = profile_id);

-- recommendations: scoped to profile owner
create policy "recommendations: own profile" on recommendations
  for all using (auth.uid() = profile_id);
