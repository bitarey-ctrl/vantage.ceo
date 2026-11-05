// The test-only provider-call ceiling: reservations past the limit are refused before anything is sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
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
