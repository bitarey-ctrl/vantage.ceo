-- ============================================================
-- VANTAGE — Row Level Security Policies
-- Migration 002: RLS
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceo_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_triages ENABLE ROW LEVEL SECURITY;
ALTER TABLE consequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE blind_spot_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_scores ENABLE ROW LEVEL SECURITY;

-- ─── PROFILES ─────────────────────────────────────────────────────────────────
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Service role can manage all profiles"
  ON profiles FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ─── CEO CONTEXT ─────────────────────────────────────────────────────────────
CREATE POLICY "Users can manage own context"
  ON ceo_context FOR ALL
  USING (auth.uid() = profile_id);

-- ─── SIGNALS (Global — readable by authenticated users, written by service) ───
CREATE POLICY "Authenticated users can read signals"
  ON signals FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage signals"
  ON signals FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ─── SIGNAL TRIAGES ──────────────────────────────────────────────────────────
CREATE POLICY "Users can view own triages"
  ON signal_triages FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "Service role can manage triages"
  ON signal_triages FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ─── CONSEQUENCES ─────────────────────────────────────────────────────────────
CREATE POLICY "Users can view own consequences"
  ON consequences FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "Service role can manage consequences"
  ON consequences FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ─── DECISIONS ────────────────────────────────────────────────────────────────
CREATE POLICY "Users can manage own decisions"
  ON decisions FOR ALL
  USING (auth.uid() = profile_id);

-- ─── BRIEFS ───────────────────────────────────────────────────────────────────
CREATE POLICY "Users can view and acknowledge own briefs"
  ON briefs FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "Users can update own brief acknowledgement"
  ON briefs FOR UPDATE
  USING (auth.uid() = profile_id);

CREATE POLICY "Service role can manage briefs"
  ON briefs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ─── RECOMMENDATIONS ─────────────────────────────────────────────────────────
CREATE POLICY "Users can manage own recommendations"
  ON recommendations FOR ALL
  USING (auth.uid() = profile_id);

-- ─── BLIND SPOT PATTERNS ─────────────────────────────────────────────────────
CREATE POLICY "Users can view and acknowledge own blind spots"
  ON blind_spot_patterns FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "Users can acknowledge own blind spots"
  ON blind_spot_patterns FOR UPDATE
  USING (auth.uid() = profile_id);

CREATE POLICY "Service role can manage blind spots"
  ON blind_spot_patterns FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ─── HEALTH SCORES ────────────────────────────────────────────────────────────
CREATE POLICY "Users can view own health scores"
  ON health_scores FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "Service role can manage health scores"
  ON health_scores FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
