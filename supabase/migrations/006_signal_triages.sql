-- ============================================================
-- VANTAGE — Migration 006: signal_triages table
-- Run this in Supabase SQL Editor:
--   app.supabase.com → your project → SQL Editor → New query
-- ============================================================

-- ─── Table: signal_triages ────────────────────────────────────
-- Tracks which signals are relevant for which profile (many-to-many).
-- Created when signals are fetched; updated when Analyse is clicked.
CREATE TABLE IF NOT EXISTS signal_triages (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  signal_id        uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  profile_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relevant         boolean NOT NULL DEFAULT true,
  relevance_score  integer NOT NULL DEFAULT 70 CHECK (relevance_score BETWEEN 0 AND 100),
  relevance_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (signal_id, profile_id)
);

-- ─── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_signal_triages_profile  ON signal_triages(profile_id);
CREATE INDEX IF NOT EXISTS idx_signal_triages_signal   ON signal_triages(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_triages_created  ON signal_triages(created_at DESC);

-- ─── Updated-at trigger ───────────────────────────────────────
CREATE TRIGGER trg_signal_triages_updated_at
  BEFORE UPDATE ON signal_triages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────
ALTER TABLE signal_triages ENABLE ROW LEVEL SECURITY;

-- Users can read their own triages
DROP POLICY IF EXISTS "Users can view own triages" ON signal_triages;
CREATE POLICY "Users can view own triages"
  ON signal_triages FOR SELECT
  USING (auth.uid() = profile_id);

-- Service role can do everything (inserts from the refresh API)
DROP POLICY IF EXISTS "Service role can manage triages" ON signal_triages;
CREATE POLICY "Service role can manage triages"
  ON signal_triages FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ─── Also: fix existing signals RLS so insert works via service role ──
-- (In case the service_role policy is missing from the original migration)
DROP POLICY IF EXISTS "signals: service role full access" ON signals;
CREATE POLICY "signals: service role full access"
  ON signals FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
