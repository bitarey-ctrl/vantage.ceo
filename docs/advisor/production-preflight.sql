-- Read-only production preflight before migrations 040–045. Catalog only: reads no customer rows, changes nothing.
-- Production does not record these numbered files in supabase_migrations (they were applied by hand), so this checks objects.
-- Expected (production, read 2026-11-07, matching the rehearsed baseline in FINAL_VERIFICATION_2026-11-06.md):
--   columns 359, constraints 102, indexes 87, policies 42, rls_tables 31, trigger_events 14,
--   new_tables_already_present NULL, new_columns_already_present 0.
--   grants_to_users 413 on 2026-11-07. This counts per privilege, unlike the rehearsal's grant fingerprint (90), so
--   compare it with 413, not 90.
-- Any difference, or any 040–045 object already present, means stop and compare before applying anything.
select
  (select count(*) from information_schema.columns where table_schema = 'public') as columns,
  (select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public') as constraints,
  (select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')) as grants_to_users,
  (select count(*) from pg_indexes where schemaname = 'public') as indexes,
  (select count(*) from pg_policies where schemaname = 'public') as policies,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity) as rls_tables,
  (select count(*) from information_schema.triggers where trigger_schema = 'public') as trigger_events,
  (select array_agg(t order by t) from unnest(array['source_collection_runs', 'company_sources', 'company_research_runs', 'advisor_memory_ops', 'company_fact_versions', 'company_fact_history']) t
     where to_regclass('public.' || t) is not null) as new_tables_already_present,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'ceo_context' and column_name in ('business_facts', 'decision_style', 'risk_tolerance')) as new_columns_already_present;
