-- 044_fact_version_null_fix.sql
-- Fix for 042 found on the isolated database: to_jsonb(NEW)->field is JSON null for an empty column, while the
-- INSERT branch used SQL NULL for the old value, so inserting a ceo_context row counted every empty field as a
-- change (version 1 and a "null → null" history row for each). Treat JSON null as no value. Requires 042.
-- Replaces the trigger function only; no table or row is changed. Rollback: re-run the function from 042.
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
    new_v := nullif(to_jsonb(NEW) -> f, 'null'::jsonb);
    old_v := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE nullif(to_jsonb(OLD) -> f, 'null'::jsonb) END;
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
REVOKE ALL ON FUNCTION public.track_company_fact_versions() FROM PUBLIC, anon, authenticated;
