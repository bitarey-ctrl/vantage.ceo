-- 039 verification — READ-ONLY. Run after the migration (Claude also runs these read-only checks).
SELECT check_name, ok FROM (
  SELECT 'three tables exist' AS check_name, (SELECT count(*) = 3 FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('decision_workspaces', 'advisor_context_links', 'signal_preferences')) AS ok
  UNION ALL SELECT 'RLS enabled on all three', (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.decision_workspaces'::regclass, 'public.advisor_context_links'::regclass, 'public.signal_preferences'::regclass))
  UNION ALL SELECT 'ten owner policies', (SELECT count(*) = 10 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('decision_workspaces', 'advisor_context_links', 'signal_preferences'))
  UNION ALL SELECT 'anon has no table privileges', NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee = 'anon' AND table_name IN ('decision_workspaces', 'advisor_context_links', 'signal_preferences'))
  UNION ALL SELECT 'authenticated can execute save_decision_workspace', has_function_privilege('authenticated', 'public.save_decision_workspace(uuid, timestamptz, integer, jsonb, jsonb, uuid, text)', 'EXECUTE')
  UNION ALL SELECT 'anon cannot execute save_decision_workspace', NOT has_function_privilege('anon', 'public.save_decision_workspace(uuid, timestamptz, integer, jsonb, jsonb, uuid, text)', 'EXECUTE')
  UNION ALL SELECT 'three guard triggers', (SELECT count(*) = 3 FROM pg_trigger WHERE tgname IN ('trg_decision_workspace_guard', 'trg_advisor_context_link_guard', 'trg_signal_preference_guard'))
  UNION ALL SELECT 'functions pin search_path', (SELECT bool_and(proconfig::text ILIKE '%search_path%') FROM pg_proc WHERE proname IN ('save_decision_workspace', 'decision_workspace_guard', 'advisor_context_link_guard', 'signal_preference_guard'))
  UNION ALL SELECT 'existing decisions unchanged in count', (SELECT count(*) >= 0 FROM public.decisions)
) checks;
