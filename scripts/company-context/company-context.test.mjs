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
import { connectAndCheck, parseStoredConnection, exposureCalc, verifyCandidates } from '../../src/lib/company-context/verify.ts';
import { intakeQuestions, intakeUpdate } from '../../src/lib/company-context/intake.ts';
import { researchCompany } from '../../src/lib/company-context/research.ts';
import { assertPublicHttps, safeFetch } from '../../src/lib/company-context/safe-fetch.ts';
import { verifySource, collectVerifiedSources, usableFeed } from '../../src/lib/company-context/sources.ts';
import { analysisQuality } from '../../src/lib/company-context/quality.ts';

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
  const facts = block.split('\n').filter((l) => !l.startsWith('Business type:') && !l.startsWith('Not known'));
  assert.doesNotMatch(facts.join('\n'), /SaaS|Turkey|technology/);
  assert.match(block, /do not assume software, SaaS, a location, or a revenue model/);
  assert.ok(c.unknowns.includes('what the company sells'));
});

test('keyword stage: connection names the matched fact; unrelated news is not a candidate', () => {
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

test('the assessment keeps relevant/watch items with all five parts, drops rejects and repeats', async () => {
  const items = [
    { key: 'k1', title: 'Gusto adds tip pooling for restaurants - A', content: '' },
    { key: 'k2', title: 'Gusto adds restaurant tip pooling - B', content: '' },
    { key: 'k3', title: 'Toast the bread: breakfast ideas - C', content: '' },
    { key: 'k4', title: 'Gusto opens office', content: '' },
  ];
  const full = { what_changed: 'Gusto added tip pooling.', connection: 'You compete with Gusto on restaurant payroll.', effect: 'If buyers want tip pooling, you could lose deals.', unknowns: 'How many of your buyers ask for it.', next_step: 'Ask five customers this week.' };
  const call = async () => [
    { i: 0, decision: 'relevant', ...full },
    { i: 1, decision: 'relevant', same_event_as: 0, ...full },
    { i: 2, decision: 'reject', reject_reason: 'namesake' },
    { i: 3, decision: 'watch', ...full, watch_for: null }, // watch without a trigger is not allowed
  ];
  const out = await connectAndCheck(payroll, items, { call, connectionFor });
  assert.deepEqual(out.map((o) => o.item.key), ['k1']);
  const st = out[0].stored;
  assert.equal(st.status, 'relevant');
  for (const k of ['whatChanged', 'connection', 'effect', 'unknowns', 'nextStep']) assert.ok(st[k], k);
  assert.deepEqual(parseStoredConnection(JSON.stringify(st)), st);
});

test('if the assessment cannot run, strict matches are "unassessed" — never relevant or "monitor"', async () => {
  const items = [
    { key: 'k1', title: 'Gusto adds tip pooling for restaurant payroll - A', content: '' },
    { key: 'k2', title: 'Paylark spotted at the coast - Birdwatch', content: '' },
  ];
  const out = await connectAndCheck(payroll, items, { call: async () => { throw new Error('offline'); }, connectionFor });
  assert.deepEqual(out.map((o) => o.item.key), ['k1']);
  assert.equal(out[0].stored.status, 'unassessed');
  assert.match(out[0].stored.text, /Not yet assessed/);
  assert.doesNotMatch(out[0].stored.text, /monitor/i);
});

test('items from watched sources are assessed even without a keyword match (indirect effects)', async () => {
  const seen = [];
  const call = async (prompt) => { seen.push(prompt); return [{ i: 0, decision: 'reject', reject_reason: 'no_plausible_effect' }]; };
  await connectAndCheck(payroll, [{ key: 'x', title: 'Department of Labor updates tip credit rule', content: '', forceCandidate: true, evidenceLevel: 'original-feed' }], { call, connectionFor });
  assert.equal(seen.length, 1);
  assert.match(seen[0], /tip credit rule/);
});

test('sizing is deterministic: founder estimate × quoted change, only when the quote holds the number', () => {
  const c = normaliseCompanyContext('x', { company_name: 'X' }, { business_facts: { estimates: [{ id: 'e1', label: 'Share of costs: AWS', value: 30, unit: '%', basis: 'estimate' }] } });
  const text = 'AWS will raise EC2 prices by 10% from March. AWS revenue grew 17%. AWS raises prices in Japan by 8%.';
  const ok = exposureCalc(c, text, { estimate_id: 'e1', change_pct: 10, quote: 'AWS will raise EC2 prices by 10%' });
  assert.equal(ok.resultPct, 3);
  assert.match(ok.text, /^Conditional: .*30% \(your estimate\) × 10% ≈ \+3%/);
  assert.equal(exposureCalc(c, text, { estimate_id: 'e1', change_pct: 12, quote: 'AWS will raise EC2 prices by 10%' }), null, 'number must be in the quote');
  assert.equal(exposureCalc(c, text, { estimate_id: 'e1', change_pct: 10, quote: 'prices up 10% everywhere' }), null, 'quote must be in the item');
  assert.equal(exposureCalc(c, text, { estimate_id: 'nope', change_pct: 10, quote: 'AWS will raise EC2 prices by 10%' }), null, 'needs a founder estimate');
  assert.equal(exposureCalc(c, 'EC2 prices rise 10%.', { estimate_id: 'e1', change_pct: 10, quote: 'EC2 prices rise 10%' }), null, 'quote must name the cost item you estimated');
  assert.equal(exposureCalc(c, text, { estimate_id: 'e1', change_pct: 17, quote: 'AWS revenue grew 17%' }), null, 'growth is not a price change to you');
  assert.equal(exposureCalc(c, text, { estimate_id: 'e1', change_pct: 8, quote: 'AWS raises prices in Japan by 8%' }), null, 'a market you did not list is not your cost');
});

test('public searches never contain priorities, notes, constraints, estimates or the avoided decision', () => {
  const c = normaliseCompanyContext('x', { company_name: 'Hopfield Brewing' }, {
    product_description: 'Craft beer brewery selling canned pale ale to pubs.', target_customer: 'Pub groups', geography_detail: 'United Kingdom',
    strategic_priorities: 'Secretly prepare acquisition by Heineken', avoided_decision: 'Whether to fire the head brewer',
    additional_context: 'Confidential: cash runway nine weeks', competitors: 'BrewDog',
    business_facts: { constraints: [{ text: 'Overdraft limit reached' }], estimates: [{ id: 'e1', label: 'Share of costs: aluminium cans', value: 22, unit: '%', basis: 'estimate' }] },
  });
  const queries = buildSourcePlan(c).sources.map((s) => s.query.toLowerCase()).join(' | ');
  for (const secret of ['acquisition', 'heineken', 'secretly', 'fire the', 'head brewer', 'runway', 'confidential', 'overdraft', '22']) assert.ok(!queries.includes(secret), secret);
});

test('intake asks at most four consequential questions and allows "don\'t know"', () => {
  const c = normaliseCompanyContext('x', { company_name: 'Bare Co' }, null);
  const qs = intakeQuestions(c, [{ id: 'ip0', field: 'product', value: 'Makes widgets', basis: 'company_says', evidence: [{ url: 'https://bare.example', quote: null, quoteFound: false }] }]);
  assert.ok(qs.length <= 4 && qs.length >= 3);
  assert.equal(qs[0].id, 'product');
  assert.equal(qs[0].proposed, 'Makes widgets');
  assert.ok(!qs.some((q) => q.id === 'estimate'), 'no private number before a dependency is known');
  const withDep = normaliseCompanyContext('x', { company_name: 'Dep Co' }, { product_description: 'a', target_customer: 'b', geography_detail: 'UK', competitors: 'Z', revenue_model: 'r', business_facts: { dependencies: [{ text: 'AWS' }], constraints: [{ text: 'no hires' }] } });
  assert.ok(intakeQuestions(withDep).some((q) => q.id === 'estimate' && q.estimateFor === 'AWS'));
});

test('intake saves typed answers over proposals, keeps evidence for accepted research, records unknowns', () => {
  const proposals = [{ id: 'ip0', field: 'product', value: 'Research says widgets', basis: 'company_says', evidence: [{ url: 'https://x.example/about', quote: null, quoteFound: false }] },
    { id: 'lp1', field: 'dependencies', value: 'Stripe for payments', basis: 'company_says', evidence: [{ url: 'https://x.example/pay', quote: null, quoteFound: false }] }];
  const u = intakeUpdate({}, [
    { id: 'product', value: 'Typed: payroll for restaurants', acceptProposalId: 'ip0' },
    { id: 'buyers', value: null, unknown: true },
    { id: 'estimate', value: '35', estimateFor: 'Stripe for payments' },
  ], proposals, ['lp1']);
  assert.equal(u.columns.product_description, 'Typed: payroll for restaurants');
  assert.deepEqual(u.unknown, ['buyers']);
  assert.equal(u.businessFacts.dependencies[0].origin, 'research_accepted');
  assert.equal(u.businessFacts.dependencies[0].evidence, 'https://x.example/pay');
  assert.equal(u.businessFacts.estimates[0].value, 35);
  assert.equal(u.businessFacts.estimates[0].basis, 'estimate');
  const c = normaliseCompanyContext('x', {}, { ...u.columns, business_facts: u.businessFacts });
  assert.match(companyContextBlock(c), /Depends on: Stripe for payments/);
});

test('research stays labelled by how far its evidence goes, and nothing becomes a fact without acceptance', () => {
  const proposals = [
    { id: 'ip0', field: 'product', value: 'Coffee subscriptions by post', basis: 'company_says', evidence: [{ url: 'https://pact.example/', quote: 'coffee by post', quoteFound: true }] },
    { id: 'ip1', field: 'buyers', value: 'Offices', basis: 'unconfirmed', evidence: [{ url: 'https://news.example/x', quote: 'offices', quoteFound: false }] },
    { id: 'ip2', field: 'history', value: 'Founded in 2012', basis: 'unconfirmed', evidence: [{ url: 'https://news.example/y', quote: null, quoteFound: false }] },
  ];
  // Not accepted → nothing saved.
  const none = intakeUpdate({}, [], proposals, []);
  assert.deepEqual(none.columns, {}); assert.deepEqual(none.businessFacts.public_facts, []);
  // Accepted → saved, but labelled: a matched quote is "a page says this", an unmatched one is UNVERIFIED.
  const u = intakeUpdate({}, [{ id: 'product', value: null, acceptProposalId: 'ip0' }], proposals, ['ip1', 'ip2']);
  const c = normaliseCompanyContext('x', {}, { ...u.columns, business_facts: u.businessFacts });
  const block = companyContextBlock(c);
  assert.match(block, /What they sell: Coffee subscriptions by post \(from research they accepted; a fetched page says this — not independently verified\)/);
  assert.match(block, /Who buys: Offices \(from research they accepted; UNVERIFIED — no matching quote was found\)/);
  assert.match(block, /Public facts they accepted from research: Founded in 2012 \(from research they accepted; UNVERIFIED/);
  assert.match(block, /Never make a value marked "from research"[^\n]*only basis for a confident recommendation/);
  assert.equal(c.provenance.product.origin, 'research_accepted');
  // The founder editing the value makes it theirs: the research label goes.
  const edited = normaliseCompanyContext('x', {}, { ...u.columns, target_customer: 'Home coffee drinkers', business_facts: u.businessFacts });
  assert.match(companyContextBlock(edited), /Who buys: Home coffee drinkers\n/);
  assert.equal(edited.research.buyers, undefined);
  // A typed answer replacing an accepted one clears the record.
  const retyped = intakeUpdate({ ...u.columns, business_facts: u.businessFacts }, [{ id: 'product', value: 'Speciality coffee subscriptions' }], proposals, []);
  assert.equal(retyped.businessFacts.column_sources.product_description, undefined);
});

test('the two real Pact Coffee verdicts (isolated run 2026-11-05) replayed through the assessment parser', async () => {
  const pact = normaliseCompanyContext('p', { company_name: 'Pact Coffee' }, { product_description: 'Speciality coffee beans and coffee pods, mainly by subscription', target_customer: 'Home coffee drinkers and gift buyers', geography_detail: 'United Kingdom' });
  const conn = { status: 'connected', score: 1, text: '', basis: '', matched: [], contextVersion: pact.version, candidate: true };
  const items = [
    { key: 'g', title: "Exclusive: UK's Pact Coffee reports another year of double-digit growth - World Coffee Portal", content: '', connection: conn, evidenceLevel: 'aggregator-headline' },
    { key: 'k', title: "Keurig says it's come up with plastic-free coffee pods - Los Angeles Times", content: '', connection: conn, evidenceLevel: 'aggregator-headline' },
  ];
  // The model output actually stored in that run (fields abridged to the ones that decide the outcome).
  const stored = [
    { i: 0, decision: 'relevant', what_changed: 'Pact Coffee reported another year of double-digit growth in the UK.', connection: 'This is about your company directly, covering your financial performance.', effect: 'This confirms your subscription model is continuing to grow at double-digit rates, which validates your current business approach.', next_step: 'Review the full article.', watch_for: null },
    { i: 1, decision: 'relevant', what_changed: 'Keurig has developed plastic-free coffee pods.', connection: 'You sell coffee pods to home coffee drinkers, competing in a market where Keurig is a major player.', effect: 'If consumers increasingly demand plastic-free pods, you may need to evaluate your pod offerings.', next_step: 'Check your current pod materials.', watch_for: null },
  ];
  const v = await verifyCandidates(pact, items, async () => stored);
  assert.equal(v.get('g').decision, 'reject'); assert.equal(v.get('g').rejectReason, 'background', 'a headline about yourself cannot "validate" anything');
  // Known limit: the invented market position in the Keurig connection is not detectable from wording; only the
  // assessment rules address it, and whether they work needs a paid rerun.
  assert.equal(v.get('k').decision, 'relevant');
});

test('an accepted research sentence is saved whole, not split on commas', () => {
  const proposals = [{ id: 'd0', field: 'dependencies', value: 'It relies on buying green coffee direct from farmers, which it calls a direct-trade supply chain, instead of buying on the commodity market.', basis: 'company_says', evidence: [{ url: 'https://pact.example/', quote: 'direct-trade', quoteFound: true }] }];
  const u = intakeUpdate({}, [{ id: 'dependencies', value: null, acceptProposalId: 'd0' }], proposals, []);
  assert.equal(u.businessFacts.dependencies.length, 1);
  assert.equal(u.businessFacts.dependencies[0].basis, 'quote_matched');
  const typed = intakeUpdate({}, [{ id: 'dependencies', value: 'AWS, Stripe' }], proposals, []);
  assert.deepEqual(typed.businessFacts.dependencies.map((d) => d.text), ['AWS', 'Stripe']);
});

test('an advertised feed is used only if it follows the page itself (not a site-wide edit or comments log)', async () => {
  const wiki = 'https://en.wikipedia.org/wiki/Pact_Coffee';
  assert.equal(usableFeed('https://en.wikipedia.org/w/index.php?title=Special:RecentChanges&feed=atom', wiki), null);
  assert.equal(usableFeed('https://example.com/comments/feed/', 'https://example.com/news'), null);
  assert.equal(usableFeed('https://other.example/feed', 'https://example.com/news'), null, 'different site');
  assert.equal(usableFeed('https://www.example.com/news/feed', 'https://example.com/news'), 'https://www.example.com/news/feed');
  const html = '<html><head><title>Pact Coffee - Wikipedia</title><link rel="alternate" type="application/atom+xml" href="/w/index.php?title=Special:RecentChanges&amp;feed=atom"></head><body>' + 'Pact Coffee is a British coffee company. '.repeat(5) + '</body></html>';
  const fetchImpl = async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  const r = await verifySource(wiki, fetchImpl);
  assert.equal(r.feedUrl, null); assert.equal(r.method, 'page');
});

test('research keeps only proposals backed by pages retrieved in the run, and checks quotes against fetched text', async () => {
  const final = { stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1, server_tool_use: { web_search_requests: 1 } }, content: [
    { type: 'server_tool_use', name: 'web_search', input: { query: 'Paylark payroll' } },
    { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://paylark.example/', title: 't', encrypted_content: '', page_age: null }] },
    { type: 'web_fetch_tool_result', content: { type: 'web_fetch_result', url: 'https://paylark.example/about', retrieved_at: null, content: { type: 'document', source: { type: 'text', data: 'Paylark builds payroll for restaurants in Ohio.' } } } },
    { type: 'text', text: JSON.stringify({ ambiguity: null, proposals: [
      { field: 'product', value: 'Payroll for restaurants', basis: 'company_says', evidence: [{ url: 'https://paylark.example/about', quote: 'payroll for restaurants' }] },
      { field: 'history', value: 'Raised $9m', basis: 'third_party_reports', evidence: [{ url: 'https://never-opened.example/', quote: 'raised' }] },
    ], sources: [{ url: 'https://paylark.example/blog', kind: 'company', title: 'Blog', why: 'Own news', claims: 'launches', jurisdiction: null }] }) },
  ] };
  const client = { messages: { stream: () => ({ finalMessage: async () => final }) } };
  const r = await researchCompany({ companyName: 'Paylark', website: 'paylark.example', markets: [] }, { client });
  assert.deepEqual(r.queries, ['Paylark payroll']);
  assert.equal(r.proposals.length, 1);
  assert.equal(r.proposals[0].evidence[0].quoteFound, true);
  assert.equal(r.dropped, 1);
  assert.equal(r.sources[0].retrievedInRun, false);
});

test('safe fetch refuses http, credentials, private and local hosts, including via redirect', async () => {
  for (const u of ['http://example.com', 'https://user:pw@example.com', 'https://127.0.0.1/', 'https://10.0.0.5/', 'https://localhost/', 'https://printer.local/']) {
    await assert.rejects(assertPublicHttps(u), u);
  }
  const fetchImpl = async () => new Response(null, { status: 302, headers: { location: 'https://192.168.1.1/admin' } });
  const r = await safeFetch('https://93.184.215.14/', { fetchImpl });
  assert.equal(r.ok, false);
  assert.match(r.error, /Private/);
});

test('verified sources: a feed is found from the page; first collection is a baseline; later entries are collected', async () => {
  const html = '<html><head><title>Paylark news</title><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body>' + 'Paylark news and product updates. '.repeat(5) + '</body></html>';
  const v = await verifySource('https://93.184.215.14/news', async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }));
  assert.equal(v.ok, true); assert.equal(v.method, 'rss'); assert.equal(v.feedUrl, 'https://93.184.215.14/feed.xml'); assert.equal(v.title, 'Paylark news');
  const rows = [{ id: 's1', profile_id: 'p', url: 'https://93.184.215.14/news', final_url: null, title: 'Paylark news', kind: 'company', collection_method: 'rss', feed_url: 'https://93.184.215.14/feed.xml', status: 'verified', last_ok_at: null, content_hash: null, consecutive_failures: 0 }];
  const updates = [];
  const db = { from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, limit: async () => ({ data: rows }), update(p) { updates.push(p); return { eq: () => ({ eq: async () => { Object.assign(rows[0], p); return {}; } }) }; } }) };
  const feed = (title) => `<rss><channel><item><title>${title}</title><link>https://93.184.215.14/${encodeURIComponent(title)}</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
  let body = feed('Old post');
  const fetchImpl = async () => new Response(body, { status: 200, headers: { 'content-type': 'application/rss+xml' } });
  const first = await collectVerifiedSources(db, 'p', { fetchImpl });
  assert.equal(first.items.length, 0, 'baseline only');
  body = feed('New launch');
  const second = await collectVerifiedSources(db, 'p', { fetchImpl });
  assert.equal(second.items.length, 1);
  assert.equal(second.items[0].evidenceLevel, 'original-feed');
});

test('analysis quality: names business facts, flags invented numbers and constraint conflicts', () => {
  const c = normaliseCompanyContext('x', { company_name: 'Paylark' }, { product_description: 'Payroll software for restaurants', competitors: 'Gusto', business_facts: { constraints: [{ text: 'No new hires this quarter' }] } });
  const good = analysisQuality({ soWhat: 'Gusto now offers tip pooling to restaurants you sell payroll to.', ifYouAct: 'You keep deals.', ifYouDont: 'Over the next months restaurants comparing payroll tools may pick Gusto, and that gets harder to win back later.', immediateAction: 'This week, email five restaurant customers and list who needs tip pooling.' }, c, 'Gusto adds tip pooling');
  assert.equal(good.pass, true, JSON.stringify(good));
  const bad = analysisQuality({ soWhat: 'You could lose 40% of deals.', ifYouAct: '', ifYouDont: '', immediateAction: 'Hire two engineers this week to build tip pooling.' }, c, 'Gusto adds tip pooling');
  assert.deepEqual(bad.inventedNumbers, ['40%']);
  assert.equal(bad.constraintConflicts.length, 1);
  assert.equal(bad.pass, false);
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

test('safe fetch releases the connection: redirect bodies are cancelled, an over-size download is aborted', async () => {
  let redirectCancelled = false, signalSeen = null;
  const big = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(400_000)); } }); // never ends on its own
  const fetchImpl = async (u, init) => {
    signalSeen = init.signal;
    if (u.endsWith('/start')) return new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(10)); }, cancel() { redirectCancelled = true; } }), { status: 302, headers: { location: '/big' } });
    return new Response(big, { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const r = await safeFetch('https://93.184.215.14/start', { fetchImpl, maxBytes: 1_000_000 });
  assert.equal(redirectCancelled, true, 'redirect body released');
  assert.equal(signalSeen.aborted, true, 'over-size download aborted at the connection');
  assert.ok(r.text.length > 0 && r.text.length <= 1_200_000);
});
