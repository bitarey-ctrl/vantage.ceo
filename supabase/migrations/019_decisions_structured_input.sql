-- 019_decisions_structured_input.sql
-- Capture structured upfront context for each decision so blind-spot analysis
-- has something substantive to work with (and can refuse thin input).
--
-- `rationale` already exists (001_initial_schema, text NOT NULL DEFAULT ''), so
-- only the three genuinely new columns are added here. `confidence` is added
-- NOT NULL with a backfill default so existing rows stay valid; new inserts
-- always supply it from the form.
--
-- Re-runnable. NOT executed by code — apply manually in the Supabase SQL editor.

BEGIN;

ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS confidence     text NOT NULL DEFAULT 'torn',
  ADD COLUMN IF NOT EXISTS known_context  text,
  ADD COLUMN IF NOT EXISTS open_questions text;

ALTER TABLE decisions DROP CONSTRAINT IF EXISTS decisions_confidence_check;
ALTER TABLE decisions
  ADD CONSTRAINT decisions_confidence_check
  CHECK (confidence IN ('confident', 'torn', 'exploring'));

COMMIT;
