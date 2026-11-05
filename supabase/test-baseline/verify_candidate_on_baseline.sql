-- DISPOSABLE DATABASE ONLY. Run after production_schema_2026-11-05.sql and then migrations 040, 041, 042, 043, 044
-- (in that order; 039 is already part of the production baseline). Creates two synthetic accounts and checks
-- account isolation, function privileges and the fact-version trigger AS REAL `authenticated` SESSIONS.
-- Any failed check raises an exception and stops the script. The last statement reports the shared-signal policy
-- as it is in production (readable by every signed-in user) — that is a reported finding, not a pass/fail check.
-- Refuses to run on production.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email NOT LIKE '%@vantage.invalid') THEN
    RAISE EXCEPTION 'This database has non-test profiles. Refusing to run (disposable baseline only).';
  END IF;
END $$;

-- Two synthetic accounts (auth.users → handle_new_user → profiles, as in production).
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES ('aaaaaaaa-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'base-a@vantage.invalid', '{}', now(), now()),
       ('bbbbbbbb-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'base-b@vantage.invalid', '{}', now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.ceo_context (profile_id, product_description, business_facts)
VALUES ('aaaaaaaa-0000-4000-8000-00000000000a', 'A secret product', '{"constraints":[{"text":"About three months of cash left"}]}'),
       ('bbbbbbbb-0000-4000-8000-00000000000b', 'B product', '{}')
ON CONFLICT (profile_id) DO UPDATE SET business_facts = EXCLUDED.business_facts;
INSERT INTO public.company_sources (profile_id, url, kind) VALUES ('aaaaaaaa-0000-4000-8000-00000000000a', 'https://a.example/news', 'company') ON CONFLICT DO NOTHING;
INSERT INTO public.advisor_sessions (id, profile_id, title, messages) VALUES ('cccccccc-0000-4000-8000-00000000000c', 'aaaaaaaa-0000-4000-8000-00000000000a', 'baseline', '[]') ON CONFLICT DO NOTHING;
INSERT INTO public.advisor_memory_ops (profile_id, session_id, turn_id, field, value, lease_until)
VALUES ('aaaaaaaa-0000-4000-8000-00000000000a', 'cccccccc-0000-4000-8000-00000000000c', 'turn-baseline1', 'competitors', 'Acme', now() + interval '1 minute') ON CONFLICT DO NOTHING;

-- 1. The fact-version trigger records the insert above (042 + 044: JSON null is not a change).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.company_fact_versions WHERE profile_id = 'aaaaaaaa-0000-4000-8000-00000000000a' AND field = 'product_description') THEN
    RAISE EXCEPTION 'FAIL 1: no fact version recorded for product_description';
  END IF;
  IF EXISTS (SELECT 1 FROM public.company_fact_history WHERE profile_id = 'aaaaaaaa-0000-4000-8000-00000000000a' AND field = 'target_customer') THEN
    RAISE EXCEPTION 'FAIL 1: an empty (JSON-null) column was recorded as a change';
  END IF;
END $$;

-- 2. As account B: none of account A's private rows are visible, and A's context cannot be changed.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true);
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.ceo_context WHERE profile_id = 'aaaaaaaa-0000-4000-8000-00000000000a'; IF n <> 0 THEN RAISE EXCEPTION 'FAIL 2: B reads A ceo_context'; END IF;
  SELECT count(*) INTO n FROM public.company_sources WHERE profile_id = 'aaaaaaaa-0000-4000-8000-00000000000a'; IF n <> 0 THEN RAISE EXCEPTION 'FAIL 2: B reads A company_sources'; END IF;
  SELECT count(*) INTO n FROM public.advisor_memory_ops WHERE profile_id = 'aaaaaaaa-0000-4000-8000-00000000000a'; IF n <> 0 THEN RAISE EXCEPTION 'FAIL 2: B reads A advisor_memory_ops'; END IF;
  SELECT count(*) INTO n FROM public.company_fact_versions WHERE profile_id = 'aaaaaaaa-0000-4000-8000-00000000000a'; IF n <> 0 THEN RAISE EXCEPTION 'FAIL 2: B reads A fact versions'; END IF;
  SELECT count(*) INTO n FROM public.company_fact_history WHERE profile_id = 'aaaaaaaa-0000-4000-8000-00000000000a'; IF n <> 0 THEN RAISE EXCEPTION 'FAIL 2: B reads A fact history'; END IF;
  UPDATE public.ceo_context SET product_description = 'hijacked' WHERE profile_id = 'aaaaaaaa-0000-4000-8000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'FAIL 2: B updated A ceo_context'; END IF;
END $$;
COMMIT;

-- 3. A signed-in user cannot call the memory function or write the service-only tables (even for themselves).
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);
DO $$ BEGIN
  BEGIN
    PERFORM public.apply_advisor_memory('aaaaaaaa-0000-4000-8000-00000000000a', gen_random_uuid(), 't', gen_random_uuid(), 'competitors', '"x"'::jsonb, 0);
    RAISE EXCEPTION 'FAIL 3: authenticated may execute apply_advisor_memory';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.advisor_memory_ops (profile_id, session_id, turn_id, field, value, lease_until) VALUES ('aaaaaaaa-0000-4000-8000-00000000000a', 'cccccccc-0000-4000-8000-00000000000c', 'turn-forged01', 'competitors', 'x', now());
    RAISE EXCEPTION 'FAIL 3: authenticated may insert advisor_memory_ops';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.company_fact_versions (profile_id, field, version) VALUES ('aaaaaaaa-0000-4000-8000-00000000000a', 'competitors', 999);
    RAISE EXCEPTION 'FAIL 3: authenticated may insert company_fact_versions';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
COMMIT;

-- 4. Owner can still read their own rows (the policies are not simply "deny all").
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.company_sources; IF n <> 1 THEN RAISE EXCEPTION 'FAIL 4: owner sees % company_sources rows', n; END IF;
  SELECT count(*) INTO n FROM public.ceo_context; IF n <> 1 THEN RAISE EXCEPTION 'FAIL 4: owner sees % ceo_context rows', n; END IF;
END $$;
COMMIT;

-- 5. Reported, not asserted: in production every signed-in user can read every shared signal row.
SELECT 'finding: shared signals readable by any signed-in user' AS check,
       (SELECT string_agg(policyname || ' USING ' || coalesce(qual, ''), ' | ') FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signals' AND cmd = 'SELECT') AS production_policy;

SELECT 'all assertions passed' AS result;
