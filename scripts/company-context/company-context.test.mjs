// Offline tests for the canonical company context, relevance, event de-duplication, source plans, RSS parsing and
// the batched check. Run: node --import ./scripts/company-context/ts-resolve.mjs --test scripts/company-context/company-context.test.mjs
// All companies here are fictional.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { normaliseCompanyContext, companyContextBlock } from '../../src/lib/company-context/context.ts';
import { connectionFor } from '../../src/lib/company-context/relevance.ts';
import { sameEvent, clusterEvents } from '../../src/lib/company-context/events.ts';
import { buildSourcePlan } from '../../src/lib/company-context/source-plan.ts';
import { parseRss } from '../../src/lib/company-context/ingest.ts';
import { connectAndCheck, parseStoredConnection } from '../../src/lib/company-context/verify.ts';

const brewer = normaliseCompanyContext('p1', { company_name: 'Hopfield Brewing' }, {
  product_description: 'Craft beer brewery selling canned pale ale and lager to pubs and supermarkets. hopfield.example',
  target_customer: 'Pub groups and supermarket buyers', revenue_model: 'Wholesale beer sales',
  geography_detail: 'United Kingdom, Ireland', strategic_priorities: 'Win two supermarket listings; cut aluminium can costs',
  competitors: 'BrewDog, Camden Town Brewery',
});
const payroll = normaliseCompanyContext('p2', { company_name: 'Paylark' }, {
  product_description: 'Payroll software for restaurants, with tips and shift pay calculated automatically.',
  target_customer: 'Restaurant owners and hospitality groups', revenue_model: 'Monthly subscription per employee',
  geography_detail: 'United States', strategic_priorities: ['Pass SOC 2 audit', 'Grow restaurant groups'], competitors: ['Gusto', { name: 'Toast' }],
});

test('priorities and competitors read the same from string, JSON-string and array storage', () => {
  const shapes = [
    { strategic_priorities: 'Grow EU buyers\nCut costs', competitors: 'Alpha Co, Beta Co' },
    { strategic_priorities: '["Grow EU buyers","Cut costs"]', competitors: '[{"name":"Alpha Co"},{"name":"Beta Co"}]' },
    { strategic_priorities: [{ title: 'Grow EU buyers' }, 'Cut costs'], competitors: ['Alpha Co', 'Beta Co'] },
  ].map((ctx) => normaliseCompanyContext('x', { company_name: 'X' }, ctx));
  for (const c of shapes) { assert.deepEqual(c.priorities, ['Grow EU buyers', 'Cut costs']); assert.deepEqual(c.competitors, ['Alpha Co', 'Beta Co']); }
  assert.equal(new Set(shapes.map((c) => c.version)).size, 1);
});

test('a priority sentence with commas stays one priority', () => {
  const c = normaliseCompanyContext('x', {}, { strategic_priorities: 'Protect margins as energy, freight and labour costs move' });
  assert.equal(c.priorities.length, 1);
});

test('unknown stays unknown: no invented sector, geography or model', () => {
  const c = normaliseCompanyContext('x', { company_name: 'Quiet Ltd' }, null);
  const block = companyContextBlock(c);
  assert.match(block, /What they sell: not recorded/);
  assert.doesNotMatch(block, /SaaS|Turkey|technology/);
  assert.ok(c.unknowns.includes('what the company sells'));
});

test('connection names the matched fact; unrelated news is monitor', () => {
  const hit = connectionFor({ title: 'Supermarket buyers cut craft beer shelf space in the United Kingdom - Grocer Weekly' }, brewer);
  assert.equal(hit.status, 'connected');
  assert.match(hit.text, /craft beer|supermarket/);
  const miss = connectionFor({ title: 'Central bank holds rates steady - Daily Paper' }, brewer);
  assert.equal(miss.status, 'monitor');
  assert.match(miss.text, /^Monitor/);
});

test('a one-word company name alone is not a connection (namesakes)', () => {
  const c = connectionFor({ title: 'Paylark spotted in record numbers at the coast - Birdwatch' }, payroll);
  assert.equal(c.status, 'monitor');
  assert.equal(c.candidate, true, 'still sent to the check, which can reject the namesake');
});

test('the publisher name does not count as a mention', () => {
  const site = normaliseCompanyContext('x', { company_name: 'Trendwire' }, { product_description: 'Trend research reports for brand managers.' });
  const c = connectionFor({ title: 'Ten snacks everyone is eating - Trendwire', content: 'A list. (Reported by Trendwire.)' }, site);
  assert.equal(c.matched.some((m) => m.kind === 'company'), false);
});

test('phrases do not cross commas', () => {
  const c = normaliseCompanyContext('x', {}, { product_description: 'Business current accounts, payments and invoicing' });
  const plan = buildSourcePlan(c);
  assert.ok(!plan.sources.some((s) => /account payment/.test(s.query)));
});

test('same event from several outlets merges; different versioned products do not', () => {
  const day = '2026-10-01T10:00:00Z';
  assert.ok(sameEvent({ id: 'a', title: 'Gusto raises $200M Series F - TechNews', published_at: day }, { id: 'b', title: 'Gusto raises $200M in Series F funding - FinWire', published_at: day }));
  assert.ok(!sameEvent({ id: 'a', title: 'Acme launches Widget 5.5 for teams', published_at: day }, { id: 'b', title: 'Acme launches Widget 6 Pro for enterprises', published_at: day }));
  const clusters = clusterEvents([
    { id: '1', title: 'Toast outage hits restaurant payments - A', published_at: day },
    { id: '2', title: 'Toast outage hits restaurant payments nationwide - B', published_at: day },
    { id: '3', title: 'Gusto opens London office - C', published_at: day },
  ]);
  assert.equal(clusters.length, 2);
});

test('source plans come from each company\'s own details and differ between companies', () => {
  const a = buildSourcePlan(brewer), b = buildSourcePlan(payroll);
  assert.ok(a.sources.some((s) => /BrewDog/.test(s.query)));
  assert.ok(b.sources.some((s) => /Gusto/.test(s.query)));
  assert.ok(!a.sources.some((s) => /Gusto/.test(s.query)));
  const overlap = a.sources.filter((s) => b.sources.some((t) => t.query === s.query));
  assert.equal(overlap.length, 0);
  for (const s of [...a.sources, ...b.sources]) assert.match(s.url, /^https:\/\/news\.google\.com\/rss\/search\?q=/);
});

test('missing details become stated gaps, not guesses', () => {
  const c = normaliseCompanyContext('x', { company_name: 'Bare Co' }, null);
  const plan = buildSourcePlan(c);
  assert.ok(plan.gaps.some((g) => /competitors/i.test(g)));
  assert.ok(plan.gaps.some((g) => /product description/i.test(g)));
});

test('RSS parsing keeps https news items and drops listicles', () => {
  const xml = `<rss><channel>
    <item><title>Gusto raises funding - FinWire</title><link>https://example.com/a</link><pubDate>Wed, 01 Oct 2026 10:00:00 GMT</pubDate><source>FinWire</source></item>
    <item><title>10 best payroll apps of 2026</title><link>https://example.com/b</link></item>
    <item><title>Plain http item</title><link>http://example.com/c</link></item>
  </channel></rss>`;
  const items = parseRss(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].publisher, 'FinWire');
});

test('the check keeps only same-subject items that could affect you, and drops repeats', async () => {
  const items = [
    { key: 'k1', title: 'Gusto adds tip pooling for restaurants - A', content: '' },
    { key: 'k2', title: 'Gusto adds restaurant tip pooling - B', content: '' },
    { key: 'k3', title: 'Toast the bread: breakfast ideas - C', content: '' },
  ];
  const call = async () => [
    { i: 0, same_subject: true, could_affect: true, same_event_as: null, reason: 'You compete with Gusto on restaurant payroll.' },
    { i: 1, same_subject: true, could_affect: true, same_event_as: 0, reason: 'Same.' },
    { i: 2, same_subject: false, could_affect: false, same_event_as: null, reason: null },
  ];
  const out = await connectAndCheck(payroll, items, { call, connectionFor });
  assert.deepEqual(out.map((o) => o.item.key), ['k1']);
  assert.equal(out[0].stored.checked, true);
  assert.match(out[0].stored.text, /^Why this may matter to you: You compete with Gusto/);
  assert.deepEqual(parseStoredConnection(JSON.stringify(out[0].stored)), out[0].stored);
});

test('if the check cannot run, only strict matches are kept and they say "not yet checked"', async () => {
  const items = [
    { key: 'k1', title: 'Gusto adds tip pooling for restaurant payroll - A', content: '' },
    { key: 'k2', title: 'Paylark spotted at the coast - Birdwatch', content: '' },
  ];
  const out = await connectAndCheck(payroll, items, { call: async () => { throw new Error('offline'); }, connectionFor });
  assert.deepEqual(out.map((o) => o.item.key), ['k1']);
  assert.equal(out[0].stored.checked, false);
  assert.match(out[0].stored.text, /not yet checked/);
});

test('no shipped company-context code, prompt or source list names a test customer', () => {
  const names = /sultan|locustan|juro|ege seramik|ankorstore|huel|tide\.co|zencargo|kritiko|speedy hire|portman|faire|alibaba|ironclad|revolut|monzo|marazzi|flexport/i;
  const dir = new URL('../../src/lib/company-context/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(src, names, f);
  }
  for (const f of ['../../src/lib/ai/prompts/consequence.ts']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    const canonical = src.slice(src.indexOf('function canonicalSection'));
    assert.doesNotMatch(canonical, names);
  }
});
