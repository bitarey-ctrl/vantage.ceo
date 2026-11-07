// The shared news gate on schema-constrained output, through the REAL gate (src/lib/signals/gate.ts) and the REAL
// call (callClaudeStructured in src/lib/ai/claude.ts). Only the SDK is scripted: these are replayed provider
// responses, not model runs; they verify handling, not relevance judgement. Run:
// node --experimental-test-module-mocks --import ./scripts/company-context/ts-resolve.mjs --test scripts/company-context/gate-structured.test.mjs
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ANTHROPIC_API_KEY = 'test';
const dir = mkdtempSync(join(tmpdir(), 'gate-ledger-'));
process.env.PROVIDER_BUDGET_FILE = join(dir, 'ledger.json');

let script = []; const sent = [];
mock.module('@anthropic-ai/sdk', { defaultExport: class Anthropic {
  static APIError = class extends Error {};
  constructor() { this.messages = { create: async (params) => {
    sent.push(params);
    const s = script.shift();
    if (s instanceof Error) throw s;
    return { _request_id: s.id, model: 'claude-sonnet-5-5', stop_reason: s.stop ?? 'end_turn', usage: { input_tokens: 7000, output_tokens: s.out ?? 50 },
      content: [{ type: 'thinking', thinking: '', signature: 'sig' }, ...(s.text === undefined ? [] : [{ type: 'text', text: s.text }])] };
  } }; }
} });

const { withRunStatus, composeRunStatus } = await import('../../src/lib/company-context/run-status.ts');
const { gateSignals, GATE_SCHEMA, GATE_SCHEMA_VERSION, gateStructureProblem } = await import('../../src/lib/signals/gate.ts');
const { buildGatePrompt } = await import('../../src/lib/ai/prompts/triage.ts');

const cands = (n) => Array.from({ length: n }, (_, i) => ({ title: `Item ${i}`, content: 'x', url: `https://e.example/${i}`, published_at: '2026-11-06', source_name: 'S' }));
const keep = (index, extra = {}) => ({ index, category: 'cost_base', what_happened: 'A supplier raised prices.', why_it_matters: 'Businesses that buy this input pay more from next month.', what_to_consider: 'Check your next invoice.', ...extra });
const ledger = (limit = 20) => writeFileSync(process.env.PROVIDER_BUDGET_FILE, JSON.stringify({ limit, calls: [], dollarLimit: 10, prices: { 'claude-sonnet-5-5': [2, 10] } }), { mode: 0o600 });
const RAW = 'Here are the items I kept: index 3 looks important';

test('request: structured output with an object-root schema, the same thinking and effort, and the prompt unchanged apart from the envelope', async () => {
  ledger(); sent.length = 0;
  script = [{ id: 'req_ok', text: JSON.stringify({ signals: [] }) }];
  await withRunStatus(() => gateSignals(cands(3)));
  const p = sent[0];
  assert.equal(p.model, 'claude-sonnet-5-5');
  assert.deepEqual(p.thinking, { type: 'between_tools' });
  assert.equal(p.output_config.effort, 'high');
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.equal(p.output_config.format.schema, GATE_SCHEMA);
  assert.equal(GATE_SCHEMA.type, 'object');
  assert.equal(p.max_tokens, 5200);
  const base = buildGatePrompt(cands(3).map((c, i) => ({ index: i, title: c.title, content: c.content, source: c.source_name, url: c.url, published_at: c.published_at })));
  assert.ok(p.messages[0].content.startsWith(base), 'the tuned gate prompt is sent unchanged');
  assert.match(p.messages[0].content.slice(base.length), /\{"signals": \[\]\}/);
});

test('refusal, truncation, unparseable, wrong structure and an interrupted connection each fail only their batch; good batches keep their results; status is partial', async () => {
  ledger();
  const conn = Object.assign(new Error('Connection error.'), { name: 'APIConnectionError', cause: { code: 'ECONNRESET' } });
  script = [
    { id: 'req_1', text: JSON.stringify({ signals: [keep(2), keep(3, { why_it_matters: 'Short.' }), keep(99), keep(4, { category: 'gossip' })] }) },
    { id: 'req_2', stop: 'refusal', text: '' },
    { id: 'req_3', stop: 'max_tokens', out: 5200, text: '{"signals":[{"index":1,"category":"pricing","what_happened":"Prices' },
    { id: 'req_4', text: RAW },
    { id: 'req_5', text: JSON.stringify({ items: [] }) },
    conn,
    { id: 'req_7', text: JSON.stringify({ signals: [] }) },
  ];
  const { result, stages } = await withRunStatus(() => gateSignals(cands(170)));
  // Semantic validation still applies to schema-valid output: stub reason, unknown index, unknown category are dropped.
  assert.deepEqual(result.map((r) => r.title), ['Item 2']);
  const gate = stages.find((s) => s.stage === 'gate');
  assert.deepEqual({ attempted: gate.attempted, ok: gate.succeeded, failed: gate.failed, kinds: gate.kinds },
    { attempted: 7, ok: 2, failed: 5, kinds: { refusal: 1, truncated: 1, parse: 2, connection: 1 } });
  const run = composeRunStatus(stages);
  assert.equal(run.status, 'partial');
  assert.match(run.message, /5 of 7 steps failed/);
  assert.match(run.message, /declined to answer/); assert.match(run.message, /cut off before it finished/); assert.match(run.message, /could not be read/);
  // Diagnostics: kept with the stored run, out of the stages the browser receives, and free of model output.
  assert.ok(run.stages.every((s) => !('diagnostics' in s)));
  const d = run.diagnostics;
  assert.deepEqual(d.map((x) => [x.requestId, x.ok, x.stopReason]), [['req_1', true, 'end_turn'], ['req_2', false, 'refusal'], ['req_3', false, 'max_tokens'], ['req_4', false, 'end_turn'], ['req_5', false, 'end_turn'], ['req_7', true, 'end_turn']]);
  assert.ok(d.every((x) => x.schemaVersion === GATE_SCHEMA_VERSION && x.model === 'claude-sonnet-5-5' && x.usage.input_tokens === 7000 && x.stage === 'gate'));
  assert.deepEqual(d.filter((x) => !x.ok).map((x) => x.failure), ['stop_reason refusal', 'stop_reason max_tokens at 5200 output tokens', 'not valid JSON', 'signals is not an array']);
  const stored = JSON.stringify(run);
  assert.doesNotMatch(stored, /index 3 looks important|Prices|Item \d/, 'no model output or prompt text on the run record');
  // The protected ledger (mode 600, outside the repository) keeps a bounded raw excerpt of failed answers only.
  const calls = JSON.parse(readFileSync(process.env.PROVIDER_BUDGET_FILE, 'utf8')).calls;
  assert.equal(statSync(process.env.PROVIDER_BUDGET_FILE).mode & 0o777, 0o600);
  assert.equal(calls[3].diagnostic.rawExcerpt, RAW);
  assert.equal(calls[0].diagnostic.rawExcerpt, undefined, 'successful output is not copied');
  assert.equal(calls[5].failure.kind, 'connection');
  assert.equal(calls.length, 7, 'no automatic retries');
});

test('all batches unusable is a failed gate, not a quiet day', async () => {
  ledger();
  script = [{ id: 'a', stop: 'max_tokens', text: '{"sig' }, { id: 'b', text: 'none' }];
  const { error, stages } = await withRunStatus(() => gateSignals(cands(30)));
  assert.match(error.message, /all 2 check\(s\) of 30 candidates failed because the AI service's answer was cut off before it finished; and the AI service's answer could not be read/);
  assert.equal(composeRunStatus(stages).status, 'failed');
});

test('the structural check rejects shapes the schema forbids, independently of the API', () => {
  assert.equal(gateStructureProblem([]), 'root is not an object');
  assert.equal(gateStructureProblem({ signals: [{ index: '1', category: 'pricing', what_happened: '', why_it_matters: '', what_to_consider: '' }] }), 'signals[0].index is not an integer');
  assert.equal(gateStructureProblem({ signals: [keep(1, { what_to_consider: null })] }), 'signals[0].what_to_consider is not a string');
  assert.equal(gateStructureProblem({ signals: [keep(1)] }), null);
});
