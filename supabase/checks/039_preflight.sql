-- 039 preflight — READ-ONLY. Run in the Supabase SQL editor of odahuetnflsqkligzwpm BEFORE 039_account_workspace.sql.
-- Every row must say ok = true. Any false row: stop and send the result; do not run the migration.
SELECT check_name, ok, detail FROM (
  SELECT 'decisions has id/profile_id/updated_at' AS check_name,
         (SELECT count(*) = 3 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'decisions' AND column_name IN ('id', 'profile_id', 'updated_at')) AS ok, '' AS detail
  UNION ALL SELECT 'advisor_sessions has id/profile_id',
         (SELECT count(*) = 2 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'advisor_sessions' AND column_name IN ('id', 'profile_id')), ''
  UNION ALL SELECT 'signal_triages unique (signal_id, profile_id) exists',
         EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'signal_triages' AND indexdef ILIKE '%UNIQUE%(signal_id, profile_id)%'), ''
  UNION ALL SELECT 'no decision has a NULL owner',
         NOT EXISTS (SELECT 1 FROM public.decisions WHERE profile_id IS NULL), ''
  UNION ALL SELECT 'no advisor session has a NULL owner',
         NOT EXISTS (SELECT 1 FROM public.advisor_sessions WHERE profile_id IS NULL), ''
  UNION ALL SELECT 'new tables do not exist yet (or are from an earlier 039 run)',
         (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('decision_workspaces', 'advisor_context_links', 'signal_preferences')) IN (0, 3),
         (SELECT string_agg(table_name, ', ') FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('decision_workspaces', 'advisor_context_links', 'signal_preferences'))
  UNION ALL SELECT 'server version supports ON DELETE SET NULL (column)',
         current_setting('server_version_num')::int >= 150000, current_setting('server_version')
) checks;
