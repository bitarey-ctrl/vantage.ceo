-- 040_company_intelligence.sql
-- Business-context research, verified per-company sources, collection runs, and versioned impact analyses.
--
-- Additive only: three new tables and nullable/defaulted columns on ceo_context and consequences. No existing row,
-- column, policy or migration is changed. All new tables are owner-readable under RLS; writes happen only through
-- server routes with the service role (no insert/update/delete policies for end users).
--
-- Rollback (manual):
--   DROP TABLE IF EXISTS public.source_collection_runs, public.company_sources, public.company_research_runs;
--   ALTER TABLE public.ceo_context DROP COLUMN IF EXISTS business_facts;
--   ALTER TABLE public.consequences DROP COLUMN IF EXISTS context_version, DROP COLUMN IF EXISTS evidence,
--     DROP COLUMN IF EXISTS calculation, DROP COLUMN IF EXISTS superseded_at;

-- ─── Research runs: what public research was done, with what inputs, and what it proposed ─────────────────────────
CREATE TABLE IF NOT EXISTS public.company_research_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  -- Only public identifiers are ever sent to search (company name, website, stated markets). Recorded for audit.
  inputs       jsonb NOT NULL DEFAULT '{}'::jsonb,
  queries      jsonb NOT NULL DEFAULT '[]'::jsonb,   -- search queries actually run
  retrieved    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- URLs actually retrieved during the run
  proposals    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- proposed facts with evidence; never applied automatically
  error        text,
  model        text,
  usage        jsonb
);
CREATE INDEX IF NOT EXISTS company_research_runs_profile_idx ON public.company_research_runs (profile_id, started_at DESC);

-- ─── Sources: actual applicable sources for one company, and whether each was verified ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_sources (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  url                  text NOT NULL,
  final_url            text,
  title                text,
  kind                 text NOT NULL CHECK (kind IN ('company', 'competitor', 'supplier', 'customer', 'industry', 'government', 'regulator', 'news_search')),
  why                  text,           -- why this source matters to this business
  claims               text,           -- what claims it can support
  jurisdiction         text,
  collection_method    text NOT NULL DEFAULT 'page' CHECK (collection_method IN ('rss', 'page', 'search')),
  feed_url             text,
  status               text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'verified', 'failed', 'retired')),
  discovered_by        text NOT NULL DEFAULT 'research' CHECK (discovered_by IN ('research', 'founder', 'plan')),
  research_run_id      uuid REFERENCES public.company_research_runs(id) ON DELETE SET NULL,
  last_checked_at      timestamptz,
  last_ok_at           timestamptz,
  last_error           text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  content_hash         text,
  last_changed_at      timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, url)
);
CREATE INDEX IF NOT EXISTS company_sources_profile_idx ON public.company_sources (profile_id, status);

-- ─── Collection runs: each manual or scheduled refresh, persisted with its report ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.source_collection_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trigger      text NOT NULL CHECK (trigger IN ('manual', 'scheduled', 'test')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'partial', 'failed')),
  report       jsonb NOT NULL DEFAULT '{}'::jsonb,
  error        text
);
CREATE INDEX IF NOT EXISTS source_collection_runs_profile_idx ON public.source_collection_runs (profile_id, started_at DESC);

-- ─── Context facts beyond the existing columns (dependencies, constraints, estimates), each with provenance ────────
ALTER TABLE public.ceo_context ADD COLUMN IF NOT EXISTS business_facts jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ─── Impact analyses record the context and evidence they were made with ───────────────────────────────────────────
ALTER TABLE public.consequences ADD COLUMN IF NOT EXISTS context_version text;
ALTER TABLE public.consequences ADD COLUMN IF NOT EXISTS evidence jsonb;
ALTER TABLE public.consequences ADD COLUMN IF NOT EXISTS calculation jsonb;
ALTER TABLE public.consequences ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

-- ─── RLS: owners can read their rows; only the service role writes ─────────────────────────────────────────────────
ALTER TABLE public.company_research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_collection_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_research_runs: owner read" ON public.company_research_runs;
CREATE POLICY "company_research_runs: owner read" ON public.company_research_runs FOR SELECT USING (auth.uid() = profile_id);
DROP POLICY IF EXISTS "company_sources: owner read" ON public.company_sources;
CREATE POLICY "company_sources: owner read" ON public.company_sources FOR SELECT USING (auth.uid() = profile_id);
DROP POLICY IF EXISTS "source_collection_runs: owner read" ON public.source_collection_runs;
CREATE POLICY "source_collection_runs: owner read" ON public.source_collection_runs FOR SELECT USING (auth.uid() = profile_id);
