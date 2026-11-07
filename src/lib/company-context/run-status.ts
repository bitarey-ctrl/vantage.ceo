/**
 * Truthful refresh status. A refresh has several stages — source collection, reassessment of existing links,
 * assessment of new company items, the shared gate, assessment of gate survivors, and writes — and a successful fetch
 * says nothing about whether the analysis ran. Each stage reports its own outcome here (through AsyncLocalStorage, so
 * the protected pipeline files need no new parameters); the route composes one status and message from all of them.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type FailureKind = 'connection' | 'timeout' | 'budget' | 'auth' | 'provider' | 'parse' | 'other';
export type StageName = 'collection' | 'reassessment' | 'company-assessment' | 'gate' | 'survivor-assessment' | 'persistence';
export interface StageRecord { stage: StageName; attempted: number; succeeded: number; failed: number; items: number; kinds: Partial<Record<FailureKind, number>> }
export interface RunStatus { status: 'complete' | 'partial' | 'failed'; stages: StageRecord[]; affected: StageName[]; message: string }

const store = new AsyncLocalStorage<Map<StageName, StageRecord>>();

/** Run `fn` with a fresh stage recorder; returns the stages even when `fn` throws (the error is re-thrown after). */
export async function withRunStatus<T>(fn: () => Promise<T>): Promise<{ result?: T; error?: unknown; stages: StageRecord[] }> {
  const stages = new Map<StageName, StageRecord>();
  return store.run(stages, async () => {
    try { return { result: await fn(), stages: [...stages.values()] }; }
    catch (error) { return { error, stages: [...stages.values()] }; }
  });
}

/**
 * Start a fresh recorder for the rest of the current request (used where the caller cannot wrap its work in a
 * callback, e.g. a loop with `continue`). Returns a reader for the stages recorded since.
 */
export function beginRunStatus(): () => StageRecord[] {
  const stages = new Map<StageName, StageRecord>();
  store.enterWith(stages);
  return () => [...stages.values()];
}

/** Record one attempt of a stage (a call, a batch, a write). Outside a recorder this does nothing. */
export function recordStage(stage: StageName, outcome: { ok: boolean; kind?: FailureKind; items?: number; count?: number }) {
  const m = store.getStore();
  if (!m) return;
  const r = m.get(stage) ?? { stage, attempted: 0, succeeded: 0, failed: 0, items: 0, kinds: {} };
  const n = outcome.count ?? 1;
  r.attempted += n;
  if (outcome.ok) r.succeeded += n; else { r.failed += n; const k = outcome.kind ?? 'other'; r.kinds[k] = (r.kinds[k] ?? 0) + n; }
  r.items += outcome.items ?? 0;
  m.set(stage, r);
}

/**
 * Classify a failed provider or network call from its type, status and low-level cause code — never from message
 * text shown to users. Connection: the request could not be completed at the network level (refused, reset, DNS,
 * TLS, connect timeout). Timeout: the client gave up waiting for a response.
 */
export function classifyFailure(err: unknown): FailureKind {
  const e = err as { name?: string; status?: number; code?: string; cause?: { code?: string; name?: string } } | null;
  if (e?.name === 'ProviderBudgetError') return 'budget';
  if (e?.status === 401 || e?.status === 403 || e?.name === 'AuthenticationError' || e?.name === 'PermissionDeniedError') return 'auth';
  if (e?.name === 'APIConnectionTimeoutError' || e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'timeout';
  if (e?.status === 429 || (typeof e?.status === 'number' && e.status >= 500) || e?.name === 'RateLimitError' || e?.name === 'InternalServerError') return 'provider';
  const code = e?.cause?.code ?? e?.code ?? '';
  if (e?.name === 'APIConnectionError' || /^(UND_ERR|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EPIPE|EHOSTUNREACH|ENETUNREACH|CERT_|ERR_TLS)/.test(code) || (e?.name === 'TypeError' && /fetch failed/i.test(String((err as Error).message)))) return 'connection';
  if (e?.name === 'SyntaxError' || /parse/i.test(String((err as Error)?.message ?? ''))) return 'parse';
  return 'other';
}

/** The low-level cause code for logs (no message text, no request data). */
export function failureCause(err: unknown): string {
  const e = err as { name?: string; status?: number; code?: string; cause?: { code?: string; name?: string } } | null;
  return [e?.name, e?.status, e?.cause?.code ?? e?.code ?? e?.cause?.name].filter(Boolean).join(' ');
}

const KIND_TEXT: Record<FailureKind, string> = {
  connection: 'the connection to the AI service failed',
  timeout: 'the AI service did not answer in time',
  budget: 'the model-call budget for this environment was reached (nothing was sent)',
  auth: "the AI service did not accept this server's credentials",
  provider: 'the AI service was busy or returned an error',
  parse: "the AI service's answer could not be read",
  other: 'of an unexpected error',
};
const STAGE_TEXT: Record<StageName, string> = {
  collection: 'collecting sources',
  reassessment: 'rechecking your existing signals',
  'company-assessment': 'checking new items found for your company',
  gate: 'checking new shared news',
  'survivor-assessment': 'checking shared news against your business',
  persistence: 'saving results',
};

const why = (r: StageRecord) => Object.entries(r.kinds).sort((a, b) => b[1] - a[1]).map(([k]) => KIND_TEXT[k as FailureKind]).join('; and ');

/**
 * One status for the whole refresh. Complete: every stage that had work finished. Partial: something failed but some
 * analysis completed. Failed: no analysis stage completed any of its work. Earlier results are never removed by a
 * failed stage, and the message says so.
 */
export function composeRunStatus(stages: StageRecord[]): RunStatus {
  const affected = stages.filter((s) => s.failed > 0).map((s) => s.stage);
  const analysis = stages.filter((s) => s.stage !== 'collection' && s.stage !== 'persistence');
  const anyAnalysisDone = analysis.some((s) => s.succeeded > 0);
  const status: RunStatus['status'] = !affected.length ? 'complete' : anyAnalysisDone ? 'partial' : 'failed';
  const parts = stages.filter((s) => s.failed > 0).map((s) => `${STAGE_TEXT[s.stage]}: ${s.failed} of ${s.attempted} ${s.attempted === 1 ? 'step' : 'steps'} failed because ${why(s)}`);
  const message = status === 'complete'
    ? 'Every check finished.'
    : `${status === 'failed' ? 'The update failed' : 'The update was only partly checked'}. ${parts.map((p) => p[0].toUpperCase() + p.slice(1)).join('. ')}. Items that were not checked are not judged unimportant, and your earlier results are unchanged.`;
  return { status, stages, affected, message };
}
