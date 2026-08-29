-- ─────────────────────────────────────────────────────────────
-- 014 — Signal urgency tiering
-- Adds an urgency tier to each signal so the UI can surface
-- act-this-week items above watch-only context. Foundational —
-- downstream features (briefs, prioritised feeds) depend on it.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS urgency TEXT NOT NULL DEFAULT 'watch';

-- Constrain to the three valid tiers. Backfilled rows already hold
-- the 'watch' default, so the constraint validates cleanly.
ALTER TABLE signals
  DROP CONSTRAINT IF EXISTS signals_urgency_check;

ALTER TABLE signals
  ADD CONSTRAINT signals_urgency_check
  CHECK (urgency IN ('act_this_week', 'decide_this_month', 'watch'));
