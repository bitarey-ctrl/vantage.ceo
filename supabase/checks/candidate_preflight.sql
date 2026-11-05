-- Read-only preflight for the full candidate (039–043). Run BEFORE applying anything. Changes nothing.
-- Reports which required objects exist and catches the conflicting 040 from codex/quality-foundation
-- (040_company_foundation.sql also creates company_research_runs, with a different shape).
select 'database' as check, current_database() as value
union all select 'table:' || t, case when to_regclass('public.' || t) is null then 'missing' else 'present' end
  from unnest(array['profiles','ceo_context','advisor_sessions','signals','signal_triages','consequences','feature_events','decisions',
                    'decision_workspaces','advisor_context_links','signal_preferences',            -- 039
                    'company_sources','company_research_runs','source_collection_runs',             -- 040 (ours)
                    'advisor_memory_ops',                                                           -- 041
                    'company_fact_versions','company_fact_history',                                 -- 042
                    'company_context_versions','company_signal_records','company_research_usage'    -- conflicting 040 (must be absent or reviewed)
                   ]) t
union all select 'column:' || c, case when exists (select 1 from information_schema.columns where table_schema='public' and table_name=split_part(c,'.',1) and column_name=split_part(c,'.',2)) then 'present' else 'missing' end
  from unnest(array['company_research_runs.queries','company_research_runs.retrieved','company_research_runs.proposals',  -- ours vs conflicting shape
                    'ceo_context.business_facts','consequences.context_version','consequences.superseded_at',
                    'ceo_context.top_priority_other','ceo_context.additional_context','ceo_context.arr_band',             -- 024/031/032 (042 trigger reads them)
                    'advisor_memory_ops.based_on_version','profiles.team_size','ceo_context.decision_style','ceo_context.risk_tolerance']) c
union all select 'function:' || f, case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=f) then 'present' else 'missing' end
  from unnest(array['apply_advisor_memory','track_company_fact_versions','save_company_foundation']) f
order by 1;
