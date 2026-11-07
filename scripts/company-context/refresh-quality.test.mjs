// Refresh truthfulness and relevance quality, offline. Run:
// node --experimental-test-module-mocks --import ./scripts/company-context/ts-resolve.mjs --test scripts/company-context/refresh-quality.test.mjs
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

let gateScript = [];
mock.module('@/lib/ai/claude', { namedExports: { CLAUDE_MODEL: 'test', callClaude: async () => { const s = gateScript.shift(); if (s instanceof Error) throw s; return s; } } });
mock.module('@/lib/env', { namedExports: { GATE_ENV: [], requireEnv: () => {} } });
const { withRunStatus, composeRunStatus, classifyFailure, recordStage } = await import('../../src/lib/company-context/run-status.ts');
const { gateSignals } = await import('../../src/lib/signals/gate.ts');
const { ProviderBudgetError } = await import('../../src/lib/ai/provider-budget.ts');
const { normaliseCompanyContext } = await import('../../src/lib/company-context/context.ts');
const { connectionFor } = await import('../../src/lib/company-context/relevance.ts');
const { verifyCandidates, connectAndCheck, ASSESSMENT_VERSION } = await import('../../src/lib/company-context/verify.ts');
const { parseRss } = await import('../../src/lib/company-context/ingest.ts');
const { sourceEligibility } = await import('../../src/lib/company-context/sources.ts');

const connErr = () => Object.assign(new Error('Connection error.'), { name: 'APIConnectionError', cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
const cands = (n) => Array.from({ length: n }, (_, i) => ({ title: `Item ${i}`, content: 'x', url: `https://e.example/${i}`, published_at: '2026-11-06', source_name: 'S' }));

test('a partly failed gate is recorded per batch and composes to "partial", naming stage and failure type', async () => {
  // 3 batches (BATCH_SIZE 25 → 70 candidates): ok, connection error, budget refusal.
  gateScript = [[], connErr(), new ProviderBudgetError('Dollar ceiling')];
  const { result, stages } = await withRunStatus(async () => { recordStage('reassessment', { ok: true, items: 2 }); return gateSignals(cands(70)); });
  assert.deepEqual(result, []);
  const gate = stages.find((s) => s.stage === 'gate');
  assert.deepEqual({ attempted: gate.attempted, ok: gate.succeeded, failed: gate.failed, kinds: gate.kinds }, { attempted: 3, ok: 1, failed: 2, kinds: { connection: 1, budget: 1 } });
  const run = composeRunStatus(stages);
  assert.equal(run.status, 'partial');
  assert.deepEqual(run.affected, ['gate']);
  assert.match(run.message, /Checking new shared news: 2 of 3 steps failed because (the connection to the AI service failed; and the model-call budget|the model-call budget.*; and the connection)/);
  assert.match(run.message, /not judged unimportant, and your earlier results are unchanged/);
  assert.doesNotMatch(run.message, /Nothing material/);
});

test('every analysis stage failing composes to "failed"; collection success alone never makes it complete', async () => {
  gateScript = [connErr(), connErr()];
  const { error, stages } = await withRunStatus(async () => { recordStage('collection', { ok: true, items: 30 }); return gateSignals(cands(40)); });
  assert.match(String(error?.message), /all 2 check\(s\) of 40 candidates failed because the connection to the AI service failed/);
  assert.equal(composeRunStatus(stages).status, 'failed');
  assert.equal(composeRunStatus([{ stage: 'collection', attempted: 3, succeeded: 3, failed: 0, items: 9, kinds: {} }]).status, 'complete');
});

test('failure classes come from type and cause code, not message text', () => {
  assert.equal(classifyFailure(connErr()), 'connection');
  assert.equal(classifyFailure(Object.assign(new Error('x'), { name: 'APIConnectionTimeoutError' })), 'timeout');
  assert.equal(classifyFailure(Object.assign(new Error('Overloaded'), { status: 529 })), 'provider');
  assert.equal(classifyFailure(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })), 'connection');
  assert.equal(classifyFailure(new ProviderBudgetError('x')), 'budget');
  assert.equal(classifyFailure(Object.assign(new Error('bad key sk-ant-…'), { status: 401 })), 'auth');
});

const pact = normaliseCompanyContext('p', { company_name: 'Pact Coffee' }, {
  product_description: 'It sells freshly roasted speciality coffee as espresso and filter beans and coffee pods, mainly through subscriptions.',
  target_customer: 'home coffee drinkers and gift buyers', geography_detail: 'United Kingdom', competitors: ['Brio Coffee Club'],
  revenue_model: 'Most revenue comes from recurring direct-to-consumer coffee subscriptions, plus wholesale to businesses and retailers.',
});

test('junk keyword matches no longer reach assessment ("comes", "retailer" from the revenue model)', () => {
  const pe = connectionFor({ title: "BC Partners' European chair relocates to Greece as firm plans Athens expansion", content: 'The private equity firm comes to Athens; UK retailer deals continue.' }, pact);
  assert.equal(pe.candidate, false, JSON.stringify(pe.matched));
  // A genuine product phrase still is a candidate.
  assert.equal(connectionFor({ title: 'Prices of coffee pods rise in the UK', content: '' }, pact).candidate, true);
});

test('action needs direct exposure; possible exposure becomes watch with its trigger, or background', async () => {
  const conn = { status: 'connected', score: 1, text: '', basis: '', matched: [], contextVersion: pact.version, candidate: true };
  const items = [{ key: 'k', title: 'Keurig launches plastic-free pods', content: '', connection: conn, evidenceLevel: 'aggregator-headline' },
    { key: 'n', title: 'Keurig launches plastic-free pods (no trigger)', content: '', connection: conn, evidenceLevel: 'aggregator-headline' }];
  const base = { what_changed: 'Keurig launched plastic-free pods.', connection: 'You sell coffee pods.', basis_fact: 'coffee pods, mainly through subscriptions', effect: 'If your subscribers start asking for plastic-free pods, you could lose some.', next_step: 'Check your pod materials.' };
  const v = await verifyCandidates(pact, items, async () => [
    { i: 0, decision: 'relevant', exposure: 'possible', ...base, watch_for: 'UK pod competitors or your own subscribers ask for plastic-free pods' },
    { i: 1, decision: 'relevant', exposure: 'possible', ...base, watch_for: null },
  ]);
  assert.equal(v.get('k').decision, 'watch'); assert.match(v.get('k').watchFor, /plastic-free/);
  assert.equal(v.get('n').decision, 'reject'); assert.equal(v.get('n').rejectReason, 'background');
});

test('stored judgements carry the rules version, so judgements made under older rules are rechecked', async () => {
  const out = await connectAndCheck(pact, [{ key: 'a', title: 'Coffee pods prices rise in the UK', content: '' }], { call: async () => [{ i: 0, decision: 'watch', exposure: 'possible', what_changed: 'x', connection: 'y', basis_fact: 'coffee pods, mainly through subscriptions', effect: 'z', watch_for: 't' }], connectionFor });
  assert.equal(out[0].stored.assessmentVersion, ASSESSMENT_VERSION);
});

test('numeric HTML entities in feed titles are decoded', () => {
  const xml = '<rss><channel><item><title>BC Partners&#039; chair &#x2014; Athens</title><link>https://e.example/a</link></item></channel></rss>';
  assert.equal(parseRss(xml)[0].title, "BC Partners' chair — Athens");
});

test('source eligibility: discovery candidates are monitored only after identity, relevance, authority and cadence checks', () => {
  const ctx = normaliseCompanyContext('p', { company_name: 'Pact Coffee' }, { product_description: 'Speciality coffee beans and coffee pods by subscription. pactcoffee.com', competitors: ['Brio Coffee Club'], geography_detail: 'United Kingdom' });
  // Tertiary / user-edited.
  assert.equal(sourceEligibility({ url: 'https://en.wikipedia.org/wiki/Pact_Coffee', kind: 'company' }, { pageTitle: 'Pact Coffee - Wikipedia', text: 'Pact Coffee is a coffee company' }, ctx).eligible, false);
  // A broad, high-volume, unrelated feed (the private-equity wire).
  const pe = Array.from({ length: 20 }, (_, i) => ({ title: `Fund ${i} closes buyout of logistics group`, content: 'Private equity news', published_at: new Date(Date.UTC(2026, 10, 6, i)).toISOString() }));
  const r = sourceEligibility({ url: 'https://www.privateequitywire.co.uk/feed/', kind: 'industry' }, { feedItems: pe }, ctx);
  assert.equal(r.eligible, false); assert.match(r.reasons.join(' '), /none of its recent items mention/);
  // The company's own site is eligible.
  assert.equal(sourceEligibility({ url: 'https://www.pactcoffee.com/blog/', kind: 'company' }, { pageTitle: 'Coffee Blog | Pact Coffee', text: 'brew guides' }, ctx).eligible, true);
  // A regulator page must be an official domain.
  assert.equal(sourceEligibility({ url: 'https://www.legislation.gov.uk/uksi/2003/2647/made', kind: 'regulator' }, { pageTitle: 'The Food Labelling Regulations', text: 'food labelling' }, ctx).eligible, true);
  assert.equal(sourceEligibility({ url: 'https://some-blog.example/regulation', kind: 'regulator' }, { pageTitle: 'Rules', text: 'coffee pods rules' }, ctx).eligible, false);
  // A competitor source must identify itself as that competitor.
  assert.equal(sourceEligibility({ url: 'https://example.com/news', kind: 'competitor', title: 'Brio Coffee Club' }, { pageTitle: 'Unrelated', text: 'coffee pods' }, ctx).eligible, false);
});

test('dependencies match by name or their own phrase, not single common words (real Pact data vs private-equity news)', () => {
  const ctx = normaliseCompanyContext('p', { company_name: 'Pact Coffee' }, { product_description: 'Speciality coffee beans and coffee pods', geography_detail: 'United Kingdom',
    business_facts: { dependencies: [{ text: 'It relies on buying green coffee direct from farmers', origin: 'research_accepted' }, { text: 'which it calls a direct-trade supply chain', origin: 'research_accepted' }, { text: 'instead of buying on the commodity market.', origin: 'research_accepted' }] } });
  for (const title of ['Blue Owl sees higher private credit returns as AI financing tightens', "Saudi PIF secures $3bn financing backed by Italy's export credit agency", 'Cinven acquires Theramex for €2.6bn as Carlyle and PAI secure exit', 'Private equity executives defend continuation funds amid LP concerns'])
    assert.equal(connectionFor({ title, content: '' }, ctx).candidate, false, title);
  assert.equal(connectionFor({ title: 'Green coffee prices hit a record as harvests fall', content: '' }, ctx).candidate, true);
});
