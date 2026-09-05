-- ─────────────────────────────────────────────────────────────
-- 026 — Repair corrupted + stale ceo_context for the locustan profile
--
-- TWO problems, one of them data corruption rather than staleness.
--
-- 1. CORRUPTION. `competitors` held 36 entries which were the individual
--    CHARACTERS of the string "Palantir, NexStrat, Exploding Topics"
--    ('P','a','l','a','n','t','i','r',',',' ','N',...). A string was stored
--    where an array of {name} objects was expected.
--
--    Consequence: buildQueryFeeds() takes the first three competitors and
--    builds a Google News query per name, so the pipeline was literally
--    searching for "P", "a", and "l" — three slots of the Competition
--    category spent on pure noise.
--
--    src/lib/signals/sources.ts now filters names shorter than 2 characters
--    before taking the top 3, so this can no longer reach a query even if
--    corrupt data reappears. This migration repairs the stored value.
--
-- 2. STALE ICP. sector/geography still described the pre-narrowing ICP
--    ("B2B SaaS, Turkey" / "Istanbul, Turkey"). The pipeline no longer reads
--    geography at all, but the value is wrong and feeds the analysis prompts.
--
-- Scoped by profile_id so it touches exactly one row. Previous value is
-- recorded above in full, so this is reversible by hand if needed.
-- ─────────────────────────────────────────────────────────────

UPDATE ceo_context
SET
  -- Reconstructed from the corrupted character array.
  competitors = '[
    {"name": "Palantir"},
    {"name": "NexStrat"},
    {"name": "Exploding Topics"}
  ]'::jsonb,
  sector           = 'B2B SaaS',
  geography_detail = 'United States, United Kingdom',
  -- $0-$10K MRR is comfortably under $1M ARR. Inferred from the existing
  -- monthly_revenue_range rather than left null; change in Settings if wrong.
  arr_band         = 'pre_1m',
  updated_at       = now()
WHERE profile_id = '4bcc59bf-544c-472c-800f-b9513fc1153d';

-- Verify: expect 3 competitors, sector 'B2B SaaS', arr_band 'pre_1m'.
--   select sector, geography_detail, arr_band,
--          jsonb_array_length(competitors) as competitor_count
--   from ceo_context
--   where profile_id = '4bcc59bf-544c-472c-800f-b9513fc1153d';
