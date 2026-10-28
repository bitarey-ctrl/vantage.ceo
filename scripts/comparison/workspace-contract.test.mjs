// Account-workspace contract — offline: the real src/lib/workspace/contract.ts (Node type stripping), no network.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../../src/lib/workspace/contract.ts';

const open = { status: 'open', rationale: '', alternatives_considered: [{ id: 'a', title: 'Test small' }] };
const support = (extra = {}) => C.workspaceSupport.parse(extra);

test('dates must be real, links must be http(s), numbers finite', () => {
  assert.equal(C.isRealDate('2026-02-30'), false);
  assert.equal(C.isRealDate('2026-02-28'), true);
  assert.equal(C.safeUrl('javascript:alert(1)'), '');
  assert.equal(C.safeUrl('https://example.org/a'), 'https://example.org/a');
  for (const bad of [{ evidence: [{ id: 'e', kind: 'external', claim: 'c', url: 'javascript:x' }] }, { learning: { date: '2026-13-01' } }, { scenario: { currentPrice: 'Infinity' } }]) {
    assert.equal(C.normaliseSupport(bad).ok, false, JSON.stringify(bad));
  }
});

test('conversation copies, session ids and display flags are never stored', () => {
  const r = C.normaliseSupport({ goal: 'Learn', thread: [{ role: 'user', content: 'hi' }], sessionId: 'x', stale: true, threadContext: [] });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.value).sort(), ['evidence', 'goal', 'imported', 'inaction', 'learning', 'limit', 'parentId', 'reviews', 'scenario', 'signalLink', 'snapshot'].sort());
});

test('scenario arithmetic is recomputed from stored inputs; blank is not zero', () => {
  assert.equal(C.scenarioResult({ currentPrice: '10', currentCustomers: '', newPrice: '12', newCustomers: '90' }).available, false);
  const r = C.scenarioResult({ currentPrice: '10', currentCustomers: '100', newPrice: '12', newCustomers: '90' });
  assert.deepEqual([r.current, r.proposed, r.delta, r.breakEvenCustomers], [1000, 1080, 80, 84]);
  const client = C.forClient({ scenario: { currentPrice: '10', currentCustomers: '100', newPrice: '12', newCustomers: '90', result: { available: true, delta: 999999 } } });
  assert.equal(client.scenario.result.delta, 80, 'a client-supplied result is ignored');
});

test('a snapshot is saved only together with an explicit recorded choice', () => {
  const snap = { at: '2026-10-28T10:00:00Z', optionId: 'a', why: 'Bounded', next: 'Start', uncertainty: 'Unknown response' };
  const after = support({ snapshot: snap });
  assert.match(C.lifecycleProblem({ core: open, support: null }, {}, after), /only when you record/);
  assert.match(C.lifecycleProblem({ core: open, support: null }, { status: 'decided', rationale: 'Bounded', alternatives_considered: [{ id: 'a' }] }, after), /Choose an option explicitly/);
  assert.equal(C.lifecycleProblem({ core: open, support: null }, { status: 'decided', rationale: 'Bounded', alternatives_considered: [{ id: 'a', comparisonChoice: { why: 'Bounded' } }] }, after), null);
  assert.equal(C.normaliseSupport({ snapshot: { ...snap, uncertainty: '' } }).ok, false, 'expectation or uncertainty is required');
});

test('recorded history: snapshot immutable, reviews append-only, reasoning frozen, no reopening', () => {
  const snap = { at: '2026-10-28T10:00:00Z', optionId: 'a', why: 'Bounded', next: 'Start', expected: 'Learn' };
  const decided = { status: 'decided', rationale: 'Bounded', alternatives_considered: [{ id: 'a', comparisonChoice: {} }] };
  const before = support({ goal: 'Learn', snapshot: snap, reviews: [{ at: '2026-11-01T00:00:00Z', status: 'observed', observed: 'Went fine' }] });
  assert.match(C.lifecycleProblem({ core: decided, support: before }, {}, support({ ...before, snapshot: { ...snap, why: 'Changed' } })), /cannot change/);
  assert.match(C.lifecycleProblem({ core: decided, support: before }, {}, support({ ...before, reviews: [] })), /kept as they were/);
  assert.match(C.lifecycleProblem({ core: decided, support: before }, {}, support({ ...before, goal: 'Rewritten' })), /recorded reasoning intact/);
  assert.match(C.lifecycleProblem({ core: decided, support: before }, { status: 'open' }, before), /new decision/);
  assert.match(C.lifecycleProblem({ core: decided, support: before }, { rationale: 'new' }, before), /recorded choice intact/);
  const appended = support({ ...before, reviews: [...before.reviews, { at: '2026-12-01T00:00:00Z', status: 'too-early', observed: 'Not yet', nextReview: '2027-01-10' }] });
  assert.equal(C.lifecycleProblem({ core: decided, support: before }, {}, appended), null);
  assert.equal(C.normaliseSupport({ reviews: [{ at: '2026-12-01T00:00:00Z', status: 'too-early', observed: 'Not yet' }] }).ok, false, 'too early needs a next date');
  assert.match(C.lifecycleProblem({ core: { ...decided, status: 'archived' }, support: before }, { status: 'open' }, before), /Restore this recorded choice/);
  assert.equal(C.lifecycleProblem({ core: { ...decided, status: 'archived' }, support: before }, { status: 'decided' }, before), null);
});

test('open decisions: framing, evidence and learning edits are allowed; outcome needs a recorded choice', () => {
  const before = support({ goal: 'Learn' });
  assert.equal(C.lifecycleProblem({ core: open, support: before }, {}, support({ goal: 'Learn faster', evidence: [{ id: 'e', kind: 'assumption', claim: 'Buyers care' }], learning: { question: 'Do they?', check: 'Ask five', date: '2026-11-20' } })), null);
  assert.match(C.lifecycleProblem({ core: open, support: before }, { actual_outcome: 'x' }, before), /Record a choice/);
  assert.match(C.lifecycleProblem({ core: open, support: before }, { status: 'decided', rationale: '' }, before), /reason/);
});

test('signal preferences: watch keeps its baseline, acknowledgment never stops watching, dismiss is reversible', () => {
  let p = C.nextSignalPreference(null, 'watch', 'v1');
  assert.deepEqual(p, { watching: true, watch_baseline: 'v1', acknowledged_revision: null, dismissed: false });
  p = C.nextSignalPreference(p, 'watch', 'v2');
  assert.equal(p.watch_baseline, 'v1', 'repeating watch does not move the baseline');
  p = C.nextSignalPreference(p, 'ack', 'v2');
  assert.equal(p.watching, true);
  p = C.nextSignalPreference(C.nextSignalPreference(p, 'dismiss', 'v2'), 'restore', 'v2');
  assert.equal(p.dismissed, false);
  assert.equal(C.nextSignalPreference(p, 'unread', 'v2').acknowledged_revision, null);
});

test('browser-note import: only into an empty workspace, only for the same version, labelled', () => {
  const base = { stamp: '2026-10-27T10:00:00Z', serverUpdatedAt: '2026-10-27T10:00:00Z', hasWorkspace: false, support: { goal: 'Old note', thread: [{ role: 'user', content: 'x' }] }, at: '2026-10-28T12:00:00Z' };
  const ok = C.importDecisionVerdict(base);
  assert.equal(ok.import, true);
  assert.equal(ok.support.goal, 'Old note');
  assert.deepEqual(ok.support.imported, { from: 'browser-notes', at: '2026-10-28T12:00:00Z' });
  assert.equal('thread' in ok.support, false);
  assert.deepEqual(C.importDecisionVerdict({ ...base, hasWorkspace: true }), { import: false, reason: 'already-in-account' });
  assert.deepEqual(C.importDecisionVerdict({ ...base, serverUpdatedAt: '2026-10-28T09:00:00Z' }), { import: false, reason: 'changed-since-these-notes' });
});
