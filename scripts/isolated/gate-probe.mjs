// One targeted REAL gate call on schema-constrained output (approved budget: the last remaining call of the 18-call /
// $1.00 retest ledger). Run through with-isolated-env.mjs so ISOLATED_TEST=1 (no SDK retries) and the ledger apply.
//   1. GATE_PROBE_FETCH=1 → free: fetch the curated public RSS feeds (no Perplexity, no model) and save one batch.
//   2. GATE_PROBE_SEND=1  → sends that saved batch once through the real gate. Nothing is written to the database.
// The ledger refuses the call if it would exceed the call or dollar ceiling; there is no retry on failure.
import { readFileSync, writeFileSync } from 'node:fs';

const BATCH = process.env.GATE_PROBE_BATCH_FILE;
if (!BATCH) { console.error('Set GATE_PROBE_BATCH_FILE.'); process.exit(3); }

if (process.env.GATE_PROBE_FETCH === '1') {
  const { fetchRssSignals } = await import('../../src/lib/signals/rss-ingestion.ts');
  // Pact Coffee's stated competitors (isolated test account), so the feed set matches a real refresh's RSS part.
  const rss = await fetchRssSignals({ competitors: ['Brio Coffee Club', 'Kiko Roasters'] });
  const batch = rss.slice(0, 25).map((s) => ({ title: s.title, content: s.content, url: s.url, published_at: s.published_at, source_name: s.feed_name }));
  writeFileSync(BATCH, JSON.stringify({ fetchedAt: new Date().toISOString(), fetched: rss.length, batch }, null, 1), { mode: 0o600 });
  console.log(`Fetched ${rss.length} RSS candidates; saved a batch of ${batch.length}. Sources: ${[...new Set(batch.map((b) => b.source_name))].join(', ')}`);
  process.exit(0);
}

if (process.env.GATE_PROBE_SEND !== '1') { console.error('Set GATE_PROBE_FETCH=1 or GATE_PROBE_SEND=1.'); process.exit(3); }
const { batch } = JSON.parse(readFileSync(BATCH, 'utf8'));
const { withRunStatus, composeRunStatus } = await import('../../src/lib/company-context/run-status.ts');
const { gateSignals } = await import('../../src/lib/signals/gate.ts');
const { result, error, stages } = await withRunStatus(() => gateSignals(batch));
const run = composeRunStatus(stages);
console.log(JSON.stringify({
  status: run.status, message: run.message, stages: run.stages, diagnostics: run.diagnostics,
  error: error ? String(error.message).slice(0, 300) : null,
  survivors: (result ?? []).map((s) => ({ title: s.title, category: s.category, what_happened: s.what_happened, why_it_matters: s.why_it_matters, what_to_consider: s.what_to_consider })),
}, null, 1));
