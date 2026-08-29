-- VANTAGE Migration 011: Advisor chat sessions
CREATE TABLE IF NOT EXISTS advisor_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'New conversation',
  messages    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE advisor_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advisor_sessions_own" ON advisor_sessions;
CREATE POLICY "advisor_sessions_own" ON advisor_sessions
  FOR ALL USING (auth.uid() = profile_id);

CREATE INDEX IF NOT EXISTS idx_advisor_sessions_profile ON advisor_sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_advisor_sessions_updated ON advisor_sessions(updated_at DESC);
