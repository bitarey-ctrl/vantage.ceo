-- 020_missed_signals.sql
-- Support for "missed signal" pain emails: a nudge when an urgent signal has sat
-- un-reviewed for 3+ days.
--
--   * signals.reviewed_at — set the first time the signal's detail view is opened.
--   * missed_signal_emails — one row per (user, signal) we've already nudged about,
--     so the daily cron never emails the same user about the same signal twice.
--
-- Re-runnable. NOT executed by code — apply manually in the Supabase SQL editor.

BEGIN;

-- ── signals.reviewed_at ───────────────────────────────────────────────────────
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Helps the cron's "urgent + recent + unreviewed" scan.
CREATE INDEX IF NOT EXISTS idx_signals_urgency_created ON signals(urgency, created_at);

-- ── missed_signal_emails ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS missed_signal_emails (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  signal_id  uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, signal_id)
);

CREATE INDEX IF NOT EXISTS idx_missed_signal_emails_user ON missed_signal_emails(user_id);

ALTER TABLE missed_signal_emails ENABLE ROW LEVEL SECURITY;

-- Users can see their own send history; only the service role writes (from cron).
DROP POLICY IF EXISTS "Users can view own missed-signal emails" ON missed_signal_emails;
CREATE POLICY "Users can view own missed-signal emails"
  ON missed_signal_emails FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage missed-signal emails" ON missed_signal_emails;
CREATE POLICY "Service role can manage missed-signal emails"
  ON missed_signal_emails FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMIT;
