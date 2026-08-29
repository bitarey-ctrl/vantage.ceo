-- 017_strategies_decouple.sql
-- Decouple strategies from signals and move to a first-class lifecycle.
--
-- 1. Loosen the signal_id FK so a strategy can outlive its parent signal:
--    a strategy may be created manually (signal_id NULL) and, if a parent
--    signal is later deleted, the strategy survives with signal_id set NULL
--    instead of blocking the delete.
-- 2. Replace the recommendation-approval statuses (pending/accepted/rejected)
--    with a strategy lifecycle (considering/deciding/decided/archived).
--
-- Re-runnable. NOT executed by code — apply manually in the Supabase SQL editor.

BEGIN;

-- ── 1. signal_id FK → ON DELETE SET NULL ──────────────────────────────────────
-- The original inline FK (003) auto-named "strategies_signal_id_fkey" with no
-- ON DELETE clause (defaults to NO ACTION). Drop and recreate it nullable with
-- ON DELETE SET NULL. The column is already nullable, so no column change needed.
ALTER TABLE strategies DROP CONSTRAINT IF EXISTS strategies_signal_id_fkey;
ALTER TABLE strategies
  ADD CONSTRAINT strategies_signal_id_fkey
  FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE SET NULL;

-- ── 2. Status lifecycle migration ─────────────────────────────────────────────
-- Drop any existing CHECK on status first so the value remap can't trip it.
ALTER TABLE strategies DROP CONSTRAINT IF EXISTS strategies_status_check;

-- Drop the old default before remapping, then set the new one after.
ALTER TABLE strategies ALTER COLUMN status DROP DEFAULT;

-- Map legacy values onto the new lifecycle:
--   pending  → considering  (generated, not yet acted on)
--   accepted → decided      (committed to)
--   rejected → archived     (set aside)
-- "deciding" is a new intermediate state with no legacy equivalent.
UPDATE strategies SET status = 'considering' WHERE status = 'pending';
UPDATE strategies SET status = 'decided'     WHERE status = 'accepted';
UPDATE strategies SET status = 'archived'    WHERE status = 'rejected';
-- Any unexpected legacy value falls back to considering so the CHECK can apply.
UPDATE strategies
  SET status = 'considering'
  WHERE status NOT IN ('considering', 'deciding', 'decided', 'archived');

ALTER TABLE strategies ALTER COLUMN status SET DEFAULT 'considering';

ALTER TABLE strategies
  ADD CONSTRAINT strategies_status_check
  CHECK (status IN ('considering', 'deciding', 'decided', 'archived'));

COMMIT;
