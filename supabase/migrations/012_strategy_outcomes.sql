-- ─────────────────────────────────────────────────────────────
-- 012 — Strategy outcome tracking
-- Lets users record whether a strategy actually worked, so the
-- system can show users their own accuracy track record over time.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE strategies
  ADD COLUMN IF NOT EXISTS outcome_status TEXT
    CHECK (outcome_status IN ('worked', 'didnt_work', 'too_early', 'unclear')),
  ADD COLUMN IF NOT EXISTS outcome_notes TEXT,
  ADD COLUMN IF NOT EXISTS outcome_recorded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_strategies_outcome_status
  ON strategies(profile_id, outcome_status)
  WHERE outcome_status IS NOT NULL;
