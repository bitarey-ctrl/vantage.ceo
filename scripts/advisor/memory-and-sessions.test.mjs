// Handler-level tests: the REAL /api/advisor/chat POST and /api/advisor/sessions/[id] PATCH handlers, with Supabase
// replaced by an in-memory PostgREST stand-in (fake-db.mjs) and the Anthropic SDK by scripted streams.
// Run: node --experimental-test-module-mocks --import ./scripts/company-context/ts-resolve.mjs --test scripts/advisor/memory-and-sessions.test.mjs
// Mocked: provider behaviour and Postgres. The SQL in migration 041 still needs a run on a real database.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb } from './fake-db.mjs';

const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b';
const SA = '11111111-1111-4111-8111-00000000000a', SB = '11111111-1111-4111-8111-00000000000b';
const T1 = 'turn-aaaa1111', OLD = 'turn-old00001';
let db, currentUser, script;

function seed() {
  db = createFakeDb({
    profiles: [{ id: A, company_name: 'Alpha Co' }, { id: B, company_name: 'Beta Co' }],
    ceo_context: [{ profile_id: A, competitors: [{ name: 'Zeta' }], additional_context: '' }, { profile_id: B, competitors: [], additional_context: '' }],
    advisor_sessions: [
      { id: SA, profile_id: A, title: 'A', updated_at: '2026-11-05T00:00:00.000Z', messages: [{ role: 'user', content: 'Old question', turnId: OLD }, { role: 'assistant', content: 'Old answer.', status: 'complete' }, { role: 'user', content: 'We now compete with Acme.', turnId: T1 }] },
      { id: SB, profile_id: B, title: 'B', updated_at: '2026-11-05T00:00:00.000Z', messages: [{ role: 'user', content: 'Hello', turnId: 'turn-bbbb2222' }] },
    ],
    feature_events: [], decisions: [], strategies: [], consequences: [],
  });
}

class APIError extends Error { constructor(status, message) { super(message); this.status = status; } }
class RateLimitError extends APIError {}
mock.module('@anthropic-ai/sdk', {
  defaultExport: class Anthropic {
    static APIError = APIError; static RateLimitError = RateLimitError;
    constructor() { this.messages = { stream: () => { const s = script.shift(); let fn = () => {}; return { on(_e, f) { fn = f; return this; }, async finalMessage() { await new Promise((r) => setImmediate(r)); fn(s.text); return { stop_reason: s.stop ?? 'end_turn', content: [{ type: 'text', text: s.text }] }; } }; } }; }
  },
});
mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: currentUser ? { id: currentUser } : null }, error: currentUser ? null : new Error('no') }) }, from: (t) => db.client.from(t) }),
    createAdminClient: async () => db.client,
  },
});
const { POST: chat } = await import('../../src/app/api/advisor/chat/route.ts');
const { PATCH } = await import('../../src/app/api/advisor/sessions/[id]/route.ts');
const { saveConversation } = await import('../../src/lib/advisor/sessions.ts');

const marker = (v) => `Noted — ${v} is now on your competitor list.\n[[VANTAGE_MEMORY]]{"field":"competitors","value":"${v}","label":"${v} as a competitor"}`;
async function ask({ user = A, sessionId = SA, turnId = T1, question = 'We now compete with Acme.' } = {}) {
  currentUser = user;
  const res = await chat(new Request('http://localhost/api/advisor/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: question }], turnId, sessionId }) }));
  const text = await res.text();
  return text.split('\n\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
}
const competitors = (id = A) => db.rows('ceo_context').find((r) => r.profile_id === id).competitors.map((c) => c.name);
const ops = () => db.rows('advisor_memory_ops');

test('two simultaneous requests for the same question write memory exactly once (and only the claimed value)', async () => {
  seed(); script = [{ text: marker('Acme') }, { text: marker('Acme Corporation') }];
  const [e1, e2] = await Promise.all([ask(), ask()]);
  assert.deepEqual(competitors(), ['Zeta', 'Acme'], 'one write, the claimed value');
  assert.equal(ops().length, 1); assert.equal(ops()[0].status, 'applied');
  const states = [e1, e2].map((ev) => ev.find((e) => e.memory)?.memory.state).sort();
  assert.ok(states.includes('applied'));
  assert.ok(states.some((s) => s === 'in_progress' || s === 'already_applied'), JSON.stringify(states));
  for (const ev of [e1, e2]) assert.equal(ev.at(-1).end.status, 'complete');
  assert.equal(db.rows('feature_events').filter((e) => e.event === 'advisor_memory_saved').length, 1);
});

test('a later retry of an applied question does nothing more', async () => {
  seed(); script = [{ text: marker('Acme') }, { text: marker('Different Name') }];
  await ask(); const ev = await ask();
  assert.equal(ev.find((e) => e.memory).memory.state, 'already_applied');
  assert.deepEqual(competitors(), ['Zeta', 'Acme']);
});

test('failure while writing memory: recorded as failed, nothing applied; the retry applies the ORIGINAL update once', async () => {
  seed(); script = [{ text: marker('Acme') }, { text: marker('Acme Ltd') }];
  db.failNext('ceo_context', 'update');
  const first = await ask();
  assert.equal(first.find((e) => e.memory).memory.state, 'failed');
  assert.deepEqual(competitors(), ['Zeta']); assert.equal(ops()[0].status, 'failed');
  const second = await ask();
  assert.equal(second.find((e) => e.memory).memory.state, 'applied');
  assert.deepEqual(competitors(), ['Zeta', 'Acme'], 'the claimed update, not the retry reply\'s');
  assert.equal(ops()[0].attempts, 2);
});

test('crash after claiming (expired lease): the next request takes over and applies the claimed update once', async () => {
  seed(); script = [{ text: marker('Other') }];
  db.rows('advisor_memory_ops').push({ profile_id: A, session_id: SA, turn_id: T1, field: 'competitors', value: 'Acme', label: 'Acme', status: 'claimed', claim_token: '22222222-2222-4222-8222-222222222222', lease_until: '2026-01-01T00:00:00.000Z', attempts: 1, saved_value: null, error: null });
  const ev = await ask();
  assert.equal(ev.find((e) => e.memory).memory.state, 'applied');
  assert.deepEqual(competitors(), ['Zeta', 'Acme']);
});

test('a live claim held by another request is reported as in progress, not applied twice', async () => {
  seed(); script = [{ text: marker('Acme') }];
  db.rows('advisor_memory_ops').push({ profile_id: A, session_id: SA, turn_id: T1, field: 'competitors', value: 'Acme', label: 'Acme', status: 'claimed', claim_token: '33333333-3333-4333-8333-333333333333', lease_until: '2999-01-01T00:00:00.000Z', attempts: 1, saved_value: null, error: null });
  const ev = await ask();
  assert.equal(ev.find((e) => e.memory).memory.state, 'in_progress');
  assert.deepEqual(competitors(), ['Zeta']);
});

test('cross-account identifiers authorize nothing', async () => {
  seed(); script = [{ text: marker('Acme') }, { text: marker('Acme') }, { text: marker('Acme') }];
  // B uses A's conversation and question ids.
  const ev = await ask({ user: B, sessionId: SA, turnId: T1 });
  assert.equal(ev.find((e) => e.memory).memory.state, 'unverified_turn');
  assert.equal(ops().length, 0); assert.deepEqual(competitors(A), ['Zeta']); assert.deepEqual(competitors(B), []);
  // A reuses an OLD question id for a new reply.
  const ev2 = await ask({ turnId: OLD, question: 'Old question' });
  assert.equal(ev2.find((e) => e.memory).memory.state, 'unverified_turn');
  // A's latest question id with different question text.
  const ev3 = await ask({ question: 'Something else entirely' });
  assert.equal(ev3.find((e) => e.memory).memory.state, 'unverified_turn');
  assert.equal(ops().length, 0); assert.deepEqual(competitors(A), ['Zeta']);
});

test('a cut-off answer with a marker never writes memory', async () => {
  seed(); script = [{ text: marker('Acme'), stop: 'max_tokens' }];
  const ev = await ask();
  assert.equal(ev.at(-1).end.status, 'max_tokens'); assert.equal(ev.at(-1).end.memory, 'skipped');
  assert.equal(ops().length, 0); assert.deepEqual(competitors(), ['Zeta']);
});

async function patch(user, id, body) {
  currentUser = user;
  const res = await PATCH(new Request('http://localhost/api/advisor/sessions/' + id, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
  return { status: res.status, body: await res.json() };
}
const session = (id) => db.rows('advisor_sessions').find((r) => r.id === id);

test('legacy PATCH: messages without a version are refused, stale writes are refused, history is never overwritten', async () => {
  seed();
  const before = JSON.stringify(session(SA).messages);
  let r = await patch(A, SA, { messages: [{ role: 'user', content: 'overwrite' }] });
  assert.equal(r.status, 428); assert.equal(JSON.stringify(session(SA).messages), before);
  r = await patch(A, SA, { messages: [{ role: 'user', content: 'overwrite' }], expectedUpdatedAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(r.status, 409); assert.equal(JSON.stringify(session(SA).messages), before);
  r = await patch(B, SA, { messages: [{ role: 'user', content: 'steal' }], expectedUpdatedAt: '2026-11-05T00:00:00.000Z' });
  assert.equal(r.status, 404); assert.equal(JSON.stringify(session(SA).messages), before);
  r = await patch(A, SA, { messages: [{ role: 'assistant', content: 'x', status: 'finished' }], expectedUpdatedAt: '2026-11-05T00:00:00.000Z' });
  assert.equal(r.status, 400); assert.equal(JSON.stringify(session(SA).messages), before);
  r = await patch(A, SA, { messages: [...JSON.parse(before), { role: 'assistant', content: 'Partial', status: 'max_tokens' }], expectedUpdatedAt: '2026-11-05T00:00:00.000Z' });
  assert.equal(r.status, 200); assert.equal(session(SA).messages.at(-1).incomplete, true, 'same validation as the active path');
  r = await patch(A, SA, { title: 'Renamed' });
  assert.equal(r.status, 200); assert.equal(session(SA).title, 'Renamed');
  r = await patch(B, SA, { title: 'Mine now' });
  assert.equal(r.status, 404); assert.equal(session(SA).title, 'Renamed');
});

test('active save path (shared function): stale version → 409, unknown or foreign conversation → 404', async () => {
  seed();
  const ok = await saveConversation(db.client, A, SA, '2026-11-05T00:00:00.000Z', [{ role: 'user', content: 'q', turnId: T1 }]);
  assert.equal(ok.status, 200);
  const stale = await saveConversation(db.client, A, SA, '2026-11-05T00:00:00.000Z', [{ role: 'user', content: 'q2' }]);
  assert.equal(stale.status, 409); assert.equal(session(SA).messages[0].content, 'q');
  const foreign = await saveConversation(db.client, B, SA, session(SA).updated_at, [{ role: 'user', content: 'x' }]);
  assert.equal(foreign.status, 404); assert.equal(session(SA).messages[0].content, 'q');
});
