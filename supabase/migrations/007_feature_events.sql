-- VANTAGE — Migration 007: feature_events table
-- Run in Supabase SQL Editor after 006_signal_triages.sql

CREATE TABLE IF NOT EXISTS feature_events (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event      text NOT NULL,
  metadata   jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_events_profile ON feature_events(profile_id);
CREATE INDEX IF NOT EXISTS idx_feature_events_event   ON feature_events(event);
CREATE INDEX IF NOT EXISTS idx_feature_events_created ON feature_events(created_at DESC);

ALTER TABLE feature_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own events (for their personal stats later)
CREATE POLICY "feature_events: own profile read"
  ON feature_events FOR SELECT
  USING (auth.uid() = profile_id);

-- Service role can insert and read all (for admin dashboard)
CREATE POLICY "feature_events: service role all"
  ON feature_events FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
