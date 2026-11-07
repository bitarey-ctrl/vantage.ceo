// Numerical support (meaning, units, period, calculation) and its enforcement in the streamed Advisor answer, plus
// Sonnet 5.5 streaming compatibility through the REAL handler. Run:
// node --experimental-test-module-mocks --import ./scripts/company-context/ts-resolve.mjs --test scripts/advisor/numbers.test.mjs
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb } from './fake-db.mjs';

const { traceNumbers, createNumberGate } = await import('../../src/lib/advisor/numbers.ts');
const kinds = (answer, supplied) => traceNumbers(answer, supplied).claims.map((c) => `${c.text}=${c.kind}`);
const gated = (supplied, text) => { const g = createNumberGate(supplied); return g.push(text) + g.flush(); };

test('correct number, wrong business meaning: the account\'s 20% commission cannot support "20% of walkers leave"', () => {
  const facts = 'How they make money: 20% commission on each booked walk';
  assert.deepEqual(kinds('About 20% of your walkers will leave within a month.', facts), ['20%=mismatched-meaning']);
  assert.deepEqual(kinds('Keep your 20% fee and compare it with walkers going direct.', facts), ['20%=supplied']);
});

test('correct percentage, wrong exposed cost base: a 10% price rise on 30% of costs is 3% of total costs, not 10%', () => {
  const facts = 'Numbers they gave: Share of costs: AWS: 30% (estimate). Signal: AWS raises prices by 10%.';
  assert.deepEqual(kinds('AWS raising prices by 10% raises your total costs by 10%.', facts), ['10%=supplied', '10%=miscalculated']);
  assert.deepEqual(kinds('AWS raising prices by 10% raises your total costs by 3%.', facts), ['10%=supplied', '3%=calculated']);
});

test('an illustrative figure silently used as a recommended target fails; a framed, non-actionable illustration passes', () => {
  const facts = 'Monthly membership at £12';
  assert.deepEqual(kinds('Illustration, not a benchmark: charge £20 for the premium tier.', facts), ['£20=illustration-as-target']);
  assert.deepEqual(kinds('Illustration, not a benchmark: a £20 tier might sell to your keenest members. So set the premium tier at £20.', facts), ['£20=illustration', '£20=illustration-reused']);
  assert.deepEqual(kinds('Illustration, not a benchmark: if 30% of buyers rebook directly, your volume falls.', 'x'), ['30%=illustration']);
});

test('incorrect arithmetic with otherwise valid inputs fails; correct arithmetic passes', () => {
  const facts = 'Commission on each order (8%). Average order value £400.';
  assert.deepEqual(kinds('At 8% of £400 you earn £40 per order.', facts), ['8%=supplied', '£400=supplied', '£40=miscalculated']);
  assert.deepEqual(kinds('At 8% of £400 you earn £32 per order.', facts), ['8%=supplied', '£400=supplied', '£32=calculated']);
});

test('invented rates and ranges are unsupported; supplied durations and next-step counts are not mistaken for claims', () => {
  assert.deepEqual(traceNumbers('Charge 2-3% on first orders and 12-15% on repeats, or £500-2000 flat.', 'Commission on each order (8%)').unsupported.map((c) => c.text), ['2-3%', '12-15%', '£500-2000']);
  assert.deepEqual(kinds('With three months of cash left, keep spend small.', 'About three months of cash left'), ['three months=supplied']);
  assert.deepEqual(kinds('Call three customers this week and review in two weeks.', ''), []);
});

test('real retest answers (Sonnet 5.5, 2026-11-07): the founder\'s own figures are not removed (were false positives)', () => {
  const tradeloop = 'How they make money: Commission on each order (8%)';
  assert.deepEqual(kinds("If it's leakage, the real comparison is the zero-fee alternative: once a buyer has a maker's contact, going direct costs them nothing, while the platform costs 8% of each order.", tradeloop), ['8%=supplied']);
  const shop = 'Our payment provider charges us 3.4% per transaction. Is that normal?';
  assert.deepEqual(kinds('Whether 3.4% hurts depends on your margin per camera, which I don\'t have.', shop), ['3.4%=supplied']);
  assert.deepEqual(kinds('If you tell me your rough monthly sales volume and average camera price, I can show you what 3.4% costs in absolute terms and how much a rate change would be worth.', shop), ['3.4%=supplied']);
  // Found by the replay: a source labelled away from its number ("Commission on each order (8%)") still has a meaning,
  // so it cannot support a share of buyers.
  assert.deepEqual(kinds('Expect about 8% of your buyers to leave for a competitor this year.', tradeloop), ['8%=mismatched-meaning']);
  // The model's genuinely unsupported figure in the same run stays removed.
  assert.deepEqual(kinds("Dropping to, say, 15% doesn't change that math much.", 'How they make money: 20% commission on each booked walk'), ['15%=unsupported']);
});

test('the gate removes the unsupported figure at its own position when the same figure is supported elsewhere', () => {
  const run = (...pieces) => { const g = createNumberGate('How they make money: Commission on each order (8%)'); return pieces.map((p) => g.push(p)).join('') + g.flush(); };
  assert.equal(run('You take 8% of each order, and 8% of your buyers will leave. '), "You take 8% of each order. I don't know whether any of your buyers would leave. ");
  assert.equal(run('Expect 8% of your buyers to leave. You keep 8% of each order. '), "I don't know whether any of your buyers would leave. You keep 8% of each order. ");
  // The same sentence twice, across chunks and within one: each occurrence handled once.
  const twice = 'You keep 8% of each order, and 8% of your buyers leave. ';
  assert.equal(run(twice, twice), "You keep 8% of each order. I don't know whether any of your buyers would leave. ".repeat(2));
  assert.equal(run(twice + twice), "You keep 8% of each order. I don't know whether any of your buyers would leave. ".repeat(2));
});

test('a figure that only sizes an option loses its size; the option stays and no direction is added', () => {
  const walk = 'How they make money: 20% commission on each booked walk';
  assert.equal(gated(walk, "Dropping to, say, 15% doesn't change that math much. "), "Dropping to a different rate doesn't change that math much. ");
  assert.equal(gated(walk, 'Lower it to 15% and charge owners £5 per walk. '), 'Lower it to a different rate and charge owners a different amount per walk. ');
  assert.equal(gated('Monthly membership at £12', 'Illustration, not a benchmark: charge £20 for the premium tier. '), 'Illustration, not a benchmark: charge a different amount for the premium tier. ');
});

test('an unsupported proposition is never kept as fact without its number: removed, or stated as unknown', () => {
  const trade = 'How they make money: Commission on each order (8%)';
  // Customer loss with no evidence: not "some of your buyers will leave", but an explicit unknown.
  const loss = gated(trade, 'Expect about 8% of your buyers to leave for a competitor this year. ');
  assert.equal(loss, "I don't know whether any of your buyers would leave for a competitor this year. ");
  assert.doesNotMatch(loss, /some of your buyers|will leave/);
  // A rise nobody supplied: not "a rise in costs would hurt" — the clause goes; the next step stays.
  assert.equal(gated('x', 'A 10% rise in costs would hurt your margin. Check your supplier terms. '), 'Check your supplier terms. ');
  // A benchmark from nowhere goes; the founder's own figure and the following advice stay.
  assert.equal(gated('Our payment provider charges us 3.4% per transaction.', 'Whether 3.4% hurts depends on margin. Most camera shops convert 3.4% of visitors. If your margins are thin, ask. '),
    'Whether 3.4% hurts depends on margin. If your margins are thin, ask. ');
  // A wrong calculation and the conclusion drawn from it both go.
  assert.equal(gated('Commission on each order (8%). Average order value £400.', 'At 8% of £400 you earn £40 per order, so a fee cut matters. Talk to sellers first. ').trim(), 'Talk to sellers first.');
  // A follow-on that only acts on the removed forecast goes with it; independent advice stays.
  assert.equal(gated(trade, 'You take 8% today, and 8% of your buyers will leave. Plan for that. Call five buyers this week. '),
    "You take 8% today. I don't know whether any of your buyers would leave. Call five buyers this week. ");
});

test('a supported direction keeps its qualitative claim without the unsupported size; the caveat is kept', () => {
  assert.equal(gated('Signal: your packaging supplier is raising prices next month.', 'A 15% rise in packaging costs would hurt your margin. '), 'A rise in packaging costs would hurt your margin. ');
  // Without that signal the same sentence is not kept as a claim.
  assert.equal(gated('x', 'A 15% rise in packaging costs would hurt your margin. ').trim(), '');
  // The caveat after an unsupported clause survives on its own.
  assert.equal(gated('x', "If buyers leave, roughly 30% could go, but I can't know that without your data. "), "I can't know that without your data. ");
});

test('the gate replaces unsupported figures in place, keeps the qualitative advice and states what was removed', () => {
  const gate = createNumberGate('How they make money: Commission on each order (8%)');
  const out = gate.push('You take 8% today. Charge 2-3% on first orders and 12-15% on repeats, but only if you handle payment risk. ') + gate.flush();
  assert.match(out, /You take 8% today\./);
  assert.ok(out.includes('Charge a different rate on first orders and a different rate on repeats, but only if you handle payment risk.'), out);
  assert.doesNotMatch(out, /\[|\]/, 'no placeholder');
  assert.doesNotMatch(out, /2-3%|12-15%/);
  assert.match(gate.summary(), /I removed 2 figures that aren't supported.*so the advice above is qualitative/);
  assert.doesNotMatch(gate.summary(), /2-3%|12-15%/, 'the note does not repeat the removed figures');
  assert.equal(createNumberGate('').summary(), null);
});

// ── Through the real Advisor handler, with Sonnet 5.5 response shapes ─────────────────────────────────────────────
const A = '00000000-0000-4000-8000-00000000000a';
let script, sent;
mock.module('@anthropic-ai/sdk', { defaultExport: class Anthropic {
  static APIError = class extends Error {}; static RateLimitError = class extends Error {};
  constructor() { this.messages = { stream: (params) => { sent = params; const s = script.shift(); let fn = () => {}; return {
    on(_e, f) { fn = f; return this; },
    async finalMessage() {
      for (const piece of s.pieces ?? [s.text]) fn(piece);
      if (s.throwAfter) throw Object.assign(new Error('Connection error.'), { name: 'APIConnectionError' });
      // Sonnet 5.5 can put a thinking block (empty text, signature only) before the text.
      return { model: 'claude-sonnet-5-5', stop_reason: s.stop ?? 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: (s.pieces ?? [s.text]).join('') }] };
    } }; } }; }
} });
let db;
mock.module('@/lib/supabase/server', { namedExports: {
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: A } }, error: null }) }, from: (t) => db.client.from(t) }),
  createAdminClient: async () => db.client,
} });
const { POST: chat } = await import('../../src/app/api/advisor/chat/route.ts');
async function ask(s, ctx = { revenue_model: '20% commission on each booked walk' }) {
  db = createFakeDb({ profiles: [{ id: A, company_name: 'Walkies' }], ceo_context: [{ profile_id: A, ...ctx }], advisor_sessions: [], feature_events: [], decisions: [], strategies: [], consequences: [] });
  script = [s];
  const res = await chat(new Request('http://localhost/api/advisor/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'Should we lower our 20% fee?' }] }) }));
  return (await res.text()).split('\n\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
}
const textOf = (ev) => ev.filter((e) => e.delta).map((e) => e.delta).join('');

test('request uses claude-sonnet-5-5, no up-front thinking, explicit chat effort and the tokenizer-adjusted cap', async () => {
  await ask({ text: 'Keep 20% for now.' });
  assert.equal(sent.model, 'claude-sonnet-5-5');
  assert.deepEqual(sent.thinking, { type: 'between_tools' });
  assert.deepEqual(sent.output_config, { effort: 'medium' });
  assert.equal(sent.max_tokens, 1300);
  assert.equal(sent.temperature, undefined); assert.equal(sent.top_p, undefined);
  assert.equal(sent.messages.at(-1).role, 'user', 'no assistant prefill');
});

test('an unsupported figure never reaches the founder as a recommendation; supported advice is unchanged', async () => {
  const ev = await ask({ pieces: ['Lower it to 15% and charge owners £5 per walk. ', 'Compare it with walkers going direct for free.'] });
  const text = textOf(ev);
  assert.doesNotMatch(text, /15%|£5/);
  assert.match(text, /Lower it to a different rate and charge owners a different amount per walk\./);
  assert.match(text, /Compare it with walkers going direct for free\./);
  assert.match(text, /I removed 2 figures/);
  assert.deepEqual(ev.find((e) => e.numbers).numbers.removed.map((r) => r.text), ['15%', '£5']);
  assert.equal(ev.at(-1).end.status, 'complete');
  const ok = await ask({ text: 'Keep 20% and compare it with walkers going direct for free.' });
  assert.equal(textOf(ok), 'Keep 20% and compare it with walkers going direct for free.');
});

test('a thinking block before the text does not break parsing or the memory update', async () => {
  db = null;
  const ev = await ask({ text: 'Noted — Rover is now a competitor.\n[[VANTAGE_MEMORY]]{"field":"competitors","value":"Rover","label":"Rover as a competitor"}' });
  assert.match(textOf(ev), /Noted — Rover is now a competitor\./);
  assert.doesNotMatch(textOf(ev), /VANTAGE_MEMORY/);
  assert.equal(ev.at(-1).end.status, 'complete');
});

test('refusal ends as "refusal" with no memory write and no number note', async () => {
  const ev = await ask({ text: '', stop: 'refusal' });
  assert.equal(ev.at(-1).end.status, 'refusal');
  assert.equal(ev.at(-1).end.memory, 'none');
});

test('a connection error mid-answer keeps the checked partial answer, then reports the error', async () => {
  const ev = await ask({ pieces: ['Keep 20% for now. ', 'Then talk to your top walkers'], throwAfter: true });
  assert.match(textOf(ev), /Keep 20% for now\. Then talk to your top walkers/);
  assert.ok(ev.at(-1).error, JSON.stringify(ev.at(-1)));
});
