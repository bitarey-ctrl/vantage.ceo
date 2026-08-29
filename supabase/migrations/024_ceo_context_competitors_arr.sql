-- ─────────────────────────────────────────────────────────────
-- 024 — Capture named competitors and ARR band at onboarding
--
-- Data capture only. The competitor-matching/search behaviour is
-- NOT built on these yet.
--
-- `competitors` already exists on ceo_context (001, line 56) as
-- `jsonb not null default '[]'`, holding [{ name, threat_level, ... }].
-- Onboarding simply never wrote to it. No schema change is needed
-- there — only the ARR band is new.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE ceo_context
  ADD COLUMN IF NOT EXISTS arr_band TEXT;

ALTER TABLE ceo_context
  DROP CONSTRAINT IF EXISTS ceo_context_arr_band_check;

ALTER TABLE ceo_context
  ADD CONSTRAINT ceo_context_arr_band_check
  CHECK (
    arr_band IS NULL
    OR arr_band IN ('pre_seed', 'pre_1m', '1m_5m', '5m_20m', '20m_plus')
  );
