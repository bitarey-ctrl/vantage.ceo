-- ============================================================
-- VANTAGE — Migration 005: Reports Table
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS reports (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  growth_score         INTEGER NOT NULL DEFAULT 0,
  risk_mgmt_score      INTEGER NOT NULL DEFAULT 0,
  opportunity_score    INTEGER NOT NULL DEFAULT 0,
  investor_ready_score INTEGER NOT NULL DEFAULT 0,
  external_evaluation  TEXT NOT NULL DEFAULT '',
  strategies_accepted_30d INTEGER NOT NULL DEFAULT 0,
  activity_note        TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_own" ON reports;
CREATE POLICY "reports_own" ON reports
  FOR ALL USING (auth.uid() = profile_id);

CREATE INDEX IF NOT EXISTS idx_reports_profile ON reports(profile_id);
CREATE INDEX IF NOT EXISTS idx_reports_created  ON reports(created_at DESC);
