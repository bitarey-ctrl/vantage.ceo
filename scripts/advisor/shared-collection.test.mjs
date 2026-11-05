// Shared collection vs account-specific relevance, through the REAL pipeline: shared feeds → account-neutral gate →
// shared signals table → per-account assessment and links (processSignalsForProfile, backfill, runSourcePlan).
// Network and model are scripted: this verifies routing, storage and isolation, NOT the model's judgement.
// Run: node --experimental-test-module-mocks --import ./scripts/company-context/ts-resolve.mjs --test scripts/advisor/shared-collection.test.mjs
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeDb } from './fake-db.mjs';

process.env.ANTHROPIC_API_KEY = 'test'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
delete process.env.NEWSAPI_KEY;
let db; const prompts = [];
mock.module('@/lib/supabase/server', { namedExports: { createClient: async () => db.client, createAdminClient: async () => db.client } });

// Scripted model: the gate keeps concrete business developments (account-neutral); the per-account assessment keeps
// an item only when it touches that account's own stated facts, read back from the prompt it was given.
mock.module('@/lib/ai/claude', { namedExports: { CLAUDE_MODEL: 'test', callClaude: async (prompt) => {
  prompts.push(prompt);
  const items = [...prompt.matchAll(/\[(\d+)\] (?:\([^)]*\) )?([^\n]+)/g)].map((m) => ({ i: Number(m[1]), title: m[2] }));
  if (prompt.includes('You are the relevance gate')) {
    return items.filter((x) => !/gossip/i.test(x.title)).map((x) => ({ index: x.i, category: /gas|tariff/i.test(x.title) ? 'cost_base' : 'pricing', what_happened: x.title, why_it_matters: 'Businesses that buy this input pay more from next month.', what_to_consider: 'Check your next invoice.' }));
  }
  const facts = prompt.slice(prompt.indexOf('COMPANY'), prompt.indexOf('ITEMS')).toLowerCase();
  return items.map((x) => {
    const hit = (/gas/i.test(x.title) && facts.includes('natural gas')) || (/aws|ec2/i.test(x.title) && facts.includes('aws'));
    return hit ? { i: x.i, decision: 'relevant', what_changed: x.title, connection: 'You named this as something you depend on.', effect: 'If it applies to you, your costs rise.', unknowns: 'Your contract terms.', next_step: 'Check your next bill.', watch_for: null, quantified: null }
      : { i: x.i, decision: 'reject', reject_reason: 'no_plausible_effect' };
  });
} } });

const NOW = new Date().toUTCString();
const rss = (titles) => `<rss><channel>${titles.map((t, i) => `<item><title>${t}</title><link>https://news.example.com/${encodeURIComponent(t)}-${i}</link><pubDate>${NOW}</pubDate><description>${t}. Details in the article.</description></item>`).join('')}</channel></rss>`;
const SHARED = ['Natural gas prices jump 18% for industrial users in Germany', 'AWS raises EC2 prices 10% from March', 'Celebrity gossip roundup'];
const requested = [];
globalThis.fetch = async (u) => { requested.push(String(u)); return new Response(rss(SHARED), { status: 200, headers: { 'content-type': 'application/rss+xml' } }); };

const { processSignalsForProfile } = await import('../../src/lib/signals/signal-processor.ts');
const { backfillTriagesForProfile } = await import('../../src/lib/signal-linking/backfill.ts');
const { normaliseCompanyContext } = await import('../../src/lib/company-context/context.ts');
const { buildGatePrompt } = await import('../../src/lib/ai/prompts/triage.ts');
const { buildSourcePlan } = await import('../../src/lib/company-context/source-plan.ts');
const { runSourcePlan } = await import('../../src/lib/company-context/ingest.ts');
const { parseStoredConnection } = await import('../../src/lib/company-context/verify.ts');

const M = '00000000-0000-4000-8000-0000000000f1', S = '00000000-0000-4000-8000-0000000000f2';
const SECRET = 'Confidential: we plan to close the Izmir plant';
const manufacturer = { profile: { id: M, company_name: 'Forma Ceramics' }, ctx: { profile_id: M, product_description: 'Ceramic tile manufacturer', target_customer: 'Tile distributors', revenue_model: 'Wholesale sales', geography_detail: 'Turkey, Germany', additional_context: SECRET, strategic_priorities: 'Secretly prepare a sale to a rival', business_facts: { dependencies: [{ text: 'Natural gas for kilns' }], constraints: [{ text: 'Overdraft limit reached' }] } } };
const saas = { profile: { id: S, company_name: 'Ledgerly' }, ctx: { profile_id: S, product_description: 'Accounting software for dental clinics', target_customer: 'Dental clinics', revenue_model: 'Monthly subscription', geography_detail: 'United Kingdom', business_facts: { dependencies: [{ text: 'AWS hosting' }] } } };
const company = (a) => normaliseCompanyContext(a.profile.id, a.profile, a.ctx);
const links = (id) => db.rows('signal_triages').filter((t) => t.profile_id === id).map((t) => ({ title: db.rows('signals').find((s) => s.id === t.signal_id)?.title, st: parseStoredConnection(t.relevance_reason) }));
const fresh = () => { db = createFakeDb({ profiles: [manufacturer.profile, saas.profile], ceo_context: [manufacturer.ctx, saas.ctx], signals: [], signal_triages: [], source_collection_runs: [], company_sources: [], feature_events: [] }); prompts.length = 0; requested.length = 0; };
// The pipeline relies on database-generated signal ids.
const withIds = () => { const orig = db.client.from; db.client.from = (t) => { const b = orig(t); if (t !== 'signals') return b; const ins = b.insert; b.insert = (p) => ins((Array.isArray(p) ? p : [p]).map((r) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r }))); return b; }; };

test('the shared gate is account-neutral: no SaaS reader, no account context, concrete trade/cost measures not discarded', () => {
  const p = buildGatePrompt([{ index: 0, title: 'x', content: 'x', source: 's', url: 'u', published_at: 'd' }]);
  assert.doesNotMatch(p, /B2B SaaS founder|\$1M-\$20M ARR|\$5M ARR SaaS/);
  assert.match(p, /any sector, any country/);
  assert.match(p, /This gate is shared by every kind of business/);
  assert.match(p, /Keep only a CONCRETE measure .* tariff or duty, an energy or fuel price change/);
  assert.doesNotMatch(p, /tariffs\. These do not reach/);
});

test('shared sources include sector-neutral queries; software sources are kept', async () => {
  const { buildQueryFeeds, CURATED_FEEDS } = await import('../../src/lib/signals/sources.ts');
  const names = buildQueryFeeds([]).map((f) => f.name);
  for (const n of ['Trade measures', 'Input costs', 'Small-business rules', 'AI provider pricing', 'SaaS pricing models']) assert.ok(names.includes(n), n);
  assert.ok(CURATED_FEEDS.some((f) => /AWS/.test(f.name)));
  const news = readFileSync(new URL('../../src/lib/signals/perplexity.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(news.slice(news.indexOf('CATEGORY_QUERIES')), /"B2B SaaS"|SaaS OR "software startup"/);
});

test('a manufacturer receives a relevant non-software development; a SaaS company keeps its software one; neither contaminates the other', async () => {
  fresh(); withIds();
  await processSignalsForProfile(manufacturer.profile, manufacturer.ctx, [], company(manufacturer));
  const gatePrompts = prompts.filter((p) => p.includes('You are the relevance gate'));
  assert.ok(gatePrompts.length >= 1);
  for (const p of gatePrompts) { assert.doesNotMatch(p, /Forma|Ceramic tile|Izmir|Overdraft|Secretly/); }
  const shared = db.rows('signals').map((s) => s.title).sort();
  assert.ok(shared.some((t) => /Natural gas/.test(t)) && shared.some((t) => /AWS/.test(t)), 'shared pool keeps both developments (not filtered around the triggering account)');
  const m = links(M);
  assert.deepEqual(m.map((x) => x.title), [SHARED[0]], 'manufacturer linked to the gas price rise only');
  assert.equal(m[0].st.status, 'relevant');
  // The SaaS account refreshes next: the shared items are already stored, so its links come from backfill.
  prompts.length = 0;
  await backfillTriagesForProfile(S);
  await processSignalsForProfile(saas.profile, saas.ctx, [], company(saas));
  const s = links(S);
  assert.deepEqual(s.map((x) => x.title), [SHARED[1]], 'SaaS account linked to the AWS price rise only');
  assert.deepEqual(links(M).map((x) => x.title), [SHARED[0]], "the manufacturer's links are unchanged by the other account's refresh");
  assert.equal(db.rows('signals').length, shared.length, 'no duplicate shared records');
  for (const p of prompts) assert.doesNotMatch(p, /Forma|Izmir|Secretly|Overdraft/, "the manufacturer's context never reaches the SaaS account's calls");
});

test('confidential context stays out of public search queries and shared records', async () => {
  fresh(); withIds();
  const ctx = company(manufacturer);
  const queries = buildSourcePlan(ctx).sources.map((x) => decodeURIComponent(x.url)).join(' | ');
  for (const secret of ['Izmir', 'close', 'Secretly', 'sale to a rival', 'Overdraft']) assert.ok(!queries.includes(secret), `query leak: ${secret}`);
  await runSourcePlan(db.client, ctx, { maxNew: 5, fetchImpl: async (u) => { requested.push(String(u)); return new Response(rss(['Natural gas prices jump 18% for industrial users in Germany']), { status: 200 }); } });
  for (const u of requested) for (const secret of ['Izmir', 'Secretly', 'Overdraft']) assert.ok(!decodeURIComponent(u).includes(secret), `request leak: ${secret}`);
  const shared = JSON.stringify(db.rows('signals'));
  for (const secret of ['Izmir', 'Secretly', 'Overdraft', 'You named this', 'your costs rise']) assert.ok(!shared.includes(secret), `shared record leak: ${secret}`);
  assert.ok(links(M).length >= 1, 'the account-specific judgement lives on the account link');
});

test('missing context stays explicit (no invented business type in the protected refresh paths)', () => {
  for (const f of ['../../src/app/api/signals/refresh/route.ts', '../../src/app/api/onboarding/complete/route.ts', '../../src/app/api/signals/ingest/route.ts']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\?\? ?["']B2B SaaS["']|\?\? ?["']technology["']|\?\? ?["']Turkey["']|\?\? ?["']undisclosed["']/, f);
  }
  const empty = normaliseCompanyContext('x', { company_name: 'Unknown Co' }, null);
  assert.ok(empty.unknowns.includes('what the company sells') && empty.unknowns.includes('how it makes money'));
});
