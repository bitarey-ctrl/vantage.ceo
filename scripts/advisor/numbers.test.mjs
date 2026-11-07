// Numerical provenance: every number in advice traces to supplied facts, a shown calculation, or a labelled
// illustration — checked on the preserved real answers and through the real Advisor handler.
// Run: node --experimental-test-module-mocks --import ./scripts/company-context/ts-resolve.mjs --test scripts/advisor/numbers.test.mjs
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb } from './fake-db.mjs';

const { traceNumbers, unsupportedFiguresNote } = await import('../../src/lib/advisor/numbers.ts');

test('invented rates and ranges are unsupported; supplied numbers and shown calculations pass', () => {
  const facts = 'How they make money: Commission on each order (8%). Average order £400.';
  const bad = 'Charge 2-3% on first orders and 12-15% on repeats, or a flat fee of £500-2000.';
  assert.deepEqual(traceNumbers(bad, facts).unsupported.map((c) => c.text), ['2-3%', '12-15%', '£500-2000']);
  assert.deepEqual(traceNumbers('You take 8% today.', facts).unsupported, []);
  assert.equal(traceNumbers('At 8% of £400 you earn £32 per order.', facts).claims.find((c) => c.text === '£32').kind, 'calculated');
  // Derivable is not enough: the calculation has to be shown.
  assert.equal(traceNumbers('You probably earn £32 per order.', facts).claims[0].kind, 'unsupported');
  // A labelled illustration is allowed and recognised as such.
  assert.equal(traceNumbers('Illustration, not a benchmark: if 30% of buyers rebook directly, your volume falls.', facts).claims[0].kind, 'illustration');
  // Unlabelled hypotheticals are not illustrations ("If 90% drop off…").
  assert.equal(traceNumbers('If 90% drop off at step two, a redesign is urgent.', '').claims[0].kind, 'unsupported');
  // Counts in a suggested next step are not numeric claims.
  assert.deepEqual(traceNumbers('Call three customers and pick 5 deals this week.', '').claims, []);
  // A spelled-out founder number counts as supplied ("three months").
  assert.deepEqual(traceNumbers('With 3 months of cash left, keep spend small.', 'About three months of cash left').unsupported, []);
});

test('the note names unsupported figures and is absent for purely qualitative advice', () => {
  assert.equal(unsupportedFiguresNote([]), null);
  const note = unsupportedFiguresNote(traceNumbers('A 15% fee might keep them.', '20% commission').unsupported);
  assert.match(note, /15%/); assert.match(note, /not from your details, your signals or a calculation shown here/);
});

// Through the real handler: the note is appended to the streamed answer before it ends.
const A = '00000000-0000-4000-8000-00000000000a';
let script;
mock.module('@anthropic-ai/sdk', { defaultExport: class Anthropic {
  static APIError = class extends Error {}; static RateLimitError = class extends Error {};
  constructor() { this.messages = { stream: () => { const s = script.shift(); let fn = () => {}; return { on(_e, f) { fn = f; return this; }, async finalMessage() { fn(s); return { stop_reason: 'end_turn', content: [{ type: 'text', text: s }] }; } }; } }; }
} });
let db;
mock.module('@/lib/supabase/server', { namedExports: {
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: A } }, error: null }) }, from: (t) => db.client.from(t) }),
  createAdminClient: async () => db.client,
} });
const { POST: chat } = await import('../../src/app/api/advisor/chat/route.ts');
async function ask(answer, ctx) {
  db = createFakeDb({ profiles: [{ id: A, company_name: 'Walkies' }], ceo_context: [{ profile_id: A, ...ctx }], advisor_sessions: [], feature_events: [], decisions: [], strategies: [], consequences: [] });
  script = [answer];
  const res = await chat(new Request('http://localhost/api/advisor/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'Should we lower our 20% fee?' }] }) }));
  return (await res.text()).split('\n\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
}

test('Advisor appends a visible note when an answer states an unsupported figure, and nothing otherwise', async () => {
  const ev = await ask('Lower it to 15% and charge owners £5 per walk.', { revenue_model: '20% commission on each booked walk' });
  const text = ev.filter((e) => e.delta).map((e) => e.delta).join('');
  assert.match(text, /Check before relying on these figures: 15%, £5/);
  assert.equal(ev.at(-1).end.status, 'complete');
  const ok = await ask('Keep 20% and compare it with walkers going direct for free.', { revenue_model: '20% commission on each booked walk' });
  assert.doesNotMatch(ok.filter((e) => e.delta).map((e) => e.delta).join(''), /Check before relying/);
});
