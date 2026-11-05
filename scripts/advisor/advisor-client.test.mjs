// Offline tests of the REAL browser client (public/comparison/client.js) against a mocked server that applies the
// same save rules as the API (shared message schema + optimistic updated_at concurrency) and scripted Advisor streams.
// Mocked engineering verification only: provider behaviour is simulated, not observed.
// Run: node --import ./scripts/company-context/ts-resolve.mjs --test scripts/advisor/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { advisorMessage } from '../../src/lib/advisor/messages.ts';
const require = createRequire(import.meta.url);
const ROOT = new URL('../../', import.meta.url);

const sse = (o) => `data: ${typeof o === 'string' ? o : JSON.stringify(o)}\n\n`;

function makeServer() {
  const store = new Map(); let clock = 0; let chatCalls = []; let failSaves = 0; let script = null; const tick = () => new Date(Date.UTC(2026, 10, 5, 12, 0, ++clock)).toISOString();
  const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
  async function fetchImpl(url, init = {}) {
    const method = init.method || 'GET'; const body = init.body ? JSON.parse(init.body) : null; const u = String(url);
    if (u === '/api/workspace' && method === 'GET') return json({ analysis: {}, userId: 'u1', profile: { company_name: 'Test Co' }, context: {}, decisions: [], strategies: [], sessions: [...store.values()].map(({ id, title, updated_at }) => ({ id, title, updated_at })), signals: [], errors: {}, durable: { ready: true }, workspaces: {}, sessionLinks: {}, signalPreferences: {}, companyContext: {}, coverage: {} });
    if (u === '/api/workspace' && body?.operation === 'save-session') {
      const row = store.get(body.id);
      if (!row) return json({ error: 'missing' }, 404);
      if (failSaves > 0) { failSaves--; return json({ error: 'Could not save this conversation.' }, 500); }
      if (row.updated_at !== body.expectedUpdatedAt) return json({ error: 'This conversation is unavailable or changed in another view. Refresh before continuing.' }, 409);
      const messages = body.messages.map((m) => advisorMessage.parse(m));
      const next = { ...row, messages, updated_at: tick() }; store.set(row.id, next); return json(next);
    }
    if (u === '/api/advisor/sessions' && method === 'POST') { const row = { id: '11111111-1111-4111-8111-' + String(store.size + 1).padStart(12, '0'), title: body.title, messages: [], updated_at: tick() }; store.set(row.id, row); return json(row, 201); }
    if (u.startsWith('/api/advisor/sessions/') && method === 'GET') { const row = store.get(u.split('/').pop()); return row ? json(JSON.parse(JSON.stringify(row))) : json({ error: 'Session not found' }, 404); }
    if (u === '/api/advisor/chat') {
      chatCalls.push(body);
      const s = script; const signal = init.signal;
      const stream = new ReadableStream({
        async start(c) {
          const enc = new TextEncoder();
          for (const step of s.steps) {
            if (signal?.aborted) { c.error(Object.assign(new Error('aborted'), { name: 'AbortError' })); return; }
            if (step.drop) { c.error(new TypeError('network error')); return; }
            if (step.hook) await step.hook();
            c.enqueue(enc.encode(step.raw ?? sse(step)));
            await new Promise((r) => setTimeout(r, 1));
          }
          c.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    return json({ error: 'not mocked: ' + method + ' ' + u }, 500);
  }
  return { store, fetchImpl, get chatCalls() { return chatCalls; }, failNext(n = 1) { failSaves = n; }, play(steps) { script = { steps }; }, tick };
}

async function client(server) {
  const node = { innerHTML: '', open: false, dataset: {}, value: '', setAttribute() {}, removeAttribute() {}, focus() {}, remove() {}, showModal() {}, close() {}, textContent: '', querySelector: () => null, querySelectorAll: () => [] };
  const src = readFileSync(new URL('public/comparison/client.js', ROOT), 'utf8').replace(/^\(async\(\)=>\{.*await load\(true\).*$/m, '');
  const ctx = vm.createContext({
    console, URL, URLSearchParams, crypto: globalThis.crypto, TextDecoder, TextEncoder, AbortController, Response, ReadableStream, setTimeout, clearTimeout,
    fetch: server.fetchImpl,
    DecisionEngine: require('../../public/comparison/engine.js'), AttentionEngine: require('../../public/comparison/attention-engine.js'), AdvisorStream: require('../../public/comparison/advisor-stream.js'),
    document: { querySelector: () => node, querySelectorAll: () => [], addEventListener() {}, body: node, documentElement: { dataset: {} } },
    window: { addEventListener() {}, scrollTo() {} }, scrollTo() {}, location: { hash: '#advisor', search: '', pathname: '/app' },
    history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {} },
  });
  ctx.globalThis = ctx;
  vm.runInContext(src, ctx);
  await vm.runInContext('load(true)', ctx);
  const ev = (code) => vm.runInContext(code, ctx);
  return {
    ev,
    ask: (q) => ev(`(async()=>{context=null;try{await sendMessage(${JSON.stringify(q)});return null;}catch(e){return e.message;}})()`),
    retry: () => ev(`(async()=>{const q=[...session.messages].reverse().find(m=>m.role==='user').content;try{await sendMessage(q,true);return null;}catch(e){return e.message;}})()`),
    messages: () => ev('JSON.parse(JSON.stringify(session.messages))'),
    view: () => ev('messagesView()'),
  };
}
const stored = (server) => [...server.store.values()][0];

test('complete answer: saved complete, survives reload, "Saved" only after confirmation', async () => {
  const s = makeServer(); const c = await client(s);
  s.play([{ delta: 'Short answer. ' }, { delta: 'Next step: call two customers.' }, { end: { status: 'complete', stopReason: 'end_turn', memory: 'none' } }]);
  assert.equal(await c.ask('What now?'), null);
  const row = stored(s);
  assert.equal(row.messages.length, 2);
  assert.equal(row.messages[1].status, 'complete'); assert.equal(row.messages[1].incomplete, undefined);
  assert.equal(row.messages[1].turnId, row.messages[0].turnId);
  assert.match(c.view(), /Saved/);
  // reload
  c.ev(`session=null`); await c.ev(`(async()=>{session=await request('/api/advisor/sessions/${row.id}');})()`);
  assert.match(c.view(), /Advisor response · check claims/); assert.doesNotMatch(c.view(), /incomplete/);
});

test('token limit: partial text kept, labelled incomplete, still incomplete after reload, retry offered', async () => {
  const s = makeServer(); const c = await client(s);
  s.play([{ delta: 'First point. Second point is cut mid' }, { end: { status: 'max_tokens', stopReason: 'max_tokens', memory: 'none' } }]);
  await c.ask('Explain');
  const m = stored(s).messages[1];
  assert.equal(m.status, 'max_tokens'); assert.equal(m.incomplete, true); assert.equal(m.content, 'First point. Second point is cut mid');
  c.ev(`session=null`); await c.ev(`(async()=>{session=await request('/api/advisor/sessions/${stored(s).id}');})()`);
  assert.match(c.view(), /length limit/); assert.match(c.view(), /Retry this answer/);
});

test('refusal is stored as refusal, not complete', async () => {
  const s = makeServer(); const c = await client(s);
  s.play([{ delta: 'I can’t help with that request.' }, { end: { status: 'refusal', stopReason: 'refusal', memory: 'none' } }]);
  await c.ask('x');
  assert.equal(stored(s).messages[1].status, 'refusal'); assert.equal(stored(s).messages[1].incomplete, true);
});

test('a bare transport end (or a legacy [DONE]) never marks an answer complete', async () => {
  for (const tail of [[], [{ raw: 'data: [DONE]\n\n' }]]) {
    const s = makeServer(); const c = await client(s);
    s.play([{ delta: 'Looks finished but is not.' }, ...tail]);
    await c.ask('x');
    assert.equal(stored(s).messages[1].status, 'transport'); assert.equal(stored(s).messages[1].incomplete, true);
  }
});

test('network drop mid-stream: partial preserved and labelled; Stop: labelled cancelled', async () => {
  const s = makeServer(); const c = await client(s);
  s.play([{ delta: 'Half of it' }, { drop: true }]);
  await c.ask('x');
  assert.equal(stored(s).messages[1].status, 'transport'); assert.equal(stored(s).messages[1].content, 'Half of it');
  const s2 = makeServer(); const c2 = await client(s2);
  s2.play([{ delta: 'Starting' }, { hook: async () => c2.ev('streamAbort.abort()') }, { delta: ' never shown' }, { end: { status: 'complete' } }]);
  await c2.ask('x');
  assert.equal(stored(s2).messages[1].status, 'cancelled'); assert.equal(stored(s2).messages[1].content, 'Starting');
});

test('provider error with no text: no empty answer saved; question kept; retry offered', async () => {
  const s = makeServer(); const c = await client(s);
  s.play([{ error: { kind: 'overloaded', message: 'The AI provider is overloaded. Try again shortly.' } }]);
  await c.ask('x');
  assert.equal(stored(s).messages.length, 1); assert.equal(stored(s).messages[0].role, 'user');
  assert.match(c.view(), /No reply was saved/); assert.match(c.ev('ui.chatError'), /overloaded/);
});

test('failed save: answer stays on screen as "Not saved", explicit recovery adds it once', async () => {
  const s = makeServer(); const c = await client(s);
  s.play([{ delta: 'A good answer.' }, { end: { status: 'complete' } }]);
  // first save (question) succeeds, second (answer) fails
  const orig = s.fetchImpl; let saves = 0;
  const failing = async (u, i) => { if (String(u) === '/api/workspace' && i?.body?.includes('save-session') && ++saves === 2) s.failNext(1); return orig(u, i); };
  c.ev('0'); // keep client
  const c2 = await client({ ...s, fetchImpl: failing });
  await c2.ask('x');
  assert.equal(stored(s).messages.length, 1, 'answer not stored');
  assert.match(c2.view(), /Not saved/); assert.doesNotMatch(c2.view(), /· Saved/);
  assert.match(c2.view(), /Add this reply to the conversation/);
  await c2.ev('saveUnsaved()');
  assert.equal(stored(s).messages.length, 2); assert.equal(stored(s).messages[1].content, 'A good answer.');
  await c2.ev('saveUnsaved()'); // repeated click
  assert.equal(stored(s).messages.length, 2, 'no duplicate on repeated recovery');
});

test('concurrent edit in another tab: nothing overwritten; recovery places the answer after its own question, once', async () => {
  const s = makeServer(); const c = await client(s);
  s.play([{ delta: 'Answer to Q1.' }, { hook: async () => { const row = stored(s); s.store.set(row.id, { ...row, messages: [...row.messages, { role: 'user', content: 'Q2 from other tab', turnId: 'other-tab-0001' }], updated_at: s.tick() }); } }, { end: { status: 'complete' } }]);
  await c.ask('Q1');
  assert.deepEqual(stored(s).messages.map((m) => m.content), ['Q1', 'Q2 from other tab'], 'other tab kept, nothing overwritten');
  assert.match(c.view(), /changed in another tab/);
  await c.ev('saveUnsaved()');
  assert.deepEqual(stored(s).messages.map((m) => m.content), ['Q1', 'Answer to Q1.', 'Q2 from other tab']);
});

test('question save conflict: nothing sent to the model, typed question kept in the box', async () => {
  const s = makeServer(); const c = await client(s);
  s.play([{ delta: 'First.' }, { end: { status: 'complete' } }]);
  await c.ask('Q1');
  const row = stored(s); s.store.set(row.id, { ...row, updated_at: s.tick() }); // changed elsewhere
  const calls = s.chatCalls.length;
  const err = await c.ask('My carefully typed question');
  assert.match(err, /changed in another tab/);
  assert.equal(s.chatCalls.length, calls, 'no model call');
  assert.equal(c.ev('ui.draft'), 'My carefully typed question');
});

test('retry after an incomplete answer: same turn id, earlier text kept as an attempt, no duplicate turns', async () => {
  const s = makeServer(); const c = await client(s);
  s.play([{ delta: 'Cut off ans' }, { end: { status: 'max_tokens' } }]);
  await c.ask('Q');
  s.play([{ delta: 'Full answer.' }, { end: { status: 'complete' } }]);
  await c.retry();
  const msgs = stored(s).messages;
  assert.deepEqual(msgs.map((m) => m.role), ['user', 'assistant']);
  assert.equal(msgs[1].status, 'complete'); assert.equal(msgs[1].attempts[0].content, 'Cut off ans');
  assert.equal(s.chatCalls[1].turnId, s.chatCalls[0].turnId, 'retry reuses the turn id (memory written at most once)');
  assert.ok(!s.chatCalls[1].messages.some((m) => m.content === 'Cut off ans'), 'unfinished text is not sent back to the model as an answer');
});
