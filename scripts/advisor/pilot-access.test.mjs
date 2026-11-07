// Restricted pilot: server-side access boundary through the REAL createClient (src/lib/supabase/server.ts) and REAL
// routes. Only cookies and the Supabase SSR client are scripted; the database is in memory. Run:
// node --experimental-test-module-mocks --import ./scripts/company-context/ts-resolve.mjs --test scripts/advisor/pilot-access.test.mjs
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb } from './fake-db.mjs';
import { NextRequest } from 'next/server';

process.env.ANTHROPIC_API_KEY = 'test'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
const PILOT = '00000000-0000-4000-8000-0000000000a1', OTHER = '00000000-0000-4000-8000-0000000000b2';
let signedIn = PILOT, db, modelCalls = 0;
mock.module('next/headers', { namedExports: { cookies: async () => ({ getAll: () => [], set() {} }) } });
mock.module('@supabase/ssr', { namedExports: { createServerClient: () => ({
  auth: { getUser: async () => ({ data: { user: signedIn ? { id: signedIn, email: 'x@example.invalid' } : null }, error: null }), signOut: async () => ({ error: null }) },
  from: (t) => db.client.from(t), rpc: (...a) => db.client.rpc(...a),
}) } });
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => db.client } });
mock.module('@anthropic-ai/sdk', { defaultExport: class Anthropic {
  static APIError = class extends Error {}; static RateLimitError = class extends Error {};
  constructor() { this.messages = { create: async () => { modelCalls++; throw new Error('no model in this test'); }, stream: () => { modelCalls++; throw new Error('no model in this test'); } }; }
} });

const seed = () => createFakeDb({
  profiles: [PILOT, OTHER].map((id) => ({ id, company_name: id === PILOT ? 'Pilot Co' : 'Other Co', plan: 'pro', onboarding_completed: true })),
  ceo_context: [PILOT, OTHER].map((profile_id) => ({ profile_id, product_description: 'Coffee subscriptions', competitors: [] })),
  advisor_sessions: [{ id: '11111111-1111-4111-8111-000000000001', profile_id: OTHER, title: 'Other private conversation', messages: [{ role: 'user', content: 'secret plan' }], updated_at: '2026-11-07T10:00:00.000Z' }],
  decisions: [], strategies: [], consequences: [], signals: [], signal_triages: [], feature_events: [],
});
const writes = () => db.log.filter((l) => ['insert', 'update', 'upsert', 'delete'].includes(l.op)).length;
const json = (path, body) => new Request(`http://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost' }, body: JSON.stringify(body) });

const routes = {
  workspace: await import('../../src/app/api/workspace/route.ts'),
  chat: await import('../../src/app/api/advisor/chat/route.ts'),
  sessions: await import('../../src/app/api/advisor/sessions/route.ts'),
  session: await import('../../src/app/api/advisor/sessions/[id]/route.ts'),
  refresh: await import('../../src/app/api/signals/refresh/route.ts'),
  research: await import('../../src/app/api/company/research/route.ts'),
  intake: await import('../../src/app/api/company/intake/route.ts'),
  decisions: await import('../../src/app/api/decisions/route.ts'),
  access: await import('../../src/app/api/pilot/access/route.ts'),
  signup: await import('../../src/app/api/auth/signup/route.ts'),
};
// Every signed-in operation the pilot experience uses, including the paid ones.
const operations = () => [
  ['workspace read', () => routes.workspace.GET()],
  ['workspace save', () => routes.workspace.POST(json('/api/workspace', { operation: 'save-session', id: '11111111-1111-4111-8111-000000000001', expectedUpdatedAt: '2026-11-07T10:00:00.000Z', messages: [] }))],
  ['Advisor answer (paid)', () => routes.chat.POST(json('/api/advisor/chat', { messages: [{ role: 'user', content: 'What now?' }] }))],
  ['new conversation', () => routes.sessions.POST(json('/api/advisor/sessions', { title: 'x' }))],
  ['read a conversation', () => routes.session.GET(new Request('http://localhost/api/advisor/sessions/x'), { params: Promise.resolve({ id: '11111111-1111-4111-8111-000000000001' }) })],
  ['manual refresh (paid)', () => routes.refresh.POST(json('/api/signals/refresh', {}))],
  ['company research (paid)', () => routes.research.POST(json('/api/company/research', {}))],
  ['company intake', () => routes.intake.POST(json('/api/company/intake', { product: 'x' }))],
  ['decisions', () => routes.decisions.GET(new NextRequest('http://localhost/api/decisions'))],
];

test('an account outside the pilot list gets nothing from any pilot operation: no data, no model call, no write', async () => {
  process.env.PILOT_ACCOUNT_IDS = PILOT;
  for (const [name, call] of operations()) {
    db = seed(); signedIn = OTHER; modelCalls = 0;
    const res = await call();
    assert.ok([401, 403].includes(res.status), `${name}: ${res.status}`);
    assert.doesNotMatch(await res.text(), /secret plan|Other private conversation|Pilot Co|Coffee/, `${name}: no data`);
    assert.equal(modelCalls, 0, `${name}: no model call`);
    assert.equal(writes(), 0, `${name}: no write`);
  }
  const why = await routes.access.GET();
  assert.equal(why.status, 403);
  assert.match((await why.json()).error, /invited pilot, and your account isn't part of it/);
});

test('a listed pilot account passes the same check', async () => {
  process.env.PILOT_ACCOUNT_IDS = ` ${PILOT.toUpperCase()} , `;
  db = seed(); signedIn = PILOT;
  assert.equal((await routes.access.GET()).status, 200);
  assert.equal((await routes.workspace.GET()).status, 200);
  assert.equal((await routes.decisions.GET(new NextRequest('http://localhost/api/decisions'))).status, 200);
});

test('fails closed: no list, an empty list or a malformed entry admits nobody, including the pilot account', async () => {
  for (const list of [undefined, '', 'not-a-uuid', `${PILOT},typo`]) {
    if (list === undefined) delete process.env.PILOT_ACCOUNT_IDS; else process.env.PILOT_ACCOUNT_IDS = list;
    db = seed(); signedIn = PILOT;
    assert.equal((await routes.access.GET()).status, 403, String(list));
    assert.equal((await routes.workspace.GET()).status, 401, String(list));
  }
});

test('new sign-ups are never enrolled: the pilot build creates no accounts', async () => {
  process.env.PILOT_ACCOUNT_IDS = PILOT;
  db = seed(); signedIn = null;
  const res = await routes.signup.POST(json('/api/auth/signup', { email: 'new@example.invalid', password: 'long-enough-password', fullName: 'New' }));
  assert.equal(res.status, 403);
  assert.equal(writes(), 0);
});

test('the app page sends a refused account to the explanation page (no redirect loop through /login), and a signed-out visitor to /login', async () => {
  process.env.PILOT_ACCOUNT_IDS = PILOT;
  const { workspaceResponse } = await import('../../src/lib/workspace/page.ts');
  const page = await import('../../src/app/pilot-access/route.ts');
  db = seed();
  signedIn = OTHER;
  let res = await workspaceResponse(new Request('http://localhost/app'));
  assert.equal(new URL(res.headers.get('location')).pathname, '/pilot-access');
  signedIn = null;
  res = await workspaceResponse(new Request('http://localhost/app'));
  assert.equal(new URL(res.headers.get('location')).pathname, '/login');
  signedIn = PILOT;
  res = await workspaceResponse(new Request('http://localhost/app'));
  assert.equal(res.status, 200);
  const why = page.GET();
  assert.equal(why.status, 403);
  assert.doesNotMatch(await why.text(), /Pilot Co|Coffee|secret/);
});
