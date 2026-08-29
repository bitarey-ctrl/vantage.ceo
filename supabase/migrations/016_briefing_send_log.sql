-- ─────────────────────────────────────────────────────────────
-- 016 — Daily briefing send log (debugging / idempotency)
-- One row per attempted briefing email. Lets us debug delivery and
-- prevents double-sends within the same local day (the cron runs
-- every 15 min, so a user could otherwise be hit twice in one window).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS briefing_send_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  -- The user's LOCAL calendar date (YYYY-MM-DD) at send time. Used as the
  -- idempotency key so we only send one briefing per local day per user.
  local_date   text NOT NULL,
  signal_count integer NOT NULL DEFAULT 0,
  error        text,
  resend_id    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS briefing_send_log_user_date_idx
  ON briefing_send_log (user_id, local_date);

-- Guard against duplicate successful sends for the same user/local day.
CREATE UNIQUE INDEX IF NOT EXISTS briefing_send_log_sent_once_idx
  ON briefing_send_log (user_id, local_date)
  WHERE status = 'sent';

-- Service-role only. The cron writes via the admin client (which bypasses
-- RLS), and there is no user-facing read path — enabling RLS with no
-- permissive policy denies anon/authenticated access by default.
ALTER TABLE briefing_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages briefing send log" ON briefing_send_log;
CREATE POLICY "Service role manages briefing send log"
  ON briefing_send_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
