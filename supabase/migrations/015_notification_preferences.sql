-- ─────────────────────────────────────────────────────────────
-- 015 — Notification preferences (email-only)
-- One row per user holding their email notification toggles plus
-- the daily-briefing send time + timezone. The actual email-sending
-- engine lands in a later migration/worker — this is just the
-- preferences surface the settings page reads/writes.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_briefing  boolean NOT NULL DEFAULT true,
  missed_signals  boolean NOT NULL DEFAULT true,
  monthly_recap   boolean NOT NULL DEFAULT true,
  decision_nudges boolean NOT NULL DEFAULT true,
  briefing_time   text    NOT NULL DEFAULT '07:00',
  timezone        text    NOT NULL DEFAULT 'UTC',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users may only read/write their own row. A single FOR ALL policy:
-- USING gates SELECT/UPDATE/DELETE, and (absent an explicit WITH CHECK)
-- is also applied as the INSERT check — so a user can never touch a
-- row whose user_id is not their own auth uid.
DROP POLICY IF EXISTS "Users can manage own notification preferences" ON notification_preferences;
CREATE POLICY "Users can manage own notification preferences"
  ON notification_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
