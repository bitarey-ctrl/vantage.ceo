// REPLAY TEST (no provider calls): the nine real Sonnet 5.5 answers captured in the 2026-11-07 retest, streamed by a
// scripted provider through the REAL Advisor chat route (number gate), the REAL browser client (public/comparison),
// the REAL save path (/api/workspace save-session → saveConversation) and the REAL session reload route, on an
// in-memory database. It verifies deterministic post-processing only; it says nothing about how the model would
// answer again. Run:
// node --experimental-test-module-mocks --import ./scripts/company-context/ts-resolve.mjs --test scripts/advisor/replay-retest.test.mjs
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createFakeDb } from './fake-db.mjs';
import { retestCases, chunks } from './replay-lib.mjs';
const require = createRequire(import.meta.url);

const A = '00000000-0000-4000-8000-00000000000a';
let script, db;
mock.module('@anthropic-ai/sdk', { defaultExport: class Anthropic {
  static APIError = class extends Error {}; static RateLimitError = class extends Error {};
  constructor() { this.messages = { stream: () => { const s = script; let fn = () => {}; return {
    on(_e, f) { fn = f; return this; },
    async finalMessage() {
      for (const p of s.pieces) fn(p);
      return { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: s.pieces.join('') }] };
    } }; } }; }
} });
mock.module('@/lib/supabase/server', { namedExports: {
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: A } }, error: null }), signOut: async () => ({ error: null }) }, from: (t) => db.client.from(t), rpc: db.client.rpc }),
  createAdminClient: async () => db.client,
} });
const { REMOVED_MARK, REMOVAL_NOTE_START } = await import('../../src/lib/advisor/numbers.ts');
const chat = await import('../../src/app/api/advisor/chat/route.ts');
const sessions = await import('../../src/app/api/advisor/sessions/route.ts');
const sessionById = await import('../../src/app/api/advisor/sessions/[id]/route.ts');
const workspace = await import('../../src/app/api/workspace/route.ts');

const BASE = 'http://localhost';
async function fetchImpl(url, init = {}) {
  const u = String(url), method = init.method || 'GET';
  const req = (path) => new Request(BASE + path, { method, headers: { 'content-type': 'application/json', origin: BASE, host: 'localhost' }, body: init.body, signal: init.signal });
  if (u === '/api/workspace') return method === 'GET' ? workspace.GET() : workspace.POST(req(u));
  if (u === '/api/advisor/sessions' && method === 'POST') return sessions.POST(req(u));
  if (u.startsWith('/api/advisor/sessions/') && method === 'GET') return sessionById.GET(req(u), { params: Promise.resolve({ id: u.split('/').pop() }) });
  if (u === '/api/advisor/chat') return chat.POST(req(u));
  return new Response(JSON.stringify({ error: `not routed: ${method} ${u}` }), { status: 500 });
}

async function browser() {
  const node = { innerHTML: '', open: false, dataset: {}, value: '', setAttribute() {}, removeAttribute() {}, focus() {}, remove() {}, showModal() {}, close() {}, textContent: '', querySelector: () => null, querySelectorAll: () => [] };
  const src = readFileSync(new URL('../../public/comparison/client.js', import.meta.url), 'utf8').replace(/^\(async\(\)=>\{.*await load\(true\).*$/m, '');
  const ctx = vm.createContext({
    console, URL, URLSearchParams, crypto: globalThis.crypto, TextDecoder, TextEncoder, AbortController, Response, ReadableStream, setTimeout, clearTimeout,
    fetch: fetchImpl,
    DecisionEngine: require('../../public/comparison/engine.js'), AttentionEngine: require('../../public/comparison/attention-engine.js'), AdvisorStream: require('../../public/comparison/advisor-stream.js'),
    document: { querySelector: () => node, querySelectorAll: () => [], addEventListener() {}, body: node, documentElement: { dataset: {} } },
    window: { addEventListener() {}, scrollTo() {} }, scrollTo() {}, location: { hash: '#advisor', search: '', pathname: '/app' },
    history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {} },
  });
  ctx.globalThis = ctx;
  vm.runInContext(src, ctx);
  await vm.runInContext('load(true)', ctx);
  return (code) => vm.runInContext(code, ctx);
}

/** Ask the case's question in the real client; return what was shown, what was stored and what a reload shows. */
async function replay(c, raw = c.raw, size = 17) {
  db = createFakeDb({ profiles: [{ id: A, company_name: 'Test Co', plan: 'pro' }], ceo_context: [{ profile_id: A, ...c.ctx }], advisor_sessions: [], feature_events: [], decisions: [], strategies: [], consequences: [] });
  script = { pieces: chunks(raw, size) };
  const ev = await browser();
  const err = await ev(`(async()=>{context=null;try{await sendMessage(${JSON.stringify(c.question)});return ui.chatError||null;}catch(e){return e.message;}})()`);
  const shown = ev('JSON.parse(JSON.stringify(session.messages))').at(-1);
  const row = db.rows('advisor_sessions')[0];
  ev('session=null');
  await ev(`(async()=>{session=await request('/api/advisor/sessions/${row.id}');})()`);
  return { err, shown, stored: row.messages.at(-1), reloaded: ev('JSON.parse(JSON.stringify(session.messages))').at(-1), view: ev('messagesView()') };
}

const cases = retestCases();
const byId = Object.fromEntries(cases.map((c) => [c.id, c]));
const count = (s, x) => s.split(x).length - 1;
const restore = (text, removed) => { let i = 0; return text.split(REMOVAL_NOTE_START)[0].replaceAll(REMOVED_MARK, () => removed[i++]); };
const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

test('replay fixture: 9 answers, all served by claude-sonnet-5-5, raw text reconstructed exactly from the live record', () => {
  assert.equal(cases.length, 9);
  for (const c of cases) assert.equal(c.servedModel, 'claude-sonnet-5-5', c.id);
  assert.deepEqual(cases.filter((c) => c.removed.length).map((c) => [c.id, c.removed.map((r) => r.text)]),
    [['bypass-vs-churn:b', ['8%']], ['fresh-commission-direct', ['15%']], ['fresh2-fee-benchmark', ['3.4%', '3.4%']]]);
});

for (const c of cases) {
  test(`replay ${c.id}: shown = saved = reloaded; only unsupported figures differ from the model's text`, async () => {
    const r = await replay(c);
    assert.equal(r.err, null);
    assert.equal(r.shown.status, 'complete');
    assert.equal(r.stored.content, r.shown.content, 'saved text equals what was shown');
    assert.equal(r.reloaded.content, r.shown.content, 'reloaded text equals what was shown');
    assert.equal(r.reloaded.status, 'complete');
    const delivered = r.shown.content;
    const expectRemoved = c.id === 'fresh-commission-direct' ? ['15%'] : [];
    assert.equal(count(delivered, REMOVED_MARK), expectRemoved.length, 'removed exactly the unsupported figures');
    // Everything else (caveats, sources, calculations, questions, next steps) is the model's text, character for character.
    assert.equal(restore(delivered, expectRemoved), c.raw.trim());
    assert.equal(delivered.includes(REMOVAL_NOTE_START), expectRemoved.length > 0, 'note only when something was removed');
    // Rendered as the founder sees it: the text is in the page, and the note has no stray markdown.
    assert.ok(r.view.includes(escHtml(delivered.split('\n\n')[0])), 'first paragraph rendered');
    assert.doesNotMatch(r.view, /\*I removed/);
  });
}

test("the founder's own figures survive with their meaning: 8% commission, 3.4% payment fee, £12 membership", async () => {
  const bypass = (await replay(byId['bypass-vs-churn:b'])).shown.content;
  assert.match(bypass, /the platform costs 8% of each order/);
  const fee = byId['fresh2-fee-benchmark'];
  const feeOut = (await replay(fee)).shown.content;
  assert.equal(count(feeOut, '3.4%'), count(fee.raw, '3.4%'));
  assert.match(feeOut, /Whether 3\.4% hurts depends on your margin per camera/);
  assert.match(feeOut, /I can show you what 3\.4% costs in absolute terms/);
  const premium = byId['fresh2-premium-price'];
  const premiumOut = (await replay(premium)).shown.content;
  assert.equal(count(premiumOut, '£12'), count(premium.raw, '£12'));
  assert.ok(count(premiumOut, '£12') >= 2);
});

test('the one unsupported figure is removed without breaking the sentence or changing the advice', async () => {
  const out = (await replay(byId['fresh-commission-direct'])).shown.content;
  assert.match(out, /Dropping to, say, \[unsupported figure removed\] doesn't change that math much\. It still costs them something versus free/);
  assert.doesNotMatch(out, /15%/);
  assert.doesNotMatch(out, /[\w%£$€]\[unsupported|removed\][\w%]/, 'no unit or digit glued to the mark');
  // The recommendation is the model's: diagnose first, a lower fee does not beat zero, call the last ten walkers.
  assert.match(out, /a lower fee won't stop it/);
  assert.match(out, /contact the last ten walkers who left/);
  assert.match(out, /I removed a figure that isn't supported/);
  assert.match(out, /20% buys them very little/, 'the supplied 20% stays');
});

test('a supported number reused in an unrelated claim is still removed; its legitimate use in the same answer stays', async () => {
  const inject = (c, after, sentence) => { assert.ok(c.raw.includes(after), c.id); return c.raw.replace(after, `${after} ${sentence}`); };
  const bypass = byId['bypass-vs-churn:b'];
  let out = (await replay(bypass, inject(bypass, 'the platform costs 8% of each order.', 'Expect about 8% of your buyers to leave for a competitor this year.'))).shown.content;
  assert.match(out, /the platform costs 8% of each order\. Expect about \[unsupported figure removed\] of your buyers to leave/);
  const fee = byId['fresh2-fee-benchmark'];
  out = (await replay(fee, inject(fee, 'which I don\'t have.', 'Most camera shops convert 3.4% of visitors.'))).shown.content;
  assert.match(out, /Most camera shops convert \[unsupported figure removed\] of visitors\./);
  assert.match(out, /Whether 3\.4% hurts depends on your margin/);
  const premium = byId['fresh2-premium-price'];
  out = (await replay(premium, inject(premium, 'not from the £12 plus some arbitrary uplift.', 'Premium members typically spend £12 a week on prints.'))).shown.content;
  assert.match(out, /Premium members typically spend \[unsupported figure removed\] a week on prints\./);
  assert.match(out, /not from the £12 plus some arbitrary uplift/);
});

test('delivery does not depend on how the provider splits the stream (1, 4, 50 characters, one piece)', async () => {
  for (const id of ['bypass-vs-churn:b', 'fresh-commission-direct', 'fresh2-fee-benchmark']) {
    const ref = (await replay(byId[id])).shown.content;
    for (const size of [1, 4, 50, 1e6]) assert.equal((await replay(byId[id], undefined, size)).shown.content, ref, `${id} @${size}`);
  }
});
