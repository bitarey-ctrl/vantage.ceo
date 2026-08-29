-- 018_decisions_analysis.sql
-- Rebuild `decisions` into a general decision-analysis tool that absorbs the
-- standalone Blind Spots feature.
--
-- A decision can now originate from a signal, a strategy, or be entered manually,
-- carries an optional deadline, and stores an auto-generated blind-spot analysis.
-- The status model is simplified to an open → decided/archived lifecycle.
--
-- Re-runnable. NOT executed by code — apply manually in the Supabase SQL editor.

BEGIN;

-- ── New columns ───────────────────────────────────────────────────────────────
ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS source      text,        -- 'signal' | 'strategy' | 'manual'
  ADD COLUMN IF NOT EXISTS source_id   uuid,        -- the originating signal/strategy (nullable)
  ADD COLUMN IF NOT EXISTS deadline    timestamptz, -- optional decision-by date
  ADD COLUMN IF NOT EXISTS blind_spots jsonb,       -- [{category, description, severity}]
  ADD COLUMN IF NOT EXISTS description text;         -- the decision being weighed

ALTER TABLE decisions DROP CONSTRAINT IF EXISTS decisions_source_check;
ALTER TABLE decisions
  ADD CONSTRAINT decisions_source_check
  CHECK (source IS NULL OR source IN ('signal', 'strategy', 'manual'));

-- Manual / source-derived decisions don't carry a category, so it's now optional.
ALTER TABLE decisions ALTER COLUMN category DROP NOT NULL;

-- ── Status: enum → text lifecycle ─────────────────────────────────────────────
-- The original `status decision_status NOT NULL DEFAULT 'draft'` enum
-- (draft|active|pending|resolved|archived) becomes a simple text lifecycle
-- (open|decided|archived). The decision_status enum type is left in place but
-- this column no longer uses it. Legacy values are remapped so existing rows
-- stay visible under the new tabs. Postgres rebuilds idx_decisions_status
-- automatically on the type change.
ALTER TABLE decisions ALTER COLUMN status DROP DEFAULT;
ALTER TABLE decisions ALTER COLUMN status TYPE text USING status::text;

UPDATE decisions SET status = 'decided' WHERE status = 'resolved';
UPDATE decisions SET status = 'open'    WHERE status IN ('draft', 'active', 'pending');
UPDATE decisions SET status = 'open'    WHERE status NOT IN ('open', 'decided', 'archived');

ALTER TABLE decisions ALTER COLUMN status SET DEFAULT 'open';

ALTER TABLE decisions DROP CONSTRAINT IF EXISTS decisions_status_check;
ALTER TABLE decisions
  ADD CONSTRAINT decisions_status_check
  CHECK (status IN ('open', 'decided', 'archived'));

-- Helps the "open, ordered by deadline" list query.
CREATE INDEX IF NOT EXISTS idx_decisions_deadline ON decisions(deadline);

COMMIT;
