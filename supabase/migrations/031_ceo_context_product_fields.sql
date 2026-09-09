-- ─────────────────────────────────────────────────────────────
-- 031 — Product, customer and priority category on ceo_context
--
-- Replaces the Industry dropdown in onboarding step 1 with three
-- questions that actually describe the business:
--
--   product_description  what the product does, 1-2 sentences
--   target_customer      who they sell to
--   top_priority         Growth | Retention | Pricing | Fundraising | Hiring | Other
--   top_priority_other   free text, only when top_priority = 'Other'
--
-- These feed the ADVISOR system prompt and the per-user CONSEQUENCE
-- prompt. They deliberately do NOT feed the relevance gate: signals are a
-- global table shared to every account via the backfill, so personalising
-- gate output would write one user's context into rows every other user
-- inherits.
--
-- All nullable: existing users keep exactly what they have and nothing is
-- backfilled. Re-runnable.
-- ─────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE ceo_context
  ADD COLUMN IF NOT EXISTS product_description text,
  ADD COLUMN IF NOT EXISTS target_customer     text,
  ADD COLUMN IF NOT EXISTS top_priority        text,
  ADD COLUMN IF NOT EXISTS top_priority_other  text;

ALTER TABLE ceo_context DROP CONSTRAINT IF EXISTS ceo_context_top_priority_check;
ALTER TABLE ceo_context
  ADD CONSTRAINT ceo_context_top_priority_check
  CHECK (
    top_priority IS NULL
    OR top_priority IN ('Growth','Retention','Pricing','Fundraising','Hiring','Other')
  );

COMMIT;
