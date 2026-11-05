// The test-only provider-call ceiling: reservations past the limit are refused before anything is sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('inactive without a ledger; refuses past the ceiling; records usage', async () => {
  delete process.env.PROVIDER_BUDGET_FILE;
  const { reserveProviderCall, recordProviderUsage } = await import('../../src/lib/ai/provider-budget.ts');
  assert.equal(reserveProviderCall('x', 'm'), null);
  const file = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'ledger.json');
  process.env.PROVIDER_BUDGET_FILE = file; process.env.PROVIDER_CALL_LIMIT = '2';
  const a = reserveProviderCall('gate', 'claude-sonnet-4-5'), b = reserveProviderCall('advisor', 'claude-sonnet-4-5');
  assert.deepEqual([a, b], [0, 1]);
  assert.throws(() => reserveProviderCall('advisor', 'claude-sonnet-4-5'), /budget reached \(2\)/);
  recordProviderUsage(b, { input_tokens: 10, output_tokens: 5 });
  const l = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(l.calls.length, 2); assert.equal(l.calls[1].usage.output_tokens, 5);
  delete process.env.PROVIDER_BUDGET_FILE;
});

test('dollar ceiling: worst case is reserved before sending; unrecorded calls count; no estimate or price → refused', async () => {
  const { reserveProviderCall, recordProviderUsage, committedUsd, ProviderBudgetError } = await import('../../src/lib/ai/provider-budget.ts');
  const file = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'ledger.json');
  const prices = { 'claude-sonnet-4-5': [3, 15] };
  // One earlier call with usage ($0.0105) and one cancelled call without usage (counts at the $0.035 allowance).
  writeFileSync(file, JSON.stringify({ limit: 10, dollarLimit: 0.10, prices, unrecordedAllowanceUsd: 0.035, calls: [
    { at: 't', kind: 'advisor', model: 'claude-sonnet-4-5', usage: { input_tokens: 2000, output_tokens: 300 } },
    { at: 't', kind: 'advisor', model: 'claude-sonnet-4-5' },
  ] }));
  process.env.PROVIDER_BUDGET_FILE = file;
  assert.equal(Math.round(committedUsd(JSON.parse(readFileSync(file, 'utf8'))) * 1e4) / 1e4, 0.0455);
  // Worst case of 1,900 bytes in + 1,000 tokens out = (2,000 × 3 + 1,000 × 15) / 1e6 = $0.021 → fits (0.0665).
  const s = reserveProviderCall('advisor', 'claude-sonnet-4-5', { inputBytes: 1900, maxTokens: 1000 });
  assert.equal(s, 2);
  // While its usage is unrecorded the next request sees $0.0665 committed: a $0.036 worst case would cross $0.10.
  assert.throws(() => reserveProviderCall('callClaude', 'claude-sonnet-4-5', { inputBytes: 2000, maxTokens: 2000 }), (e) => e instanceof ProviderBudgetError && /Dollar ceiling/.test(e.message));
  // Actual usage replaces the reservation, freeing room.
  recordProviderUsage(s, { input_tokens: 1000, output_tokens: 200 });
  assert.equal(reserveProviderCall('callClaude', 'claude-sonnet-4-5', { inputBytes: 2000, maxTokens: 2000 }), 3);
  assert.throws(() => reserveProviderCall('research', 'claude-sonnet-4-5'), /No worst-case estimate/);
  assert.throws(() => reserveProviderCall('research', 'unknown-model', { inputBytes: 1, maxTokens: 1 }), /No worst-case estimate or price/);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).calls.length, 4, 'refused requests leave no slot');
  delete process.env.PROVIDER_BUDGET_FILE;
});

test('gate failure message names the category and never includes provider text', async () => {
  const { gateFailureKind, gateFailureMessage } = await import('../../src/lib/signals/gate.ts');
  const { ProviderBudgetError } = await import('../../src/lib/ai/provider-budget.ts');
  const auth = Object.assign(new Error('invalid x-api-key sk-ant-SECRET'), { name: 'AuthenticationError', status: 401 });
  const busy = Object.assign(new Error('Overloaded'), { status: 529 });
  assert.equal(gateFailureKind(new ProviderBudgetError('x')), 'budget');
  assert.equal(gateFailureKind(auth), 'auth');
  assert.equal(gateFailureKind(busy), 'availability');
  assert.equal(gateFailureKind(Object.assign(new Error('fetch failed'), { name: 'APIConnectionError' })), 'availability');
  assert.equal(gateFailureKind(new Error('Failed to parse Claude response as JSON: …')), 'other');
  const m = gateFailureMessage(['budget', 'budget'], 2, 40);
  assert.match(m, /all 2 check\(s\) of 40 candidates failed because the model-call budget for this environment was reached/);
  assert.match(m, /not a quiet day/);
  assert.doesNotMatch(gateFailureMessage(['auth'], 1, 5), /sk-ant|x-api-key|ANTHROPIC_API_KEY/);
  assert.match(gateFailureMessage(['auth', 'availability'], 2, 5), /credentials.*; and .*busy or unreachable/);
});
