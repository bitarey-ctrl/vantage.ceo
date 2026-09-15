-- ─────────────────────────────────────────────────────────────
-- 032 — Free-text "Additional context" on ceo_context
--
-- Everything durable about the business that does NOT fit one of the
-- structured fields (competitors, top_priority, product_description,
-- target_customer, arr_band) goes here: nuance, recent events, the
-- things a CEO would tell a chief of staff in passing.
--
-- Two writers:
--   1. The user, in Profile → Strategic context (a plain textarea).
--   2. The advisor, which APPENDS a short dated note when it hears
--      something durable that maps to no structured field.
--
-- Append-only from the advisor's side — it never rewrites what is
-- already there, so the user's own words survive. Trimming is the
-- user's job, in Profile.
--
-- Read on every advisor conversation alongside the structured fields.
--
-- Nullable, no backfill, re-runnable.
-- ─────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE ceo_context
  ADD COLUMN IF NOT EXISTS additional_context text;

COMMENT ON COLUMN ceo_context.additional_context IS
  'Free-text context that fits no structured field. User-edited in Profile; advisor appends short notes.';

COMMIT;
