-- ─────────────────────────────────────────────────────────────
-- 028 — Mark signal_triages scoring columns as vestigial
--
-- signal_triages is now a PURE JOIN TABLE: which signal belongs to which
-- profile. That role is still needed and the table stays.
--
-- What no longer means anything is the scoring. These columns date from the
-- four-lens relevance rubric that migration 023 replaced with the
-- five-category gate. The gate does not score — a signal either maps to a
-- category with a non-obvious consequence, or it is discarded before it is
-- ever written. So every row now carries the same two hardcoded literals:
--
--   relevance_score  = 100
--   relevance_reason = 'Passed the five-category gate.'
--
-- Confirmed against live data: all rows identical on both columns.
--
-- The columns are NOT dropped, because api/signals/[id]/analyse and
-- api/cron/missed-signals still read and write them and both are on the
-- protected list. Dropping would break them. Instead this removes the
-- misleading DEFAULT (70 implied a real score for rows that never had one)
-- and records the deprecation in the schema itself, so the next person to
-- read this table does not mistake a constant for a measurement.
-- ─────────────────────────────────────────────────────────────

COMMENT ON TABLE signal_triages IS
  'Join table: which signals belong to which profile. Relevance is decided by the five-category gate at ingestion (see src/lib/signals/gate.ts); signals that fail it are never written.';

COMMENT ON COLUMN signal_triages.relevance_score IS
  'DEPRECATED — always 100. Vestige of the pre-023 four-lens scoring rubric. Do not read this as a measurement.';

COMMENT ON COLUMN signal_triages.relevance_reason IS
  'DEPRECATED — always a constant string. Vestige of the pre-023 four-lens scoring rubric.';

COMMENT ON COLUMN signal_triages.relevant IS
  'DEPRECATED — always true. Anything present in this table passed the gate by definition.';

-- A default of 70 implied a middling score for rows that were never scored.
ALTER TABLE signal_triages ALTER COLUMN relevance_score DROP DEFAULT;
