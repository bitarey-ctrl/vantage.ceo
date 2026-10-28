/**
 * Account-backed workspace contract: what the main app may store for a decision beyond its core columns, and the
 * history rules every save must respect. Pure (zod only) so it is tested directly with Node's type stripping.
 *
 * Stored per decision (decision_workspaces.support):
 *   goal, limit                 the frame. A changed frame marks options for recheck; it does not erase reasoning.
 *   evidence[]                  tagged claims with origin, optional safe http(s) link and real date, caveat, decisive flag.
 *   learning                    question, check, disconfirming trigger, check date.
 *   inaction                    the cost of waiting, in the user's words.
 *   scenario                    the user's own inputs; the arithmetic is recomputed here, never trusted from the client.
 *   snapshot                    immutable copy of the context when a choice was recorded (never reconstructed later).
 *   reviews[]                   append-only observations; "too early" requires a next date.
 *   signalLink, parentId        explicit provenance of a signal-derived decision and of a reconsideration.
 * Never stored here: conversation text (it lives in advisor_sessions), browser display preferences, derived state.
 */
import { z } from 'zod';

export const MAX_SUPPORT_BYTES = 200_000;

export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

const text = (max: number) => z.string().trim().max(max);
const dateOrEmpty = z.string().trim().max(10).refine((v) => v === '' || isRealDate(v), 'Use a real calendar date.');
const urlOrEmpty = z.string().trim().max(2000).refine((v) => v === '' || safeUrl(v) !== '', 'Use an http or https link.');
const finiteOrEmpty = z.string().trim().max(40).refine((v) => v === '' || Number.isFinite(Number(v)), 'Use a number.');
const timestamp = z.string().trim().max(40).refine((v) => !Number.isNaN(Date.parse(v)), 'Use a real timestamp.');

export const evidenceItem = z.object({
  id: text(120).min(1),
  kind: z.enum(['business', 'external', 'assumption', 'unknown']),
  claim: text(6000).min(1, 'Write the claim.'),
  source: text(500).default(''),
  url: urlOrEmpty.default(''),
  date: dateOrEmpty.default(''),
  limit: text(3000).default(''),
  decisive: z.boolean().default(false),
});

export const learningPlan = z.object({
  question: text(2000).default(''),
  check: text(3000).default(''),
  trigger: text(3000).default(''),
  date: dateOrEmpty.default(''),
});

export const scenarioInput = z.object({
  currentPrice: finiteOrEmpty.default(''),
  currentCustomers: finiteOrEmpty.default(''),
  newPrice: finiteOrEmpty.default(''),
  newCustomers: finiteOrEmpty.default(''),
});
export type ScenarioInput = z.infer<typeof scenarioInput>;

/** Same arithmetic and limits as public/comparison/engine.js `scenario`. Blank is not zero. */
export function scenarioResult(input: ScenarioInput) {
  const fields = ['currentPrice', 'currentCustomers', 'newPrice', 'newCustomers'] as const;
  if (fields.some((k) => input[k] === '')) return { available: false as const, reason: 'Add your own price and customer assumptions. Blank is not zero.' };
  const v = Object.fromEntries(fields.map((k) => [k, Number(input[k])])) as Record<(typeof fields)[number], number>;
  if (Object.values(v).some((x) => !Number.isFinite(x) || x < 0) || v.currentPrice === 0 || v.newPrice === 0) {
    return { available: false as const, reason: 'Prices must be above zero. Customer counts must be zero or more.' };
  }
  const current = v.currentPrice * v.currentCustomers, proposed = v.newPrice * v.newCustomers;
  return { available: true as const, current, proposed, delta: proposed - current, breakEvenCustomers: Math.ceil(current / v.newPrice),
    limitation: 'Monthly revenue sensitivity only. No costs, churn prediction or probability of success.' };
}

export const choiceSnapshot = z.object({
  at: timestamp,
  optionId: text(120).min(1),
  optionTitle: text(500).default(''),
  why: text(6000).min(1, 'Keep a reason with your choice.'),
  expected: text(6000).default(''),
  uncertainty: text(6000).default(''),
  next: text(6000).min(1, 'Keep a next step with your choice.'),
  review: dateOrEmpty.default(''),
  condition: text(3000).default(''),
  exception: text(3000).default(''),
  context: z.record(z.string(), z.unknown()).default({}),
}).refine((s) => s.expected !== '' || s.uncertainty !== '', 'Record an expectation, or say what is still unknown.');

export const reviewEntry = z.object({
  at: timestamp,
  status: z.enum(['observed', 'too-early']),
  observed: text(6000).min(1, 'Describe what you observed, or why it is too early.'),
  executed: z.enum(['yes', 'partly', 'no', 'unknown']).default('unknown'),
  learned: text(6000).default(''),
  nextReview: dateOrEmpty.default(''),
}).refine((r) => r.status !== 'too-early' || r.nextReview !== '', 'Choose when to check again.');

export const workspaceSupport = z.object({
  goal: text(3000).default(''),
  limit: text(3000).default(''),
  evidence: z.array(evidenceItem).max(100).default([]),
  learning: learningPlan.nullable().default(null),
  inaction: text(6000).default(''),
  scenario: scenarioInput.nullable().default(null),
  snapshot: choiceSnapshot.nullable().default(null),
  reviews: z.array(reviewEntry).max(200).default([]),
  signalLink: z.object({ eventId: text(200).min(1), developmentId: text(200).min(1) }).nullable().default(null),
  parentId: z.string().uuid().nullable().default(null),
  imported: z.object({ from: z.literal('browser-notes'), at: timestamp }).nullable().default(null),
}).strip(); // conversation copies (thread), session ids and display flags are never stored here
export type WorkspaceSupport = z.infer<typeof workspaceSupport>;

/** Parse and normalise a support object for storage. Only scenario inputs are stored; see `forClient`. */
export function normaliseSupport(raw: unknown): { ok: true; value: WorkspaceSupport } | { ok: false; error: string; field?: string } {
  const parsed = workspaceSupport.safeParse(raw ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message || 'Check the decision notes and try again.', field: issue?.path.join('.') };
  }
  if (JSON.stringify(parsed.data).length > MAX_SUPPORT_BYTES) return { ok: false, error: 'These decision notes are too long to save. Shorten them and try again.' };
  return { ok: true, value: parsed.data };
}

/** What the browser receives: stored support plus the scenario arithmetic recomputed from the stored inputs. */
export function forClient(stored: unknown) {
  const parsed = workspaceSupport.safeParse(stored ?? {});
  const value = parsed.success ? parsed.data : workspaceSupport.parse({});
  return { ...value, scenario: value.scenario ? { ...value.scenario, result: scenarioResult(value.scenario) } : null };
}

const stable = (v: unknown) => JSON.stringify(v ?? null);
const reasoning = (s: WorkspaceSupport | null) => {
  if (!s) return stable(null);
  // Everything except the append-only reviews and later-added provenance.
  const { reviews: _reviews, imported: _imported, ...rest } = s;
  return stable(rest);
};

export interface CoreState {
  status: 'open' | 'decided' | 'archived';
  rationale: string | null;
  alternatives_considered: unknown;
  actual_outcome?: string | null;
}
export interface CoreChange {
  status?: 'open' | 'decided' | 'archived';
  rationale?: string;
  alternatives_considered?: unknown;
  actual_outcome?: string | null;
}

const hasRecordedOption = (alternatives: unknown) =>
  Array.isArray(alternatives) && alternatives.some((item) => item && typeof item === 'object' && 'comparisonChoice' in item && (item as Record<string, unknown>).comparisonChoice);

/**
 * Server-side lifecycle rules for one save. Returns an error message, or null when the change is allowed.
 * `before.support` is the stored workspace (null when none exists yet); `after` is the full proposed state.
 */
export function lifecycleProblem(before: { core: CoreState; support: WorkspaceSupport | null }, change: CoreChange, afterSupport: WorkspaceSupport | null): string | null {
  const status = change.status ?? before.core.status;
  const wasOpen = before.core.status === 'open';
  const recordedBefore = before.core.status !== 'open' || hasRecordedOption(before.core.alternatives_considered) || Boolean(before.support?.snapshot);

  if (before.core.status === 'decided' && change.status === 'open') return 'Keep this recorded choice and create a new decision to reconsider it.';
  if (before.core.status === 'archived' && change.status === 'open' && recordedBefore) return 'Restore this recorded choice to Decided.';
  if (!wasOpen && (change.rationale !== undefined || change.alternatives_considered !== undefined)) return 'Keep the recorded choice intact. Reconsider it in a new decision.';
  if (change.status === 'decided' && wasOpen && !(change.rationale ?? before.core.rationale ?? '').trim()) return 'Record your reason for this choice.';
  if (change.actual_outcome !== undefined && status !== 'decided') return 'Record a choice before reviewing its outcome.';

  const beforeSnapshot = before.support?.snapshot ?? null;
  const afterSnapshot = afterSupport?.snapshot ?? null;
  if (beforeSnapshot && stable(afterSnapshot) !== stable(beforeSnapshot)) return 'A recorded choice snapshot cannot change.';
  if (!beforeSnapshot && afterSnapshot) {
    if (!(wasOpen && change.status === 'decided')) return 'A choice snapshot is saved only when you record the choice.';
    const options = Array.isArray(change.alternatives_considered) ? change.alternatives_considered as Record<string, unknown>[] : [];
    const picked = options.find((o) => o?.id === afterSnapshot.optionId);
    if (!picked || !picked.comparisonChoice) return 'Choose an option explicitly before recording it.';
  }

  const oldReviews = before.support?.reviews ?? [];
  const newReviews = afterSupport?.reviews ?? oldReviews;
  if (newReviews.length < oldReviews.length || oldReviews.some((r, i) => stable(r) !== stable(newReviews[i]))) return 'Earlier reviews are kept as they were. Add a new review instead.';
  if (newReviews.length > oldReviews.length && status !== 'decided' && !(status === 'archived' && before.core.status === 'decided')) return 'Record a choice before reviewing an outcome.';

  // Once a choice is recorded the reasoning around it is history: only reviews and provenance may be added.
  if (!wasOpen && afterSupport && before.support && reasoning(afterSupport) !== reasoning(before.support)) return 'Keep this recorded reasoning intact. Reconsider in a new decision.';
  if (!wasOpen && afterSupport && !before.support) {
    const { reviews: _r, imported: _i, ...rest } = afterSupport;
    const empty = workspaceSupport.parse({});
    const { reviews: _er, imported: _ei, ...emptyRest } = empty;
    if (stable(rest) !== stable(emptyRest) && !afterSupport.imported) return 'Keep this recorded reasoning intact. Reconsider in a new decision.';
  }
  return null;
}

// ─── Signal preferences ───────────────────────────────────────────────────────────────────────────────────
export const signalAction = z.enum(['watch', 'unwatch', 'ack', 'unread', 'dismiss', 'restore']);
export type SignalAction = z.infer<typeof signalAction>;
export interface SignalPreference { watching: boolean; watch_baseline: string | null; acknowledged_revision: string | null; dismissed: boolean }

/** The next stored state for an action. Watch keeps its baseline; acknowledgment never changes Watch. */
export function nextSignalPreference(current: SignalPreference | null, action: SignalAction, revision: string): SignalPreference {
  const base: SignalPreference = current ?? { watching: false, watch_baseline: null, acknowledged_revision: null, dismissed: false };
  switch (action) {
    case 'watch': return { ...base, watching: true, watch_baseline: base.watching && base.watch_baseline ? base.watch_baseline : revision };
    case 'unwatch': return { ...base, watching: false, watch_baseline: null };
    case 'ack': return { ...base, acknowledged_revision: revision };
    case 'unread': return { ...base, acknowledged_revision: null };
    case 'dismiss': return { ...base, dismissed: true };
    case 'restore': return { ...base, dismissed: false };
  }
}

// ─── Browser-note import ──────────────────────────────────────────────────────────────────────────────────
export const importPayload = z.object({
  decisions: z.record(z.string().uuid(), z.object({ stamp: z.string().max(100), support: z.unknown() })).default({}),
  sessionLinks: z.record(z.string().uuid(), z.object({ kind: z.enum(['decision', 'signal', 'strategy']), id: z.string().uuid() })).default({}),
  preferences: z.object({
    watch: z.array(z.string().uuid()).max(500).default([]),
    dismiss: z.array(z.string().uuid()).max(500).default([]),
    ack: z.record(z.string().uuid(), z.string().max(200)).default({}),
    watchBaseline: z.record(z.string().uuid(), z.string().max(200)).default({}),
  }).default({ watch: [], dismiss: [], ack: {}, watchBaseline: {} }),
});
export type ImportPayload = z.infer<typeof importPayload>;

/** Decide one decision's import: only into an empty workspace, only when the browser copy was taken of this exact version. */
export function importDecisionVerdict(input: { stamp: string; serverUpdatedAt: string; hasWorkspace: boolean; support: unknown; at: string }):
  { import: true; support: WorkspaceSupport } | { import: false; reason: string } {
  if (input.hasWorkspace) return { import: false, reason: 'already-in-account' };
  if (input.stamp !== input.serverUpdatedAt) return { import: false, reason: 'changed-since-these-notes' };
  const raw = (input.support && typeof input.support === 'object' ? input.support : {}) as Record<string, unknown>;
  const parsed = normaliseSupport({ ...raw, imported: { from: 'browser-notes', at: input.at } });
  if (!parsed.ok) return { import: false, reason: 'unreadable-notes' };
  return { import: true, support: parsed.value };
}
