-- ─────────────────────────────────────────────────────────────
-- 013 — Purge legacy fake signals (with strategies handled)
-- ─────────────────────────────────────────────────────────────

-- 1. Null out signal_id on strategies that reference fake signals
--    (we keep the strategies themselves — they have useful content —
--     just unlink them from the fake signal)
UPDATE strategies
SET signal_id = NULL
WHERE signal_id IN (
  SELECT id FROM signals
  WHERE url IS NULL
     OR url = ''
     OR url NOT LIKE 'http%'
);

-- 2. Delete signal_triages referencing fake signals
DELETE FROM signal_triages
WHERE signal_id IN (
  SELECT id FROM signals
  WHERE url IS NULL
     OR url = ''
     OR url NOT LIKE 'http%'
);

-- 3. Delete consequences referencing fake signals
DELETE FROM consequences
WHERE signal_id IN (
  SELECT id FROM signals
  WHERE url IS NULL
     OR url = ''
     OR url NOT LIKE 'http%'
);

-- 4. Now delete the fake signals themselves
DELETE FROM signals
WHERE url IS NULL
   OR url = ''
   OR url NOT LIKE 'http%';