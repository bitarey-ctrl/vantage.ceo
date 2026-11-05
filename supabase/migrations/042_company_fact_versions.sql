-- 042_company_fact_versions.sql
-- Database-enforced protection for Advisor memory updates across DIFFERENT questions. Requires 041.
--
-- 1. Every change to a tracked ceo_context field, from any write path (Advisor, profile page, intake, SQL), bumps a
--    per-field version and appends the old and new values to company_fact_history (a trigger, so nothing can skip it).
-- 2. apply_advisor_memory() applies one claimed Advisor update in a single transaction:
--      - the caller must still hold an unexpired claim (claim token + lease, row locked) — a worker that lost or
--        outlived its claim cannot write;
--      - for fields that are SET (product, customers, priority, revenue band), the answer must have been generated
--        against the field's current version; if the field changed since (a newer correction or another proposal),
--        the update is stored as an unresolved 'conflict' — nothing is overwritten and no winner is picked;
--      - for fields that are APPENDED (competitors, notes), the value must be computed from the current version
--        ('retry' otherwise), so two questions adding different items never lose one;
--      - the update, the version bump, the history row and the claim's final state commit together.
-- Additive: new tables, a trigger, a function, and an extended status list on advisor_memory_ops (via a new
-- constraint; 041's file is unchanged). Writes to the new tables come only from the trigger and the function.
--
-- Rollback (manual):
--   DROP FUNCTION IF EXISTS public.apply_advisor_memory(uuid, uuid, text, uuid, text, jsonb, bigint);
--   DROP TRIGGER IF EXISTS ceo_context_fact_versions ON public.ceo_context;
--   DROP FUNCTION IF EXISTS public.track_company_fact_versions();
--   DROP TABLE IF EXISTS public.company_fact_history, public.company_fact_versions;
--   ALTER TABLE public.advisor_memory_ops DROP COLUMN IF EXISTS based_on_version, DROP COLUMN IF EXISTS conflict;

CREATE TABLE IF NOT EXISTS public.company_fact_versions (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  field      text NOT NULL,
  version    bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, field)
);

CREATE TABLE IF NOT EXISTS public.company_fact_history (
  id         bigserial PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  field      text NOT NULL,
  version    bigint NOT NULL,
  old_value  jsonb,
  new_value  jsonb,
  source     text NOT NULL DEFAULT 'direct',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_fact_history_profile_idx ON public.company_fact_history (profile_id, field, created_at DESC);

ALTER TABLE public.company_fact_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_fact_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_fact_versions: owner read" ON public.company_fact_versions;
CREATE POLICY "company_fact_versions: owner read" ON public.company_fact_versions FOR SELECT USING (auth.uid() = profile_id);
DROP POLICY IF EXISTS "company_fact_history: owner read" ON public.company_fact_history;
CREATE POLICY "company_fact_history: owner read" ON public.company_fact_history FOR SELECT USING (auth.uid() = profile_id);

-- Version + history for every tracked field change, whatever wrote it.
CREATE OR REPLACE FUNCTION public.track_company_fact_versions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f text;
  old_v jsonb;
  new_v jsonb;
  v bigint;
  src text := coalesce(nullif(current_setting('vantage.fact_source', true), ''), 'direct');
BEGIN
  FOREACH f IN ARRAY ARRAY['product_description','target_customer','top_priority','top_priority_other','arr_band','competitors','additional_context','revenue_model','geography_detail','strategic_priorities','avoided_decision'] LOOP
    new_v := to_jsonb(NEW) -> f;
    old_v := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) -> f END;
    IF new_v IS DISTINCT FROM old_v THEN
      INSERT INTO public.company_fact_versions AS cv (profile_id, field, version, updated_at)
        VALUES (NEW.profile_id, f, 1, now())
        ON CONFLICT (profile_id, field) DO UPDATE SET version = cv.version + 1, updated_at = now()
        RETURNING version INTO v;
      INSERT INTO public.company_fact_history (profile_id, field, version, old_value, new_value, source)
        VALUES (NEW.profile_id, f, v, old_v, new_v, src);
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ceo_context_fact_versions ON public.ceo_context;
CREATE TRIGGER ceo_context_fact_versions AFTER INSERT OR UPDATE ON public.ceo_context
  FOR EACH ROW EXECUTE FUNCTION public.track_company_fact_versions();

-- Claims record which version of the field the answer was written against, and any unresolved conflict.
ALTER TABLE public.advisor_memory_ops ADD COLUMN IF NOT EXISTS based_on_version bigint;
ALTER TABLE public.advisor_memory_ops ADD COLUMN IF NOT EXISTS conflict jsonb;
ALTER TABLE public.advisor_memory_ops DROP CONSTRAINT IF EXISTS advisor_memory_ops_status_check;
ALTER TABLE public.advisor_memory_ops ADD CONSTRAINT advisor_memory_ops_status_check
  CHECK (status IN ('claimed', 'applied', 'failed', 'rejected', 'conflict'));

CREATE OR REPLACE FUNCTION public.apply_advisor_memory(
  p_profile uuid, p_session uuid, p_turn text, p_token uuid, p_field text, p_value jsonb, p_expected_version bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  op public.advisor_memory_ops%ROWTYPE;
  cur bigint;
  appended boolean := p_field IN ('competitors', 'additional_context');
BEGIN
  SELECT * INTO op FROM public.advisor_memory_ops
    WHERE profile_id = p_profile AND session_id = p_session AND turn_id = p_turn FOR UPDATE;
  IF NOT FOUND OR op.claim_token <> p_token OR op.status <> 'claimed' OR op.lease_until < now() THEN
    RETURN jsonb_build_object('result', 'lost_claim');
  END IF;
  IF op.field <> p_field THEN
    RETURN jsonb_build_object('result', 'rejected', 'error', 'field does not match the claim');
  END IF;

  INSERT INTO public.company_fact_versions (profile_id, field, version) VALUES (p_profile, p_field, 0)
    ON CONFLICT (profile_id, field) DO NOTHING;
  SELECT version INTO cur FROM public.company_fact_versions WHERE profile_id = p_profile AND field = p_field FOR UPDATE;

  IF NOT appended AND cur <> coalesce(op.based_on_version, 0) THEN
    UPDATE public.advisor_memory_ops SET status = 'conflict', updated_at = now(),
      conflict = jsonb_build_object('based_on_version', op.based_on_version, 'current_version', cur, 'proposed', p_value)
      WHERE profile_id = p_profile AND session_id = p_session AND turn_id = p_turn;
    RETURN jsonb_build_object('result', 'conflict', 'current_version', cur);
  END IF;
  IF cur <> p_expected_version THEN
    RETURN jsonb_build_object('result', 'retry', 'current_version', cur);
  END IF;

  PERFORM set_config('vantage.fact_source', 'advisor:' || p_session || ':' || p_turn, true);
  CASE p_field
    WHEN 'product_description' THEN UPDATE public.ceo_context SET product_description = p_value #>> '{}' WHERE profile_id = p_profile;
    WHEN 'target_customer'     THEN UPDATE public.ceo_context SET target_customer = p_value #>> '{}' WHERE profile_id = p_profile;
    WHEN 'top_priority'        THEN UPDATE public.ceo_context SET top_priority = p_value #>> '{}', top_priority_other = NULL WHERE profile_id = p_profile;
    WHEN 'arr_band'            THEN UPDATE public.ceo_context SET arr_band = p_value #>> '{}' WHERE profile_id = p_profile;
    WHEN 'competitors'         THEN UPDATE public.ceo_context SET competitors = p_value WHERE profile_id = p_profile;
    WHEN 'additional_context'  THEN UPDATE public.ceo_context SET additional_context = p_value #>> '{}' WHERE profile_id = p_profile;
    ELSE RETURN jsonb_build_object('result', 'rejected', 'error', 'field not allowed');
  END CASE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'retry', 'current_version', cur);
  END IF;
  UPDATE public.advisor_memory_ops SET status = 'applied', saved_value = p_value::text, updated_at = now()
    WHERE profile_id = p_profile AND session_id = p_session AND turn_id = p_turn;
  RETURN jsonb_build_object('result', 'applied', 'version', cur + 1);
END $$;

REVOKE ALL ON FUNCTION public.apply_advisor_memory(uuid, uuid, text, uuid, text, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_advisor_memory(uuid, uuid, text, uuid, text, jsonb, bigint) TO service_role;
REVOKE ALL ON FUNCTION public.track_company_fact_versions() FROM PUBLIC, anon, authenticated;
