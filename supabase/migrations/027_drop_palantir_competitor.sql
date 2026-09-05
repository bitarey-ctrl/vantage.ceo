-- ─────────────────────────────────────────────────────────────
-- 027 — Drop Palantir from the locustan competitor list
--
-- Migration 026 reconstructed the corrupted competitor array to the three
-- names the original string held: Palantir, NexStrat, Exploding Topics.
-- Palantir is not a real competitor for a B2B SaaS product at $1-20M ARR
-- (enterprise/government analytics, wildly different buyer and price point),
-- and it was burning one of the three Competition query slots.
--
-- This is a separate migration rather than an edit to 026 because 026 has
-- already been applied — editing it would leave the file describing something
-- the database never ran.
--
-- Written as a filter over the existing array rather than a hardcoded
-- replacement, so it is safe to run whatever 026 left behind and is a no-op
-- if Palantir was already removed by hand.
-- ─────────────────────────────────────────────────────────────

UPDATE ceo_context
SET
  competitors = COALESCE(
    (
      SELECT jsonb_agg(competitor)
      FROM jsonb_array_elements(competitors) AS competitor
      WHERE lower(competitor ->> 'name') <> 'palantir'
    ),
    '[]'::jsonb
  ),
  updated_at = now()
WHERE profile_id = '4bcc59bf-544c-472c-800f-b9513fc1153d'
  AND competitors @> '[{"name": "Palantir"}]'::jsonb;

-- Verify: expect 2 competitors — NexStrat and Exploding Topics.
--   select jsonb_array_length(competitors) as competitor_count, competitors
--   from ceo_context
--   where profile_id = '4bcc59bf-544c-472c-800f-b9513fc1153d';
