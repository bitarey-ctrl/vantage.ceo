// Offline (mocked provider) tests for the Advisor stream protocol and stored message shape.
// Run: node --import ./scripts/company-context/ts-resolve.mjs --test scripts/advisor/
// These verify engineering behaviour against SIMULATED provider streams, not actual provider behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { relayAdvisorStream, createMarkerFilter, endStatus, safeError } from '../../src/lib/advisor/stream.ts';
import { advisorMessage } from '../../src/lib/advisor/messages.ts';

/** A scripted provider stream: emits text chunks, then resolves (or rejects) finalMessage. */
function fakeStream(chunks, stopReason, { failAfter = null } = {}) {
  let listener = () => {};
  return {
    on(_e, fn) { listener = fn; return this; },
    async finalMessage() {
      let text = '';
      for (const [i, c] of chunks.entries()) { if (failAfter !== null && i === failAfter) throw failAfter === 0 && typeof chunks[0] !== 'string' ? chunks[0] : new Error('socket hang up'); listener(c); text += c; }
      return { stop_reason: stopReason, content: [{ type: 'text', text }] };
    },
  };
}
async function run(stream, { gone = () => false, memory = async () => ({ ok: true, field: 'competitors' }) } = {}) {
  const events = []; let memoryCalls = 0;
  const r = await relayAdvisorStream({ stream, send: (v) => events.push(v), clientGone: gone, applyFromReply: async (t) => { memoryCalls++; return memory(t); } });
  return { r, events, memoryCalls, text: events.filter((e) => e.delta).map((e) => e.delta).join('') };
}
const MARK = '[[VANTAGE_MEMORY]]{"field":"competitors","value":"Acme","label":"Acme as a competitor"}';

test('complete answer: one terminal end=complete, marker never sent, memory applied once', async () => {
  const { r, events, memoryCalls, text } = await run(fakeStream(['Noted — Acme added.', '\n[[VANTA', 'GE_MEMORY]]{"field":"competitors","value":"Acme","label":"x"}'], 'end_turn'));
  assert.equal(r.status, 'complete');
  assert.equal(text, 'Noted — Acme added.\n');
  assert.ok(!text.includes('VANTAGE'), 'split marker never reaches the client');
  assert.equal(memoryCalls, 1);
  const terminal = events.filter((e) => e.end || e.error);
  assert.deepEqual(terminal, [{ end: { status: 'complete', stopReason: 'end_turn', memory: 'applied' } }]);
  assert.ok(!events.some((e) => e === '[DONE]'));
});

test('token limit: end=max_tokens, partial text kept, memory NOT applied even if a marker was produced', async () => {
  const { r, events, memoryCalls, text } = await run(fakeStream(['Part one. Part two is cut', MARK], 'max_tokens'));
  assert.equal(r.status, 'max_tokens');
  assert.equal(text, 'Part one. Part two is cut');
  assert.equal(memoryCalls, 0);
  assert.equal(events.at(-1).end.status, 'max_tokens');
  assert.equal(events.at(-1).end.memory, 'skipped');
});

test('refusal is reported as refusal, never as complete; no memory', async () => {
  const { r, events, memoryCalls } = await run(fakeStream(['I can’t help with that.'], 'refusal'));
  assert.equal(r.status, 'refusal'); assert.equal(memoryCalls, 0); assert.equal(events.at(-1).end.status, 'refusal');
});

test('unexpected stop reasons are incomplete, not complete', () => {
  for (const s of ['pause_turn', 'tool_use', null, undefined, 'something_new']) assert.equal(endStatus(s), 'incomplete');
  assert.equal(endStatus('end_turn'), 'complete');
});

test('client disconnect (Stop / navigation): no terminal event, no memory write', async () => {
  let gone = false;
  const stream = fakeStream(['Half an ans', 'wer', MARK], 'end_turn');
  const orig = stream.on.bind(stream);
  stream.on = (e, fn) => orig(e, (t) => { fn(t); gone = true; }); // the client leaves after the first chunk
  const { r, events, memoryCalls } = await run(stream, { gone: () => gone });
  assert.equal(r.status, 'disconnected');
  assert.equal(memoryCalls, 0, 'interrupted output cannot mutate durable memory');
  assert.ok(!events.some((e) => e.end), 'no completion claimed');
});

test('provider failure mid-stream: safe error event, partial text sent so far, no memory', async () => {
  const { r, events, memoryCalls } = await run(fakeStream(['Some text', 'more'], 'end_turn', { failAfter: 1 }));
  assert.equal(r.status, 'error'); assert.equal(memoryCalls, 0);
  assert.equal(events.at(-1).error.kind, 'server');
  assert.ok(!JSON.stringify(events).includes('socket hang up'), 'raw provider error is not sent to the client');
});

test('a failed memory write is reported and does not hide the answer', async () => {
  const { events } = await run(fakeStream(['Done.', MARK], 'end_turn'), { memory: async () => { throw new Error('db down'); } });
  assert.equal(events.find((e) => e.memory).memory.ok, false);
  assert.equal(events.at(-1).end.memory, 'failed');
  assert.equal(events.at(-1).end.status, 'complete');
});

test('marker filter: text that only looks like the start of the marker is released at the end', () => {
  const f = createMarkerFilter();
  assert.equal(f.push('Use [[') + f.push('brackets]] freely'), 'Use [[brackets]] freely');
  assert.equal(f.flush(), '');
  const g = createMarkerFilter();
  assert.equal(g.push('End [[VAN'), 'End ');
  assert.equal(g.flush(), '[[VAN');
});

test('provider errors become safe categories', () => {
  const credit = Object.assign(Object.create(Anthropic.APIError.prototype), { status: 400, message: 'Your credit balance is too low to access the Anthropic API.' });
  assert.equal(safeError(credit).kind, 'unavailable');
  assert.doesNotMatch(safeError(credit).message, /credit balance is too low/);
  const overloaded = Object.assign(Object.create(Anthropic.APIError.prototype), { status: 529, message: 'Overloaded' });
  assert.equal(safeError(overloaded).kind, 'overloaded');
  assert.equal(safeError(new Error('ECONNRESET')).kind, 'server');
});

test('stored message keeps its ending status; anything not complete is stored as incomplete', () => {
  const m = advisorMessage.parse({ role: 'assistant', content: 'Partial', status: 'max_tokens', turnId: 'turn-12345678' });
  assert.equal(m.incomplete, true); assert.equal(m.status, 'max_tokens');
  const c = advisorMessage.parse({ role: 'assistant', content: 'Done.', status: 'complete' });
  assert.equal(c.incomplete, undefined);
  assert.throws(() => advisorMessage.parse({ role: 'assistant', content: 'x', status: 'finished' }));
  const withAttempts = advisorMessage.parse({ role: 'assistant', content: 'B', status: 'complete', attempts: [{ content: 'A', status: 'transport', at: null }] });
  assert.equal(withAttempts.attempts.length, 1);
});
