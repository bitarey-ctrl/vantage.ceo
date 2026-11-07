// Privacy remediation (A build) — offline checks on the REAL routes with an in-memory database. Run:
// node --experimental-test-module-mocks --import ./scripts/baseline/ts-resolve.mjs --test scripts/baseline/*.test.mjs
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb } from './fake-db.mjs';

const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b';
let db, user = A, failTriages = false;
mock.module('@/lib/supabase/server', { namedExports: {
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: user } }, error: null }) },
    from: (t) => (t === 'signal_triages' && failTriages ? { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: { code: 'XX000', message: 'simulated' } }) }) }) }) } : db.client.from(t)) }),
  createAdminClient: async () => db.client,
} });
const { backfillTriagesForProfile } = await import('../../src/lib/signal-linking/backfill.ts');
const raw = await import('../../src/app/api/signals/raw/route.ts');
const now = new Date().toISOString();
const sig = (id, url, extra = {}) => ({ id, url, title: id, category: 'competition', why_it_matters: 'A rival changed its prices, which affects businesses selling the same product.', created_at: now, ...extra });

test('backfill never links Google News items (possibly from another account\'s competitor search) to other accounts', async () => {
  db = createFakeDb({ signals: [sig('shared-feed', 'https://aws.amazon.com/about-aws/whats-new/x'), sig('competitor-search', 'https://news.google.com/rss/articles/CBMi123'), sig('no-url', null)], signal_triages: [] });
  const r = await backfillTriagesForProfile(B);
  assert.deepEqual(db.rows('signal_triages').map((t) => t.signal_id), ['shared-feed']);
  assert.equal(r.linked, 1);
});

test('a failed link read returns an error, never another account\'s signals (no admin-key fallback)', async () => {
  db = createFakeDb({ signals: [sig('someone-elses', 'https://example.com/a')], signal_triages: [] });
  failTriages = true;
  const res = await raw.GET();
  failTriages = false;
  assert.equal(res.status, 503);
  assert.doesNotMatch(await res.text(), /someone-elses/);
});

test('re-saving a conversation keeps the fields the newer build wrote (turn ids, status, earlier attempts)', async () => {
  const ws = await import('../../src/app/api/workspace/route.ts');
  const S = '11111111-1111-4111-8111-000000000001', T = '2026-11-07T10:00:00.000Z';
  db = createFakeDb({ profiles: [{ id: A, plan: 'pro' }], advisor_sessions: [{ id: S, profile_id: A, title: 't', messages: [], updated_at: T }] });
  user = A;
  const messages = [{ role: 'user', content: 'q', turnId: 'turn-0001' }, { role: 'assistant', content: 'a', turnId: 'turn-0001', status: 'complete', attempts: [{ content: 'earlier answer', status: 'max_tokens' }] }];
  const res = await ws.POST(new Request('http://localhost/api/workspace', { method: 'POST', headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'save-session', id: S, expectedUpdatedAt: T, messages }) }));
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(db.rows('advisor_sessions')[0].messages, messages);
});
