-- 045_signal_read_scope.sql
-- Browser-facing reads of shared signals are limited to the signals linked to the signed-in account.
--
-- Why: production lets every signed-in user read every row of public.signals ("signals: authenticated read").
-- Signals found for one company (news searched by its name, items from its watched sources) are stored there, so any
-- account could query them through the API and see which companies other accounts monitor. Public article text does
-- not make that monitoring activity public.
--
-- Model (existing, unchanged): a signal belongs to an account through its own row in public.signal_triages, written
-- only by server code with the service role (ingestion, assessment, backfill). This migration:
--   1. signals:        SELECT for `authenticated` only when the account has its own triage link. No user writes.
--   2. signal_triages: users may READ their own links; they can no longer create, change or delete links (that would
--                      grant access to any signal id). All app writes already use the service role.
--   3. consequences:   users READ their own; may UPDATE only status, responded_at, brief_id (the columns the app
--                      changes with the user's session); cannot insert, delete or repoint a row to another signal.
--   4. anon:           no privileges on these three tables (no logged-out path reads them).
-- Service-role access (server ingestion and assessment) is unchanged: it bypasses RLS and keeps its grants.
--
-- Requires: public.signals, public.signal_triages (signal_id, profile_id), public.consequences (profile_id, status,
-- responded_at, brief_id). Independent of the 033–038 drafts. Idempotent. Changes no rows.
-- Rollback: see the end of this file.

-- ── Prerequisites ────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE missing text[] := ARRAY[]::text[]; orphan bigint;
BEGIN
  IF to_regclass('public.signals') IS NULL THEN missing := missing || 'table signals'; END IF;
  IF to_regclass('public.signal_triages') IS NULL THEN missing := missing || 'table signal_triages'; END IF;
  IF to_regclass('public.consequences') IS NULL THEN missing := missing || 'table consequences'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'signal_triages' AND column_name = 'profile_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'signal_triages' AND column_name = 'signal_id') THEN
    missing := missing || 'signal_triages.(signal_id, profile_id)';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'consequences' AND column_name IN ('profile_id', 'signal_id', 'status', 'responded_at', 'brief_id')) < 5 THEN
    missing := missing || 'consequences.(profile_id, signal_id, status, responded_at, brief_id)';
  END IF;
  IF array_length(missing, 1) IS NOT NULL THEN RAISE EXCEPTION '045 prerequisites missing: %', array_to_string(missing, ', '); END IF;
  -- Informational only (no rows are changed): consequences whose signal has no triage link for the same account will
  -- still be readable, but their joined signal (title, link) will no longer be returned to the browser.
  SELECT count(*) INTO orphan FROM public.consequences c
   WHERE c.signal_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.signal_triages t WHERE t.signal_id = c.signal_id AND t.profile_id = c.profile_id);
  RAISE NOTICE '045: % consequence row(s) reference a signal without a triage link for the same account', orphan;
END $$;

-- ── 1. signals ───────────────────────────────────────────────────────────────────────────────────────────────────
-- Remove every user-facing policy on signals (any policy not limited to the service role), whatever its name.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signals'
             AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%service_role%'
  LOOP EXECUTE format('DROP POLICY %I ON public.signals', p.policyname); END LOOP;
END $$;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signals: read when linked to your account" ON public.signals
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.signal_triages t WHERE t.signal_id = signals.id AND t.profile_id = (SELECT auth.uid())));
REVOKE ALL ON public.signals FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.signals FROM authenticated;
GRANT SELECT ON public.signals TO authenticated;

-- ── 2. signal_triages ────────────────────────────────────────────────────────────────────────────────────────────
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signal_triages'
             AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%service_role%'
  LOOP EXECUTE format('DROP POLICY %I ON public.signal_triages', p.policyname); END LOOP;
END $$;
ALTER TABLE public.signal_triages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signal_triages: read own" ON public.signal_triages
  FOR SELECT TO authenticated USING (profile_id = (SELECT auth.uid()));
REVOKE ALL ON public.signal_triages FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.signal_triages FROM authenticated;
GRANT SELECT ON public.signal_triages TO authenticated;

-- ── 3. consequences ──────────────────────────────────────────────────────────────────────────────────────────────
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consequences'
             AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%service_role%'
  LOOP EXECUTE format('DROP POLICY %I ON public.consequences', p.policyname); END LOOP;
END $$;
ALTER TABLE public.consequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consequences: read own" ON public.consequences
  FOR SELECT TO authenticated USING (profile_id = (SELECT auth.uid()));
CREATE POLICY "consequences: update own" ON public.consequences
  FOR UPDATE TO authenticated USING (profile_id = (SELECT auth.uid())) WITH CHECK (profile_id = (SELECT auth.uid()));
REVOKE ALL ON public.consequences FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.consequences FROM authenticated;
GRANT SELECT ON public.consequences TO authenticated;
GRANT UPDATE (status, responded_at, brief_id) ON public.consequences TO authenticated;

-- ── Verification (fails the migration if the end state is wrong) ──────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('signals', 'signal_triages', 'consequences')
              AND cmd IN ('ALL', 'INSERT', 'DELETE') AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%service_role%') THEN
    RAISE EXCEPTION '045 verification: a user-facing write policy remains';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signals' AND cmd = 'SELECT'
              AND qual NOT LIKE '%signal_triages%' AND qual NOT LIKE '%service_role%') THEN
    RAISE EXCEPTION '045 verification: a signals read policy not based on the account''s link remains';
  END IF;
  IF has_table_privilege('authenticated', 'public.signal_triages', 'INSERT') OR has_table_privilege('authenticated', 'public.signals', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.consequences', 'INSERT') OR has_column_privilege('authenticated', 'public.consequences', 'signal_id', 'UPDATE')
     OR has_table_privilege('anon', 'public.signals', 'SELECT') THEN
    RAISE EXCEPTION '045 verification: a user or anon privilege remains';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.consequences', 'status', 'UPDATE') THEN
    RAISE EXCEPTION '045 verification: users can no longer respond to their own consequences';
  END IF;
END $$;

-- ── Rollback (restores the production state before 045; run manually only if needed) ─────────────────────────────
-- DROP POLICY IF EXISTS "signals: read when linked to your account" ON public.signals;
-- CREATE POLICY "signals: authenticated read" ON public.signals FOR SELECT TO public USING (auth.role() = 'authenticated');
-- DROP POLICY IF EXISTS "signal_triages: read own" ON public.signal_triages;
-- CREATE POLICY "Users can view own triages" ON public.signal_triages FOR SELECT TO public USING (auth.uid() = profile_id);
-- CREATE POLICY signal_triages_own ON public.signal_triages FOR ALL TO public USING (auth.uid() = profile_id);
-- DROP POLICY IF EXISTS "consequences: read own" ON public.consequences;
-- DROP POLICY IF EXISTS "consequences: update own" ON public.consequences;
-- CREATE POLICY "consequences: own profile" ON public.consequences FOR ALL TO public USING (auth.uid() = profile_id);
-- GRANT ALL ON public.signals, public.signal_triages, public.consequences TO anon, authenticated;
