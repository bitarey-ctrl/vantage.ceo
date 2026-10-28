-- 039 — Account-backed workspace for the main app (decision reasoning, Advisor context, signal preferences).
-- NOT APPLIED by Claude (AGENTS.md rule 6). Run manually in the Supabase SQL editor of project
-- odahuetnflsqkligzwpm, AFTER supabase/checks/039_preflight.sql returns no failures.
-- Additive only: three new tables, two unique indexes on existing primary-key columns, two trigger
-- functions and one RPC. No existing column, row, policy or migration is changed. Rollback:
-- supabase/rollbacks/039_account_workspace.down.sql. Numbered 039 to stay clear of unreleased drafts
-- 033–038 in the main checkout (none of which this release needs).
--
-- Why each object exists
--   decision_workspaces     goal/limit/frame, tagged evidence, learning plan, cost of waiting, scenario inputs,
--                           the immutable choice snapshot, append-only reviews and the reconsideration link.
--                           One versioned row per decision; its owner is enforced by a composite foreign key.
--   advisor_context_links   which decision/signal/strategy a real advisor_sessions conversation belongs to.
--                           Messages stay in advisor_sessions; this table holds only the association.
--   signal_preferences      Watch (with its baseline revision), acknowledged revision and dismissal, per account
--                           and signal. The composite foreign key only admits signals linked to the account.
--   save_decision_workspace atomic compare-and-set write of a decision's core fields and its workspace, so the
--                           UI never shows "recorded" when only half of the change was saved.

BEGIN;

-- ─── Ownership keys on existing tables (the columns are already unique through their primary keys) ──────────
CREATE UNIQUE INDEX IF NOT EXISTS decisions_id_profile_id_key ON public.decisions (id, profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS advisor_sessions_id_profile_id_key ON public.advisor_sessions (id, profile_id);

-- ─── 1. Decision workspace ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.decision_workspaces (
  decision_id        uuid PRIMARY KEY,
  profile_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  support            jsonb NOT NULL DEFAULT '{}'::jsonb,
  parent_decision_id uuid,
  version            integer NOT NULL DEFAULT 1,
  provenance         text NOT NULL DEFAULT 'account',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT decision_workspaces_decision_owner_fk FOREIGN KEY (decision_id, profile_id)
    REFERENCES public.decisions (id, profile_id) ON DELETE CASCADE,
  CONSTRAINT decision_workspaces_parent_owner_fk FOREIGN KEY (parent_decision_id, profile_id)
    REFERENCES public.decisions (id, profile_id) ON DELETE SET NULL (parent_decision_id),
  CONSTRAINT decision_workspaces_support_object CHECK (jsonb_typeof(support) = 'object'),
  CONSTRAINT decision_workspaces_support_size CHECK (pg_column_size(support) <= 400000),
  CONSTRAINT decision_workspaces_version_positive CHECK (version > 0),
  CONSTRAINT decision_workspaces_provenance CHECK (provenance IN ('account', 'imported_browser_notes')),
  CONSTRAINT decision_workspaces_not_own_parent CHECK (parent_decision_id IS NULL OR parent_decision_id <> decision_id)
);
CREATE INDEX IF NOT EXISTS idx_decision_workspaces_profile ON public.decision_workspaces (profile_id);
CREATE INDEX IF NOT EXISTS idx_decision_workspaces_parent ON public.decision_workspaces (parent_decision_id) WHERE parent_decision_id IS NOT NULL;

-- Server-side history rules: a recorded snapshot never changes, reviews are append-only, the parent link and
-- ownership are fixed, and every update advances the version by exactly one.
CREATE OR REPLACE FUNCTION public.decision_workspace_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  old_reviews jsonb; new_reviews jsonb; i integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1; NEW.created_at := now(); NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF NEW.decision_id IS DISTINCT FROM OLD.decision_id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    RAISE EXCEPTION 'decision workspace ownership cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.parent_decision_id IS NOT NULL AND NEW.parent_decision_id IS DISTINCT FROM OLD.parent_decision_id THEN
    RAISE EXCEPTION 'reconsideration link cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'decision workspace version must advance by one' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(OLD.support -> 'snapshot', 'null'::jsonb) <> 'null'::jsonb
     AND NEW.support -> 'snapshot' IS DISTINCT FROM OLD.support -> 'snapshot' THEN
    RAISE EXCEPTION 'a recorded choice snapshot cannot change' USING ERRCODE = 'check_violation';
  END IF;
  old_reviews := COALESCE(OLD.support -> 'reviews', '[]'::jsonb);
  new_reviews := COALESCE(NEW.support -> 'reviews', '[]'::jsonb);
  IF jsonb_typeof(old_reviews) = 'array' THEN
    IF jsonb_typeof(new_reviews) <> 'array' OR jsonb_array_length(new_reviews) < jsonb_array_length(old_reviews) THEN
      RAISE EXCEPTION 'reviews are append-only' USING ERRCODE = 'check_violation';
    END IF;
    FOR i IN 0 .. jsonb_array_length(old_reviews) - 1 LOOP
      IF new_reviews -> i IS DISTINCT FROM old_reviews -> i THEN
        RAISE EXCEPTION 'reviews are append-only' USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_decision_workspace_guard ON public.decision_workspaces;
CREATE TRIGGER trg_decision_workspace_guard BEFORE INSERT OR UPDATE ON public.decision_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.decision_workspace_guard();

ALTER TABLE public.decision_workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "decision_workspaces: owner read" ON public.decision_workspaces;
DROP POLICY IF EXISTS "decision_workspaces: owner insert" ON public.decision_workspaces;
DROP POLICY IF EXISTS "decision_workspaces: owner update" ON public.decision_workspaces;
CREATE POLICY "decision_workspaces: owner read" ON public.decision_workspaces
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = profile_id);
CREATE POLICY "decision_workspaces: owner insert" ON public.decision_workspaces
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = profile_id);
CREATE POLICY "decision_workspaces: owner update" ON public.decision_workspaces
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = profile_id) WITH CHECK ((SELECT auth.uid()) = profile_id);
-- No delete policy: a workspace is removed only with its decision (ON DELETE CASCADE).

-- ─── 2. Advisor conversation ↔ context association ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.advisor_context_links (
  session_id   uuid PRIMARY KEY,
  profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  context_kind text NOT NULL,
  context_id   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT advisor_context_links_session_owner_fk FOREIGN KEY (session_id, profile_id)
    REFERENCES public.advisor_sessions (id, profile_id) ON DELETE CASCADE,
  CONSTRAINT advisor_context_links_kind CHECK (context_kind IN ('decision', 'signal', 'strategy'))
);
CREATE INDEX IF NOT EXISTS idx_advisor_context_links_context ON public.advisor_context_links (profile_id, context_kind, context_id);

-- The context must belong to the same account (decisions/strategies by owner, signals by the account's link).
CREATE OR REPLACE FUNCTION public.advisor_context_link_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id) THEN
    RAISE EXCEPTION 'conversation ownership cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.context_kind = 'decision' AND NOT EXISTS (SELECT 1 FROM public.decisions WHERE id = NEW.context_id AND profile_id = NEW.profile_id)
     OR NEW.context_kind = 'strategy' AND NOT EXISTS (SELECT 1 FROM public.strategies WHERE id = NEW.context_id AND profile_id = NEW.profile_id)
     OR NEW.context_kind = 'signal' AND NOT EXISTS (SELECT 1 FROM public.signal_triages WHERE signal_id = NEW.context_id AND profile_id = NEW.profile_id) THEN
    RAISE EXCEPTION 'conversation context is not in this account' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN NEW.created_at := now(); ELSE NEW.created_at := OLD.created_at; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_advisor_context_link_guard ON public.advisor_context_links;
CREATE TRIGGER trg_advisor_context_link_guard BEFORE INSERT OR UPDATE ON public.advisor_context_links
  FOR EACH ROW EXECUTE FUNCTION public.advisor_context_link_guard();

ALTER TABLE public.advisor_context_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advisor_context_links: owner read" ON public.advisor_context_links;
DROP POLICY IF EXISTS "advisor_context_links: owner insert" ON public.advisor_context_links;
DROP POLICY IF EXISTS "advisor_context_links: owner update" ON public.advisor_context_links;
DROP POLICY IF EXISTS "advisor_context_links: owner delete" ON public.advisor_context_links;
CREATE POLICY "advisor_context_links: owner read" ON public.advisor_context_links
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = profile_id);
CREATE POLICY "advisor_context_links: owner insert" ON public.advisor_context_links
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = profile_id);
CREATE POLICY "advisor_context_links: owner update" ON public.advisor_context_links
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = profile_id) WITH CHECK ((SELECT auth.uid()) = profile_id);
CREATE POLICY "advisor_context_links: owner delete" ON public.advisor_context_links
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = profile_id);

-- ─── 3. Signal preferences (Watch, acknowledged revision, dismissal) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.signal_preferences (
  profile_id            uuid NOT NULL,
  signal_id             uuid NOT NULL,
  watching              boolean NOT NULL DEFAULT false,
  watch_baseline        text,
  acknowledged_revision text,
  dismissed             boolean NOT NULL DEFAULT false,
  version               integer NOT NULL DEFAULT 1,
  provenance            text NOT NULL DEFAULT 'account',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, signal_id),
  CONSTRAINT signal_preferences_account_link_fk FOREIGN KEY (signal_id, profile_id)
    REFERENCES public.signal_triages (signal_id, profile_id) ON DELETE CASCADE,
  CONSTRAINT signal_preferences_baseline_length CHECK (watch_baseline IS NULL OR char_length(watch_baseline) <= 200),
  CONSTRAINT signal_preferences_ack_length CHECK (acknowledged_revision IS NULL OR char_length(acknowledged_revision) <= 200),
  CONSTRAINT signal_preferences_version_positive CHECK (version > 0),
  CONSTRAINT signal_preferences_provenance CHECK (provenance IN ('account', 'imported_browser_notes'))
);

CREATE OR REPLACE FUNCTION public.signal_preference_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1; NEW.created_at := now(); NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.signal_id IS DISTINCT FROM OLD.signal_id THEN
    RAISE EXCEPTION 'signal preference ownership cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'signal preference version must advance by one' USING ERRCODE = 'check_violation';
  END IF;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_signal_preference_guard ON public.signal_preferences;
CREATE TRIGGER trg_signal_preference_guard BEFORE INSERT OR UPDATE ON public.signal_preferences
  FOR EACH ROW EXECUTE FUNCTION public.signal_preference_guard();

ALTER TABLE public.signal_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signal_preferences: owner read" ON public.signal_preferences;
DROP POLICY IF EXISTS "signal_preferences: owner insert" ON public.signal_preferences;
DROP POLICY IF EXISTS "signal_preferences: owner update" ON public.signal_preferences;
CREATE POLICY "signal_preferences: owner read" ON public.signal_preferences
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = profile_id);
CREATE POLICY "signal_preferences: owner insert" ON public.signal_preferences
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = profile_id);
CREATE POLICY "signal_preferences: owner update" ON public.signal_preferences
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = profile_id) WITH CHECK ((SELECT auth.uid()) = profile_id);
-- No delete policy: "restore" and "stop watching" are updates, so the history of a preference row is kept.

-- ─── 4. Atomic decision + workspace save (compare-and-set on both versions) ──────────────────────────────
-- SECURITY INVOKER: runs under the caller's row-level security; it can only see and change the caller's rows.
-- Lifecycle rules (choice requires a reason, recorded choices are not reopened, …) are validated by the API
-- before calling; the trigger above enforces the history rules even if a caller skips the API.
CREATE OR REPLACE FUNCTION public.save_decision_workspace(
  p_decision_id uuid,
  p_expected_decision_updated_at timestamptz,
  p_expected_workspace_version integer,
  p_core jsonb,
  p_support jsonb,
  p_parent_decision_id uuid DEFAULT NULL,
  p_provenance text DEFAULT 'account'
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := auth.uid();
  d public.decisions%ROWTYPE;
  w public.decision_workspaces%ROWTYPE;
  has_core boolean := p_core IS NOT NULL AND jsonb_typeof(p_core) = 'object' AND p_core <> '{}'::jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauthenticated');
  END IF;
  SELECT * INTO d FROM public.decisions WHERE id = p_decision_id AND profile_id = uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF d.updated_at IS DISTINCT FROM p_expected_decision_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'conflict', 'decision', to_jsonb(d));
  END IF;
  SELECT * INTO w FROM public.decision_workspaces WHERE decision_id = p_decision_id FOR UPDATE;
  IF COALESCE(w.version, 0) IS DISTINCT FROM COALESCE(p_expected_workspace_version, 0) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'conflict', 'workspaceVersion', COALESCE(w.version, 0));
  END IF;

  IF has_core THEN
    UPDATE public.decisions SET
      title                   = CASE WHEN p_core ? 'title' THEN p_core ->> 'title' ELSE title END,
      description             = CASE WHEN p_core ? 'description' THEN p_core ->> 'description' ELSE description END,
      rationale               = CASE WHEN p_core ? 'rationale' THEN COALESCE(p_core ->> 'rationale', '') ELSE rationale END,
      known_context           = CASE WHEN p_core ? 'known_context' THEN p_core ->> 'known_context' ELSE known_context END,
      open_questions          = CASE WHEN p_core ? 'open_questions' THEN p_core ->> 'open_questions' ELSE open_questions END,
      deadline                = CASE WHEN p_core ? 'deadline' THEN NULLIF(p_core ->> 'deadline', '')::timestamptz ELSE deadline END,
      alternatives_considered = CASE WHEN p_core ? 'alternatives_considered' THEN p_core -> 'alternatives_considered' ELSE alternatives_considered END,
      status                  = CASE WHEN p_core ? 'status' THEN p_core ->> 'status' ELSE status END,
      actual_outcome          = CASE WHEN p_core ? 'actual_outcome' THEN p_core ->> 'actual_outcome' ELSE actual_outcome END,
      outcome_reviewed_at     = CASE WHEN p_core ? 'actual_outcome' THEN now() ELSE outcome_reviewed_at END,
      updated_at              = now()
    WHERE id = p_decision_id AND profile_id = uid
    RETURNING * INTO d;
  END IF;

  IF p_support IS NOT NULL THEN
    IF w.decision_id IS NULL THEN
      INSERT INTO public.decision_workspaces (decision_id, profile_id, support, parent_decision_id, provenance)
      VALUES (p_decision_id, uid, p_support, p_parent_decision_id, COALESCE(p_provenance, 'account'))
      RETURNING * INTO w;
    ELSE
      UPDATE public.decision_workspaces
         SET support = p_support,
             version = w.version + 1,
             parent_decision_id = COALESCE(w.parent_decision_id, p_parent_decision_id)
       WHERE decision_id = p_decision_id
      RETURNING * INTO w;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'decision', to_jsonb(d), 'workspace',
    CASE WHEN w.decision_id IS NULL THEN NULL ELSE to_jsonb(w) END);
END $$;

-- ─── Grants (Supabase default privileges would otherwise expose new tables to anon) ──────────────────────
REVOKE ALL ON public.decision_workspaces, public.advisor_context_links, public.signal_preferences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.decision_workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advisor_context_links TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.signal_preferences TO authenticated;
GRANT ALL ON public.decision_workspaces, public.advisor_context_links, public.signal_preferences TO service_role;

REVOKE ALL ON FUNCTION public.save_decision_workspace(uuid, timestamptz, integer, jsonb, jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_decision_workspace(uuid, timestamptz, integer, jsonb, jsonb, uuid, text) TO authenticated, service_role;
-- Trigger functions are not callable as RPCs by browser roles.
REVOKE ALL ON FUNCTION public.decision_workspace_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advisor_context_link_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.signal_preference_guard() FROM PUBLIC, anon, authenticated;

COMMIT;
