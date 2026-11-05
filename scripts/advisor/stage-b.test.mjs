// Stage B offline tests: validated shared context, the Advisor's context assembly (signals, capabilities,
// constraints, unknown sectors), decision preparation and signal impact analysis — through the REAL handlers with
// mocked Supabase and SDK. These check what reaches the model and what is stored; they do NOT measure model quality.
// Run: node --experimental-test-module-mocks --import ./scripts/company-context/ts-resolve.mjs --test scripts/advisor/stage-b.test.mjs
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeDb } from './fake-db.mjs';
import { normaliseCompanyContext, companyContextBlock } from '../../src/lib/company-context/context.ts';
import { ONBOARDING_TEAM_SIZES, ONBOARDING_DECISION_STYLES, ONBOARDING_RISK_TOLERANCES } from '../../src/lib/company-context/field-validation.ts';
import { buildSignalContext } from '../../src/lib/advisor/signal-context.ts';

let db, currentUser, captured, blindSpotInput;
class APIError extends Error { constructor(status, message) { super(message); this.status = status; } }
mock.module('@anthropic-ai/sdk', { defaultExport: class Anthropic { static APIError = APIError; static RateLimitError = class extends APIError {}; constructor() { this.messages = { stream: (params) => { captured = params; let fn = () => {}; return { on(_e, f) { fn = f; return this; }, async finalMessage() { fn('ok.'); return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok.' }] }; } }; } }; } } });
mock.module('@/lib/supabase/server', { namedExports: {
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: currentUser } }, error: null }) }, from: (t) => db.client.from(t) }),
  createAdminClient: async () => db.client,
} });
mock.module('@/lib/decisions/blind-spots', { namedExports: { analyzeBlindSpots: async (input) => { blindSpotInput = input; return { analyzable: true, blindSpots: [] }; } } });
const { POST: chat } = await import('../../src/app/api/advisor/chat/route.ts');
const { POST: analyzeDecision } = await import('../../src/app/api/decisions/[id]/analyze/route.ts');
const { runImpactAnalysis } = await import('../../src/lib/company-context/impact.ts');

const U = '00000000-0000-4000-8000-0000000000c1', V = '00000000-0000-4000-8000-0000000000c2';
async function systemPromptFor(profile, ctx, extra = {}) {
  db = createFakeDb({ profiles: [{ id: U, ...profile }], ceo_context: [{ profile_id: U, ...ctx }], decisions: [], strategies: [], consequences: [], feature_events: [], advisor_sessions: [], signal_triages: extra.triages ?? [], source_collection_runs: extra.runs ?? [] }, { missing: extra.missing ?? [] });
  currentUser = U;
  const res = await chat(new Request('http://localhost/api/advisor/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'What signals should I be acting on right now?' }] }) }));
  await res.text();
  return captured.system;
}

// ── 1. Frozen original failures: onboarding answers stored in business fields ───────────────────────────────────
test('frozen failure: "Decisive" in revenue_model, "2–5" in business_model, "Calculated" in avoided_decision are not business facts', () => {
  const c = normaliseCompanyContext('x', { company_name: 'Legacy Co', business_model: '2–5' }, { revenue_model: 'Decisive', avoided_decision: 'Calculated' });
  assert.equal(c.revenueModel, null); assert.equal(c.avoidedDecision, null);
  assert.equal(c.teamSize, '2–5'); assert.equal(c.decisionStyle, 'Decisive'); assert.equal(c.riskTolerance, 'Calculated');
  const block = companyContextBlock(c);
  assert.match(block, /How they make money: not recorded/);
  assert.match(block, /Decision they have been avoiding: not recorded/);
  assert.match(block, /Team size \(onboarding answer\): 2–5/);
  assert.ok(c.unknowns.includes('how it makes money'));
  assert.deepEqual(c.flags.map((f) => f.meaning).sort(), ['decision style', 'risk tolerance', 'team size']);
});

test('ambiguous legacy value is kept, marked for confirmation, and not relied on', () => {
  const c = normaliseCompanyContext('x', {}, { revenue_model: 'Hybrid' });
  assert.equal(c.revenueModel, 'Hybrid');
  assert.equal(c.flags[0].action, 'confirm');
  assert.match(companyContextBlock(c), /Hybrid \(unconfirmed/);
  assert.ok(c.unknowns.includes('how it makes money'));
  const real = normaliseCompanyContext('x', {}, { revenue_model: 'Commission on each order' });
  assert.equal(real.flags.length, 0);
});

test('validation lists mirror the onboarding page options', () => {
  const page = readFileSync(new URL('../../src/app/onboarding/page.tsx', import.meta.url), 'utf8');
  const teams = JSON.parse(page.match(/const TEAM_SIZES = (\[[^\]]*\])/)[1]);
  const risks = JSON.parse(page.match(/const RISK_TOLERANCES = (\[[^\]]*\])/)[1]);
  const styles = [...page.matchAll(/\{ value: "([A-Za-z]+)", description:/g)].map((m) => m[1]);
  assert.deepEqual(teams, ONBOARDING_TEAM_SIZES); assert.deepEqual(risks, ONBOARDING_RISK_TOLERANCES);
  assert.deepEqual(styles, ONBOARDING_DECISION_STYLES);
});

// ── 2. Synthetic businesses: the Advisor receives validated facts, capabilities and constraints ────────────────
const CASES = {
  software: [{ company_name: 'Ledgerly', business_model: '6–15' }, { product_description: 'Accounting software for dental clinics', target_customer: 'Dental clinic owners', revenue_model: 'Monthly subscription per clinic', geography_detail: 'United Kingdom', additional_context: 'We already offer a free data-migration service.' }],
  marketplace: [{ company_name: 'Tradeloop' }, { product_description: 'B2B marketplace connecting furniture makers with hotel buyers', target_customer: 'Hotel procurement teams', revenue_model: 'Commission on each order (8%)', geography_detail: 'Portugal, Spain', additional_context: 'Payments already go through an escrow partner; we do not hold funds. Buyers sometimes contact makers directly after the first order.', business_facts: { constraints: [{ text: 'No lending or credit risk on our balance sheet' }] } }],
  manufacturing: [{ company_name: 'Forma Ceramics' }, { product_description: 'Ceramic tile manufacturer', target_customer: 'Tile distributors', revenue_model: 'Wholesale sales', geography_detail: 'Turkey, Germany', business_facts: { dependencies: [{ text: 'Natural gas for kilns' }], constraints: [{ text: 'Kiln capacity is fully booked until March' }] } }],
  logistics: [{ company_name: 'Northline Freight' }, { product_description: 'Road freight forwarding', target_customer: 'Retailers importing from Asia', revenue_model: 'Fee per shipment', geography_detail: 'Netherlands', business_facts: { constraints: [{ text: 'No new hires this quarter' }] } }],
  services: [{ company_name: 'Clearpath Advisory', business_model: 'Solo' }, { product_description: 'Bookkeeping and payroll services for small charities', target_customer: 'Charity treasurers', revenue_model: 'Monthly retainer', geography_detail: 'Ireland', avoided_decision: 'Low' }],
};
for (const [name, [p, c]] of Object.entries(CASES)) {
  test(`${name}: validated facts, capabilities and constraints reach the Advisor; no SaaS or location is assumed`, async () => {
    const sys = await systemPromptFor(p, c);
    const facts = sys.slice(sys.indexOf('Company:'), sys.indexOf('Business type:'));
    assert.match(facts, new RegExp(c.product_description));
    assert.match(facts, new RegExp(c.revenue_model.replace(/[()%]/g, '.')));
    if (name !== 'software') assert.doesNotMatch(facts, /SaaS/i);
    for (const k of c.business_facts?.constraints ?? []) assert.match(facts, new RegExp(k.text));
    for (const k of c.business_facts?.dependencies ?? []) assert.match(facts, new RegExp(k.text));
    if (c.additional_context) assert.match(facts, new RegExp(c.additional_context.slice(0, 30)));
    assert.doesNotMatch(facts, /How they make money: (Solo|2–5|6–15|Low)/);
    assert.match(sys, /Before suggesting a capability, check whether they already have it/);
    assert.match(sys, /A lower commission does not beat a zero-fee direct deal/);
    assert.match(sys, /ask ONE focused question/);
    assert.doesNotMatch(sys, /what most VCs would say/);
  });
}

test('unknown business type: nothing is assumed', async () => {
  const sys = await systemPromptFor({ company_name: 'Mystery Ltd' }, {});
  const facts = sys.slice(sys.indexOf('Company:'), sys.indexOf('Business type:'));
  assert.doesNotMatch(facts, /SaaS|software|United States|Turkey/i);
  assert.match(sys, /do not assume software, SaaS, a location, or a revenue model/);
});

// ── 3. Signals reach the Advisor with an explicit coverage state ──────────────────────────────────────────────
const assessed = (status, title) => ({ profile_id: U, created_at: '2026-11-01', relevance_reason: JSON.stringify({ v: 2, status, checked: true, text: 't', basis: 'b', whatChanged: `${title} happened`, connection: 'You depend on it', effect: 'If so, costs rise', unknowns: 'Your contract', nextStep: 'Call them', watchFor: status === 'watch' ? 'A price notice' : null, calculation: null, rejectReason: null, evidence: { level: 'original-feed', claimsVerified: false }, matched: [], contextVersion: 'v', assessedAt: '2026-11-01' }), signal: { id: title, title, url: `https://example.com/${title}`, published_at: '2026-10-31', created_at: '2026-10-31' } });
test('signal starter: assessed signals are given to the Advisor with sources; never "you have none"', async () => {
  const sys = await systemPromptFor(...CASES.logistics, { triages: [assessed('relevant', 'Toll-rise'), assessed('watch', 'Port-strike')], runs: [{ profile_id: U, started_at: new Date().toISOString(), finished_at: new Date().toISOString(), status: 'done' }] });
  assert.match(sys, /SIGNALS \(from this account's saved assessments; 2 assessed/);
  assert.match(sys, /\[Relevant\] Toll-rise .*source: https:\/\/example.com\/Toll-rise/);
  assert.match(sys, /\[Worth watching\] Port-strike/);
  assert.match(sys, /Never say they have no signals unless/);
});
test('signal coverage states are distinguished', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  const fresh = { started_at: '2026-11-05T10:00:00Z', finished_at: '2026-11-05T10:01:00Z', status: 'done' };
  assert.equal(buildSignalContext({ rows: [assessed('relevant', 'a')], error: null, run: fresh, runError: null, now }).state, 'available');
  const empty = buildSignalContext({ rows: [], error: null, run: fresh, runError: null, now });
  assert.equal(empty.state, 'empty'); assert.match(empty.text, /retrieval worked/);
  const legacy = buildSignalContext({ rows: [{ relevance_reason: 'Passed the five-category gate.', signal: { id: 's', title: 'Old', url: null, published_at: null, created_at: null } }], error: null, run: null, runError: null, now });
  assert.equal(legacy.state, 'unassessed_only'); assert.equal(legacy.coverage, 'never'); assert.match(legacy.text, /not as established relevance/);
  const stale = buildSignalContext({ rows: [assessed('relevant', 'a')], error: null, run: { ...fresh, finished_at: '2026-10-01T00:00:00Z' }, runError: null, now });
  assert.equal(stale.coverage, 'stale'); assert.match(stale.text, /STALE/);
  assert.equal(buildSignalContext({ rows: [], error: null, run: { ...fresh, status: 'partial' }, runError: null, now }).coverage, 'partial');
  const failed = buildSignalContext({ rows: null, error: { code: 'XX000' }, run: null, runError: null, now });
  assert.equal(failed.state, 'failed'); assert.match(failed.text, /do NOT say there are none/);
  assert.equal(buildSignalContext({ rows: null, error: { code: 'PGRST205' }, run: null, runError: null, now }).state, 'unavailable');
  const ruled = buildSignalContext({ rows: [{ ...assessed('relevant', 'x'), relevance_reason: JSON.stringify({ v: 2, status: 'rejected', text: 'x', evidence: {}, matched: [] }) }], error: null, run: fresh, runError: null, now });
  assert.equal(ruled.state, 'empty'); assert.match(ruled.text, /1 were checked and ruled out/);
});
test("account isolation: another account's signals never reach this Advisor", async () => {
  const other = { ...assessed('relevant', 'Secret-of-V'), profile_id: V };
  const sys = await systemPromptFor(...CASES.software, { triages: [other] });
  assert.doesNotMatch(sys, /Secret-of-V/);
  assert.match(sys, /SIGNALS: retrieval worked and no signal is currently linked/);
});

// ── 4. Decision preparation reads the same validated context ──────────────────────────────────────────────────
test('decision blind-spot analysis no longer receives a team size as "business model"', async () => {
  const D = '22222222-2222-4222-8222-222222222222';
  db = createFakeDb({ profiles: [{ id: U, company_name: 'Legacy Co', business_model: '2–5', geography: 'Ireland' }], ceo_context: [{ profile_id: U, revenue_model: 'Decisive', product_description: 'Bookkeeping for charities' }], decisions: [{ id: D, profile_id: U, title: 'Hire a second bookkeeper', description: 'x', rationale: '', confidence: 3 }], feature_events: [] });
  currentUser = U;
  const res = await analyzeDecision(new Request('http://localhost/api/decisions/' + D + '/analyze', { method: 'POST' }), { params: Promise.resolve({ id: D }) });
  assert.equal(res.status, 200);
  assert.equal(blindSpotInput.business.businessModel, null);
  assert.notEqual(blindSpotInput.business.industry, 'B2B SaaS');
});

// ── 5. One analysis path: ownership, reuse only while current, stale → new version with history ──────────────
test('impact analysis: owned signals only; reused while current; a context change yields a new version and keeps history', async () => {
  const S = '33333333-3333-4333-8333-333333333333';
  const reason = JSON.parse(assessed('relevant', 'Toll-rise').relevance_reason);
  db = createFakeDb({ profiles: [{ id: U, company_name: 'Northline Freight' }], ceo_context: [{ profile_id: U, product_description: 'Road freight forwarding' }], decisions: [], consequences: [],
    signal_triages: [{ profile_id: U, signal_id: S, relevance_reason: JSON.stringify(reason), signal: { id: S, title: 'Toll rise', content: 'Tolls rise 12% in the Netherlands.', url: 'https://example.com/t', what_happened: null } }] });
  let calls = 0;
  const analyse = async () => { calls++; return { triageResult: {}, consequenceResult: { primary_impact: 'Your road freight costs could rise.', secondary_impact: 'a', tertiary_risk: 'b', action_recommendation: 'This week, list routes through toll roads.', urgency_window: 'weeks', urgency_days: 30, confidence_score: 50, impact_matrix: {}, consequence_horizons: [] } }; };
  const run = (userId = U, force = false) => runImpactAnalysis({ supabase: db.client, admin: db.client, userId, signalId: S, force, analyse });
  assert.equal((await run(V)).status, 404, 'another account cannot analyse it');
  const first = await run(); assert.equal(first.status, 200); assert.equal(calls, 1);
  const again = await run(); assert.equal(again.body.reused, true); assert.equal(calls, 1, 'no second paid call while current');
  db.rows('ceo_context')[0].product_description = 'Road and rail freight forwarding';
  const third = await run(); assert.equal(third.body.reused, false); assert.equal(calls, 2);
  const rows = db.rows('consequences');
  assert.equal(rows.length, 2); assert.ok(rows.find((r) => r.id === first.body.consequenceId)?.superseded_at, 'old analysis kept and marked superseded');
});

// ── 6. Scheduled processing rotates across accounts when capacity is limited ─────────────────────────────────
test('rotation: with capacity for one account per run, five runs serve every account before repeating', async () => {
  const { orderByLeastRecentlyServed, markProfileIngested } = await import('../../src/lib/ingest-queue/order.ts');
  const ids = ['a', 'b', 'c', 'd'].map((x) => `00000000-0000-4000-8000-00000000000${x}`);
  db = createFakeDb({ feature_events: [] });
  const served = [];
  for (let day = 0; day < 5; day++) {
    const queue = await orderByLeastRecentlyServed(ids.map((id) => ({ id })));
    served.push(queue[0].id);
    await markProfileIngested(queue[0].id);
    db.rows('feature_events').at(-1).created_at = new Date(Date.UTC(2026, 10, 1 + day)).toISOString();
  }
  assert.deepEqual([...new Set(served.slice(0, 4))].length, 4, 'first four runs serve four different accounts');
  assert.equal(served[4], served[0], 'then the rotation repeats');
});

test('frozen reasoning pairs: each pair differs in exactly one stated fact, and that fact reaches the Advisor', async () => {
  const { pairs } = JSON.parse(readFileSync(new URL('./reasoning-pairs.json', import.meta.url), 'utf8'));
  assert.equal(pairs.length, 6);
  for (const p of pairs) {
    const build = (side) => {
      const ctx = { ...p.base };
      if (p.differ.field.startsWith('business_facts.')) ctx.business_facts = { [p.differ.field.split('.')[1]]: p.differ[side] };
      else ctx[p.differ.field] = p.differ[side];
      return ctx;
    };
    const [a, b] = [await systemPromptFor({ company_name: 'Pair Co' }, build('a')), await systemPromptFor({ company_name: 'Pair Co' }, build('b'))];
    const diff = (x, y) => x.split('\n').filter((l) => !y.split('\n').includes(l));
    const onlyB = diff(b, a).join('\n');
    const factB = typeof p.differ.b === 'string' ? p.differ.b : p.differ.b.map((x) => x.text).join('; ');
    assert.ok(onlyB.includes(factB.slice(0, 25)), `${p.id}: the differing fact reaches the Advisor`);
    // Lines of the DECISIVE LIMITS / BEFORE YOU SEND sections are derived from that one fact, so they do not count.
    const derived = (l) => /^## (DECISIVE LIMITS|BEFORE YOU SEND)$|^(HARD LIMITS|PREFERENCES|ESTIMATES|HOW THEY GET PAID)\b|^- ".*" → |^Re-read DECISIVE LIMITS/.test(l);
    const own = diff(b, a).filter((l) => !derived(l));
    assert.ok(own.length <= 3, `${p.id}: prompts differ only around that fact (${own.length} lines: ${own.join(' | ').slice(0, 300)})`);
  }
});
