// Handler-level tests: the REAL /api/advisor/chat POST and /api/advisor/sessions/[id] PATCH handlers, with Supabase
// replaced by an in-memory PostgREST stand-in (fake-db.mjs) and the Anthropic SDK by scripted streams.
// Run: node --experimental-test-module-mocks --import ./scripts/company-context/ts-resolve.mjs --test scripts/advisor/memory-and-sessions.test.mjs
// Mocked: provider behaviour and Postgres. The SQL in migration 041 still needs a run on a real database.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb } from './fake-db.mjs';

const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b';
const SA = '11111111-1111-4111-8111-00000000000a', SB = '11111111-1111-4111-8111-00000000000b';
const T1 = 'turn-aaaa1111', OLD = 'turn-old00001', T2 = 'turn-aaaa2222';
const SA2 = '11111111-1111-4111-8111-0000000000a2';
let db, currentUser, script;

function seed(opts) {
  db = createFakeDb({
    profiles: [{ id: A, company_name: 'Alpha Co' }, { id: B, company_name: 'Beta Co' }],
    ceo_context: [{ profile_id: A, competitors: [{ name: 'Zeta' }], additional_context: '' }, { profile_id: B, competitors: [], additional_context: '' }],
    advisor_sessions: [
      { id: SA, profile_id: A, title: 'A', updated_at: '2026-11-05T00:00:00.000Z', messages: [{ role: 'user', content: 'Old question', turnId: OLD }, { role: 'assistant', content: 'Old answer.', status: 'complete' }, { role: 'user', content: 'We now compete with Acme.', turnId: T1 }] },
      { id: SA2, profile_id: A, title: 'A2', updated_at: '2026-11-05T00:00:00.000Z', messages: [{ role: 'user', content: 'Second question', turnId: T2 }] },
      { id: SB, profile_id: B, title: 'B', updated_at: '2026-11-05T00:00:00.000Z', messages: [{ role: 'user', content: 'Hello', turnId: 'turn-bbbb2222' }] },
    ],
    feature_events: [], decisions: [], strategies: [], consequences: [],
  }, opts);
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
const { commitMemory, supabaseMemoryOps } = await import('../../src/lib/advisor/memory-ops.ts');

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
  db.failNext('rpc', 'rpc');
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

test('without migration 041: the answer still completes, profile updates are refused with a stated reason', async () => {
  seed({ missing: ['advisor_memory_ops'] }); script = [{ text: marker('Acme') }];
  const ev = await ask();
  const memory = ev.find((e) => e.memory).memory;
  assert.equal(memory.ok, false); assert.equal(memory.state, 'unavailable'); assert.match(memory.error, /unavailable/);
  assert.equal(ev.at(-1).end.status, 'complete');
  assert.match(ev.filter((e) => e.delta).map((e) => e.delta).join(''), /Noted/);
  assert.deepEqual(competitors(), ['Zeta'], 'nothing written');
});

const setMarker = (field, v) => `Noted.\n[[VANTAGE_MEMORY]]{"field":"${field}","value":"${v}","label":"${field} is ${v}"}`;
const ctxA = () => db.rows('ceo_context').find((r) => r.profile_id === A);
const version = (field) => db.rows('company_fact_versions').find((r) => r.profile_id === A && r.field === field)?.version ?? 0;

test('two questions setting the same field at once: one applies, the other is kept as an unresolved conflict', async () => {
  seed(); script = [{ text: setMarker('top_priority', 'Growth') }, { text: setMarker('top_priority', 'Fundraising') }];
  const [e1, e2] = await Promise.all([ask(), ask({ sessionId: SA2, turnId: T2, question: 'Second question' })]);
  const states = [e1, e2].map((ev) => ev.find((e) => e.memory).memory.state).sort();
  assert.deepEqual(states, ['applied', 'conflict']);
  const winner = ops().find((o) => o.status === 'applied'), loser = ops().find((o) => o.status === 'conflict');
  assert.equal(ctxA().top_priority, winner.value, 'the applied value stands');
  assert.equal(loser.conflict.proposed, loser.value === 'Growth' ? 'Growth' : 'Fundraising', 'the other proposal is preserved, not dropped');
  assert.equal(version('top_priority'), 1, 'written exactly once');
});

test('two questions adding different competitors at once: both are kept (no lost update)', async () => {
  seed(); script = [{ text: marker('Acme') }, { text: marker('Brio') }];
  const [e1, e2] = await Promise.all([ask(), ask({ sessionId: SA2, turnId: T2, question: 'Second question' })]);
  assert.deepEqual([e1, e2].map((ev) => ev.find((e) => e.memory).memory.state), ['applied', 'applied']);
  assert.deepEqual(competitors().sort(), ['Acme', 'Brio', 'Zeta']);
  assert.equal(version('competitors'), 2);
});

test('an old retry after a newer correction does not overwrite it: stored as a conflict, history kept', async () => {
  seed(); script = [{ text: setMarker('product_description', 'Old idea from the first answer') }, { text: setMarker('product_description', 'whatever') }];
  db.failNext('rpc', 'rpc');
  const first = await ask();
  assert.equal(first.find((e) => e.memory).memory.state, 'failed');
  // The founder corrects the field directly (any write path bumps the version via the trigger).
  await db.client.from('ceo_context').update({ product_description: 'Founder correction: payroll for restaurants' }).eq('profile_id', A);
  const retry = await ask();
  assert.equal(retry.find((e) => e.memory).memory.state, 'conflict');
  assert.equal(ctxA().product_description, 'Founder correction: payroll for restaurants');
  assert.equal(ops()[0].status, 'conflict');
  assert.ok(db.rows('company_fact_history').some((h) => h.field === 'product_description' && h.new_value.startsWith('Founder correction')));
});

test('a genuinely newer correction (answer written after the latest change) is applied', async () => {
  seed();
  await db.client.from('ceo_context').update({ target_customer: 'Restaurants' }).eq('profile_id', A); // v1, before the answer
  script = [{ text: setMarker('target_customer', 'Restaurant groups with 5+ sites') }];
  const ev = await ask();
  assert.equal(ev.find((e) => e.memory).memory.state, 'applied');
  assert.equal(ctxA().target_customer, 'Restaurant groups with 5+ sites');
  assert.equal(version('target_customer'), 2);
});

test('a worker that continues after its claim expired cannot write; the takeover writes once', async () => {
  seed();
  const key = { profileId: A, sessionId: SA, turnId: T1 };
  const proposal = { field: 'top_priority', value: 'Growth', label: 'Growth' };
  let release; const gate = new Promise((r) => { release = r; });
  const real = supabaseMemoryOps(db.client);
  const stalled = { ...real, readField: async (...a) => { await gate; return real.readField(...a); } };
  const verifyTurn = async () => true;
  const workerA = commitMemory({ store: stalled, key, proposal, basedOnVersion: 0, verifyTurn });
  while (!ops().length) await new Promise((r) => setImmediate(r));
  ops()[0].lease_until = '2026-01-01T00:00:00.000Z'; // A's lease runs out while it is stalled
  const b = await commitMemory({ store: real, key, proposal: { ...proposal, value: 'Fundraising' }, basedOnVersion: 0, verifyTurn });
  assert.equal(b.state, 'applied');
  assert.equal(ctxA().top_priority, 'Growth', 'the takeover applies the ORIGINAL claimed update');
  release();
  const a = await workerA;
  assert.equal(a.state, 'superseded');
  assert.equal(version('top_priority'), 1, 'written exactly once');
});

test('a worker whose lease expired is refused even before anyone takes over', async () => {
  seed();
  const key = { profileId: A, sessionId: SA, turnId: T1 };
  let release; const gate = new Promise((r) => { release = r; });
  const real = supabaseMemoryOps(db.client);
  const stalled = { ...real, apply: async (...a) => { await gate; return real.apply(...a); } };
  const p = commitMemory({ store: stalled, key, proposal: { field: 'arr_band', value: '1m_5m', label: 'x' }, basedOnVersion: 0, verifyTurn: async () => true });
  while (!ops().length) await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  ops()[0].lease_until = '2026-01-01T00:00:00.000Z';
  release();
  assert.equal((await p).state, 'superseded');
  assert.equal(ctxA().arr_band, undefined);
});

test('without migration 042: answers complete, profile updates are off with a stated reason', async () => {
  seed({ missing: ['company_fact_versions', 'rpc'] }); script = [{ text: setMarker('top_priority', 'Growth') }];
  const ev = await ask();
  const m = ev.find((e) => e.memory).memory;
  assert.equal(m.state, 'unavailable'); assert.equal(ev.at(-1).end.status, 'complete');
  assert.equal(ops().length, 0); assert.equal(ctxA().top_priority, undefined);
});
