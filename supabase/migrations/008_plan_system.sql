-- Migration 008: plan system
-- Run in Supabase SQL Editor

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'trial';
-- plan values: 'trial' | 'solo' | 'pro'
-- trial = full access for 14 days, then downgraded to solo
-- solo = Dashboard, Signals, Strategies, Digital Twin, Assessment, Report, Profile
-- pro = solo + Decisions, AI Chat, Blind Spots (future)

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_started_at timestamptz;

-- Set all existing users to trial with 14 days from now
UPDATE profiles SET
  plan = 'trial',
  trial_ends_at = now() + interval '14 days',
  plan_started_at = now()
WHERE plan = 'trial' AND trial_ends_at IS NULL;
