-- Migration 009: user feedback
CREATE TABLE IF NOT EXISTS feedback (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  rating      integer CHECK (rating BETWEEN 1 AND 5),
  category    text,   -- 'signal_quality' | 'strategy_quality' | 'ui_ux' | 'general' | 'feature_request'
  message     text NOT NULL,
  page        text,   -- which page they were on when they submitted
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback: authenticated insert"
  ON feedback FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "feedback: service role all"
  ON feedback FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
