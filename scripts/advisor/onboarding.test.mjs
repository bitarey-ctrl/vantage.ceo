// The REAL onboarding step handler, request → storage, with mocked Supabase.
// Run: node --experimental-test-module-mocks --import ./scripts/company-context/ts-resolve.mjs --test scripts/advisor/onboarding.test.mjs
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb } from './fake-db.mjs';

const U = '00000000-0000-4000-8000-0000000000e1';
let db;
mock.module('@/lib/supabase/server', { namedExports: {
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: U } }, error: null }) }, from: (t) => db.client.from(t) }),
  createAdminClient: async () => db.client,
} });
const { POST } = await import('../../src/app/api/onboarding/step/route.ts');
const step = async (n, data) => (await POST(new Request('http://localhost/api/onboarding/step', { method: 'POST', body: JSON.stringify({ step: n, data }) }))).status;

test('team size, decision style and risk tolerance are stored in their own fields, not in business fields', async () => {
  db = createFakeDb({ profiles: [{ id: U, email: 'x@example.invalid' }], ceo_context: [] });
  assert.equal(await step(1, { companyName: 'Clearpath', productDescription: 'Bookkeeping for charities', targetCustomer: 'Charity treasurers', topPriority: 'Growth' }), 200);
  assert.equal(await step(3, { teamSize: '2–5' }), 200);
  assert.equal(await step(6, { decisionStyle: 'Decisive' }), 200);
  assert.equal(await step(7, { riskTolerance: 'Calculated' }), 200);
  const p = db.rows('profiles')[0], c = db.rows('ceo_context')[0];
  assert.equal(p.team_size, '2–5'); assert.equal(p.business_model, undefined);
  assert.equal(c.decision_style, 'Decisive'); assert.equal(c.revenue_model, undefined);
  assert.equal(c.risk_tolerance, 'Calculated'); assert.equal(c.avoided_decision, undefined);
});

test('a failed write is reported, not silently accepted', async () => {
  db = createFakeDb({ profiles: [{ id: U, email: 'x@example.invalid' }], ceo_context: [{ profile_id: U }] });
  db.failNext('profiles', 'update');
  assert.equal(await step(3, { teamSize: 'Solo' }), 500);
  db.failNext('ceo_context', 'update');
  assert.equal(await step(6, { decisionStyle: 'Analytical' }), 500);
});
