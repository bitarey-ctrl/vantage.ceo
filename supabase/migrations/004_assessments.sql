-- ============================================================
-- VANTAGE — Migration 004: Assessments Table
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS assessments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  strategic_clarity       INTEGER NOT NULL DEFAULT 0,
  information_processing  INTEGER NOT NULL DEFAULT 0,
  risk_calibration        INTEGER NOT NULL DEFAULT 0,
  execution_followthrough INTEGER NOT NULL DEFAULT 0,
  strengths               TEXT NOT NULL DEFAULT '',
  focus_area              TEXT NOT NULL DEFAULT '',
  detected_patterns       TEXT[] NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assessments_own" ON assessments;
CREATE POLICY "assessments_own" ON assessments
  FOR ALL USING (auth.uid() = profile_id);

CREATE INDEX IF NOT EXISTS idx_assessments_profile ON assessments(profile_id);
CREATE INDEX IF NOT EXISTS idx_assessments_created ON assessments(created_at DESC);
