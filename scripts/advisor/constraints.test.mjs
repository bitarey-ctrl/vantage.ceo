// Decisive limits: traced through context selection (the REAL /api/advisor/chat handler reading a stored row),
// prompt construction (the exact system prompt sent), and the answer (the preserved failed outputs of the
// 2026-11-05 isolated run must be flagged by the answer check; a fitting answer must not be).
// Run: node --experimental-test-module-mocks --import ./scripts/company-context/ts-resolve.mjs --test scripts/advisor/constraints.test.mjs
// Mocked: Postgres (fake-db.mjs) and the provider. Whether the model follows the prompt needs a paid run.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeDb } from './fake-db.mjs';

const A = '00000000-0000-4000-8000-00000000000a';
const pairs = JSON.parse(readFileSync(new URL('./reasoning-pairs.json', import.meta.url))).pairs;
const baseline = JSON.parse(readFileSync(new URL('./reasoning-baseline-2026-11-05.json', import.meta.url))).pairs;
let db, captured;

function seed(ctx) {
  db = createFakeDb({
    profiles: [{ id: A, company_name: 'Test Co' }],
    ceo_context: [{ profile_id: A, ...ctx }],
    advisor_sessions: [], feature_events: [], decisions: [], strategies: [], consequences: [],
  });
}
mock.module('@anthropic-ai/sdk', {
  defaultExport: class Anthropic {
    static APIError = class extends Error {}; static RateLimitError = class extends Error {};
    constructor() { this.messages = { stream: (args) => { captured = args; let fn = () => {}; return { on(_e, f) { fn = f; return this; }, async finalMessage() { fn('ok'); return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }; } }; } }; }
  },
});
mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: A } }, error: null }) }, from: (t) => db.client.from(t) }),
    createAdminClient: async () => db.client,
  },
});
const { POST: chat } = await import('../../src/app/api/advisor/chat/route.ts');
const { checkAnswer, classifyLimit, decisiveLimitsBlock } = await import('../../src/lib/company-context/constraints.ts');
const { normaliseCompanyContext, companyContextBlock } = await import('../../src/lib/company-context/context.ts');

function ctxFor(p, side) {
  const ctx = { business_facts: {}, ...p.base };
  if (p.differ.field.startsWith('business_facts.')) ctx.business_facts = { [p.differ.field.split('.')[1]]: p.differ[side] };
  else ctx[p.differ.field] = p.differ[side] || null;
  return ctx;
}
async function systemPromptFor(ctx, question) {
  seed(ctx); captured = null;
  const res = await chat(new Request('http://localhost/api/advisor/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: question }] }) }));
  await res.text();
  assert.ok(captured, 'provider was called');
  return captured.system;
}
const pair = (id) => pairs.find((p) => p.id === id);

test('context selection: a stored constraint reaches the system prompt (it did not before: the query omitted business_facts)', async () => {
  for (const id of ['future-vs-feasible', 'contribution-vs-cash']) {
    const p = pair(id);
    const sys = await systemPromptFor(ctxFor(p, 'b'), p.question);
    const text = p.differ.b[0].text;
    assert.match(sys, new RegExp(`Hard limits they stated: ${text}`));
    assert.match(sys, /## DECISIVE LIMITS/);
    assert.match(sys, /## BEFORE YOU SEND/);
    assert.ok(sys.indexOf('## DECISIVE LIMITS') < sys.indexOf('## BUSINESS REASONING'), 'limits come before the general rules');
    assert.ok(sys.trimEnd().endsWith(sys.slice(sys.indexOf('## BEFORE YOU SEND')).trimEnd()), 'final check is the last instruction');
    assert.doesNotMatch(sys, /limits on what it can do now \(cash, team, time\)/, 'no longer listed as unknown');
  }
});

test('prompt construction: each failed case gets its concrete implication', async () => {
  const eng = await systemPromptFor(ctxFor(pair('future-vs-feasible'), 'b'), 'q');
  assert.match(eng, /Nothing that needs engineering or product build work before Q3/);
  assert.match(eng, /scheduled for Q3 or later/);
  const cash = await systemPromptFor(ctxFor(pair('contribution-vs-cash'), 'b'), 'q');
  assert.match(cash, /Cash is the binding limit/);
  assert.match(cash, /Running out of cash is the main risk/);
  assert.match(cash, /commitment .* that outlasts it/);
  const com = await systemPromptFor(ctxFor(pair('subscription-vs-commission'), 'b'), 'q');
  assert.match(com, /zero-fee alternative/);
  const sub = await systemPromptFor(ctxFor(pair('subscription-vs-commission'), 'a'), 'q');
  assert.doesNotMatch(sub, /zero-fee alternative/, 'subscription model gets no commission frame');
  assert.doesNotMatch(sub, /## DECISIVE LIMITS/);
});

test('prompt construction: no constraint → no hard-limits list and the unknown is still stated', async () => {
  const sys = await systemPromptFor(ctxFor(pair('future-vs-feasible'), 'a'), 'q');
  assert.doesNotMatch(sys, /HARD LIMITS/);
  assert.match(sys, /HOW THEY GET PAID/, 'the marketplace earns commission, so the direct-deal frame still applies');
  assert.match(sys, /limits on what it can do now \(cash, team, time\)/);
});

test('benchmark and tone rules are in the prompt', async () => {
  const sys = await systemPromptFor(ctxFor(pair('future-vs-feasible'), 'a'), 'q');
  assert.match(sys, /Every number you write .* must come from their details, the SIGNALS, or a calculation you show/);
  assert.match(sys, /do not swap one invented number for another/);
  assert.match(sys, /"Illustration, not a benchmark:"/);
  assert.match(sys, /not a dramatic preamble \("The hard truth"/);
});

test('hard limits, preferences and estimates are kept apart', () => {
  assert.equal(classifyLimit({ text: 'No engineering capacity until Q3' }).kind, 'engineering');
  assert.equal(classifyLimit({ text: 'No engineering capacity until Q3' }).until, 'Q3');
  assert.equal(classifyLimit({ text: 'About three months of cash left' }).kind, 'cash');
  assert.equal(classifyLimit({ text: 'Kiln capacity is fully booked until March' }).until, 'March');
  assert.equal(classifyLimit({ text: 'We would rather not raise money this year' }).strength, 'preference');
  assert.equal(classifyLimit({ text: 'Overdraft limit reached', strength: 'preference' }).strength, 'preference', 'stored strength wins');
  const c = normaliseCompanyContext('x', {}, { business_facts: { constraints: [{ text: 'No new hires this quarter' }, { text: 'We would rather not raise money this year' }], estimates: [{ id: 'e1', label: 'Gross margin', value: 40, unit: '%', basis: 'estimate' }] } });
  const block = companyContextBlock(c);
  assert.match(block, /Hard limits they stated: No new hires this quarter\n/);
  assert.match(block, /Preferences they stated \(can be traded off\): We would rather not raise money this year/);
  assert.match(block, /their estimates unless marked actual/);
  const limits = decisiveLimitsBlock(c);
  assert.match(limits, /HARD LIMITS[\s\S]*No new hires[\s\S]*PREFERENCES[\s\S]*rather not raise[\s\S]*ESTIMATES[\s\S]*Gross margin 40% \(estimate\)/);
});

test('answer check flags all three preserved failed outputs (and says it is only a mention check)', () => {
  const ans = (id) => baseline.find((p) => p.id === id).answers.b.text;
  const ctx = (id) => normaliseCompanyContext('x', {}, ctxFor(pair(id), 'b'));
  const src = (id) => `${companyContextBlock(ctx(id))}\n${pair(id).question}`;

  const eng = checkAnswer(ans('future-vs-feasible'), ctx('future-vs-feasible'), src('future-vs-feasible'));
  assert.deepEqual(eng.limitsMissing, ['No engineering capacity until Q3'], 'mentions "hiring engineers" but never the Q3 limit');
  const cash = checkAnswer(ans('contribution-vs-cash'), ctx('contribution-vs-cash'), src('contribution-vs-cash'));
  assert.deepEqual(cash.limitsMissing, ['About three months of cash left'], 'says "cash left to run the business", never the runway');
  assert.ok(cash.benchmarkPhrases.includes('most tea shops'));
  assert.ok(cash.unsupportedFigures.some((f) => f.includes('8')), JSON.stringify(cash.unsupportedFigures));
  const com = checkAnswer(ans('subscription-vs-commission'), ctx('subscription-vs-commission'), src('subscription-vs-commission'));
  assert.equal(com.commissionDirectCompared, false);
  assert.match(cash.limitation, /not that the advice actually complies/);
});

test('answer check passes answers that visibly use the limits and invent no figures', () => {
  const eng = normaliseCompanyContext('x', {}, ctxFor(pair('future-vs-feasible'), 'b'));
  assert.deepEqual(checkAnswer('Not before Q3. With no engineers free, start with a partner inspector this month and decide on building after Q3.', eng, '').limitsMissing, []);
  const cash = normaliseCompanyContext('x', {}, ctxFor(pair('contribution-vs-cash'), 'b'));
  const r = checkAnswer('With about three months of cash left, keep any ad test small and stoppable.', cash, `${companyContextBlock(cash)}`);
  assert.deepEqual(r.limitsMissing, []); assert.deepEqual(r.unsupportedFigures, []); assert.deepEqual(r.benchmarkPhrases, []);
  const com = normaliseCompanyContext('x', {}, ctxFor(pair('subscription-vs-commission'), 'b'));
  assert.equal(checkAnswer('A lower rate still loses to the contractor booking the job directly for free.', com, '').commissionDirectCompared, true);
});
