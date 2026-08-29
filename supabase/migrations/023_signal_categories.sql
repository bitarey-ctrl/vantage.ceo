-- ─────────────────────────────────────────────────────────────
-- 023 — Five-category signal gate
--
-- Narrows VANTAGE to a single ICP: B2B SaaS founders/CEOs, US/UK,
-- ~$1M-$20M ARR. A signal now only reaches the user if it maps to
-- one of five categories, and it carries the three output fields
-- the gate produced.
--
-- `category` is nullable so pre-gate rows stay valid, but the
-- pipeline never writes a NULL — a signal without a category is
-- discarded before it reaches the insert.
--
-- WARNING: the DELETE at the end removes EVERY signal_triages row
-- that points at a pre-gate signal. At the moment you run this,
-- that is all of them — the feed will be empty until the next
-- ingest populates it.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS category         TEXT,
  ADD COLUMN IF NOT EXISTS what_happened    TEXT,
  ADD COLUMN IF NOT EXISTS why_it_matters   TEXT,
  ADD COLUMN IF NOT EXISTS what_to_consider TEXT;

-- Constrain to the five categories. Legacy rows hold NULL and are
-- excluded by the NULL-tolerant CHECK, so this validates cleanly.
ALTER TABLE signals
  DROP CONSTRAINT IF EXISTS signals_category_check;

ALTER TABLE signals
  ADD CONSTRAINT signals_category_check
  CHECK (
    category IS NULL
    OR category IN ('pricing', 'cost_base', 'competition', 'compliance', 'capital')
  );

-- Feed queries filter on category and recency together.
CREATE INDEX IF NOT EXISTS idx_signals_category
  ON signals(category, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Legacy rows predate the gate. They were surfaced under the old
-- four-lens rubric and would show blank three-field output in the
-- UI. Retire them rather than leave them looking broken.
--
-- This is a soft retire: it unlinks them from every profile's feed
-- but leaves the signals table intact for reference.
-- ─────────────────────────────────────────────────────────────
DELETE FROM signal_triages
WHERE signal_id IN (SELECT id FROM signals WHERE category IS NULL);
