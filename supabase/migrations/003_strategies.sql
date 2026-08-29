-- ============================================================
-- VANTAGE — Migration 003: Strategies Table
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS strategies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  signal_id        UUID REFERENCES signals(id),
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  timeline_30d     TEXT,
  timeline_90d     TEXT,
  timeline_6m      TEXT,
  cost_of_inaction TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "strategies_own" ON strategies;
CREATE POLICY "strategies_own" ON strategies
  FOR ALL USING (auth.uid() = profile_id);

CREATE INDEX IF NOT EXISTS idx_strategies_profile ON strategies(profile_id);
CREATE INDEX IF NOT EXISTS idx_strategies_status  ON strategies(status);
CREATE INDEX IF NOT EXISTS idx_strategies_created ON strategies(created_at DESC);
