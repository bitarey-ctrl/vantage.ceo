-- Read-only production preflight before migrations 040–045. Catalog only: reads no customer rows, changes nothing.
-- Production does not record these numbered files in supabase_migrations (they were applied by hand), so this checks
-- the catalog itself, category by category, by exact content (a hash of every row), not by totals.
--
-- Expected values below were read from production on 2026-11-07. Categories 1–7 are identical to the production
-- snapshot taken on 2026-11-05 for the rehearsal (scratchpad schema-snap.json), so production has not drifted since.
-- Any different hash, or any 040–045 object already present (query 2), means stop and compare before applying.
--
-- About the grant totals 90 and 413 (same grants, three ways of counting them):
--   413 = one row per privilege for anon + authenticated (59 table/role pairs × 7 privileges each).
--    59 = one row per table/role pair for anon + authenticated (31 tables × 2 roles, minus 3 tables where anon
--         already has no grant: advisor_context_links, decision_workspaces, signal_preferences, from 039).
--    90 = the rehearsal's count: table/role pairs including service_role (59 + 31).
-- No mismatch. Pre-existing, unchanged by 040–044: anon and authenticated hold all 7 table privileges on every other
-- public table (the Supabase default; row-level security limits rows, and the REST API offers no TRUNCATE). 045
-- removes them on signals, signal_triages and consequences.
-- Elevated-rights (SECURITY DEFINER) app functions executable by anon/authenticated: handle_new_user() (returns
-- trigger) and rls_auto_enable() (returns event_trigger; backs the ensure_rls event trigger). Postgres refuses direct
-- calls to both, so neither can be invoked through the API. Harmless.

-- 1. Exact catalog content per category.
with k as (
  select 'grant' kind, table_name || ':' || grantee || ':' || string_agg(privilege_type, ',' order by privilege_type) key
    from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') group by table_name, grantee
  union all select 'service_grant', table_name || ':' || grantee || ':' || string_agg(privilege_type, ',' order by privilege_type)
    from information_schema.role_table_grants where table_schema = 'public' and grantee = 'service_role' group by table_name, grantee
  union all select 'fn', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || p.prosecdef from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all select 'fn_exec', routine_name || ':' || specific_name || ':' || grantee from information_schema.role_routine_grants
    where routine_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type = 'EXECUTE'
  union all select 'pol', tablename || '.' || policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '')
    from pg_policies where schemaname = 'public'
  union all select 'rls', c.relname || ':' || c.relrowsecurity from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  union all select 'trg', event_object_table || '.' || trigger_name || ':' || action_timing || ' ' || event_manipulation from information_schema.triggers where trigger_schema = 'public'
  union all select 'idx', tablename || '.' || indexname from pg_indexes where schemaname = 'public'
  union all select 'col', table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '') from information_schema.columns where table_schema = 'public'
  union all select 'con', conrelid::regclass::text || '.' || conname::text || ':' || contype::text || ':' || pg_get_constraintdef(c.oid) from pg_constraint c where c.connamespace = 'public'::regnamespace
)
select kind, count(*) as n, md5(string_agg(key, E'\n' order by key collate "C")) as md5 from k group by kind order by kind;
-- Expected (2026-11-07):
--   col           359  ddbac8b1872480b492ec1fb7747dbf2d   (= 2026-11-05 snapshot)
--   con           102  b9f60bd358dd9fb7e01048840ecfc2ef
--   fn            125  5f4dee13bf1160dbe26d324fe096b8d0   (= snapshot)
--   fn_exec       243  f9f29090ed82654298945496368921db
--   grant          59  2f3cb5bf536309da80ad464a6e09ddb1   (= snapshot)
--   idx            87  b718d016bf4810c07e6d63431cd7c24b   (= snapshot)
--   pol            42  0ea01e1fded388c1ff4e892c82ac89bd   (= snapshot)
--   rls            31  442f227934f746953c7bf21739b3edfc   (= snapshot)
--   service_grant  31  48ec73aff6083d8b99c533827aaa9b51
--   trg            14  58b3b37ba93fe09319ab4af1c88fb45d   (= snapshot)

-- 2. None of the 040–045 objects may exist yet.
select
  (select array_agg(t order by t) from unnest(array['source_collection_runs', 'company_sources', 'company_research_runs', 'advisor_memory_ops', 'company_fact_versions', 'company_fact_history']) t
     where to_regclass('public.' || t) is not null) as new_tables_already_present,                         -- expected NULL
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'ceo_context'
     and column_name in ('business_facts', 'decision_style', 'risk_tolerance')) as new_columns_already_present,  -- expected 0
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'signals' and policyname = 'signals: authenticated read') as pre045_signals_policy;  -- expected 1

-- 3. Elevated-rights functions callable by API roles (expected exactly the two harmless rows described above).
select p.proname, pg_get_function_result(p.oid) as returns, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
order by 1;
