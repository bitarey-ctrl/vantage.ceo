/**
 * Advisor memory updates: at most once per question (migration 041) and never over newer facts (migration 042).
 *
 *   1. The question must be this account's latest question in that conversation (a reused or foreign question id
 *      authorizes nothing).
 *   2. Claim: INSERT keyed by (account, conversation, question). The primary key decides one winner across instances.
 *      The claim stores the update AND the version of the field the answer was written against.
 *   3. Apply through apply_advisor_memory() (042), one database transaction that:
 *        - refuses a caller whose claim was taken over or whose lease ran out (a stalled worker cannot write);
 *        - for SET fields, stores an unresolved conflict if the field changed after the answer was written
 *          (a newer correction or another proposal) — nothing is overwritten, no winner is picked;
 *        - for APPENDED fields, writes only a value computed from the current version (else 'retry', recompute);
 *        - writes the value, bumps the version, records history and closes the claim together.
 *   4. A later request for the same question re-applies THE ORIGINALLY CLAIMED update with its ORIGINAL base
 *      version, so an old retry after a newer correction becomes a conflict, not an overwrite.
 */
import { randomUUID } from 'node:crypto';
import { computeMemoryUpdate, type MemoryField } from './apply-memory';

export interface MemoryOpKey { profileId: string; sessionId: string; turnId: string }
export interface MemoryProposal { field: MemoryField; value: string; label: string }
export interface MemoryOpRow { status: 'claimed' | 'applied' | 'failed' | 'rejected' | 'conflict'; field: string; value: string; label: string | null; claim_token: string; lease_until: string; attempts: number; saved_value: string | null; error: string | null; based_on_version: number | null }
type Result<T> = { data: T; error: null } | { data: null; error: string };
export type ApplyResult = 'applied' | 'conflict' | 'retry' | 'lost_claim' | 'rejected';

export interface MemoryOpsStore {
  /** Atomic claim. data=null with no error means another request already holds this key. */
  insertClaim(key: MemoryOpKey, p: MemoryProposal, token: string, leaseUntil: string, basedOnVersion: number): Promise<Result<MemoryOpRow | null>>;
  read(key: MemoryOpKey): Promise<MemoryOpRow | null>;
  /** Compare-and-swap takeover: succeeds only if the row still has `expectedToken` and status `from`. */
  takeOver(key: MemoryOpKey, expectedToken: string, from: 'claimed' | 'failed', token: string, leaseUntil: string, attempts: number): Promise<MemoryOpRow | null>;
  /** Close a claim without a write (rejected / failed / already present); only the current holder can. */
  finish(key: MemoryOpKey, token: string, patch: { status: 'applied' | 'failed' | 'rejected'; saved_value?: string | null; error?: string | null }): Promise<boolean>;
  /** Current ceo_context row and the field's version. */
  readField(profileId: string, field: string): Promise<Result<{ row: Record<string, unknown> | null; version: number }>>;
  /** The transactional apply (042). */
  apply(key: MemoryOpKey, token: string, field: string, value: unknown, expectedVersion: number): Promise<Result<{ result: ApplyResult; error?: string }>>;
}

export interface MemoryOutcome {
  ok: boolean; field?: string; value?: string; label?: string; error?: string;
  state: 'applied' | 'already_applied' | 'already_present' | 'rejected' | 'failed' | 'in_progress' | 'conflict' | 'superseded' | 'unverified_turn' | 'unavailable';
}

const LEASE_MS = 60_000;
const APPLY_ATTEMPTS = 3;

export async function commitMemory(opts: {
  store: MemoryOpsStore; key: MemoryOpKey; proposal: MemoryProposal; basedOnVersion: number | null;
  verifyTurn: () => Promise<boolean>; now?: () => number; onApplied?: (field: string, saved: string) => Promise<void>;
}): Promise<MemoryOutcome> {
  const { store, key, proposal } = opts;
  const now = opts.now ?? Date.now;
  if (opts.basedOnVersion === null) return { ok: false, state: 'unavailable', error: 'Profile updates are unavailable right now, so nothing was saved.' };
  if (!(await opts.verifyTurn())) return { ok: false, state: 'unverified_turn', error: 'This update could not be tied to your question, so it was not saved.' };

  let token = randomUUID();
  const lease = () => new Date(now() + LEASE_MS).toISOString();
  const claim = await store.insertClaim(key, proposal, token, lease(), opts.basedOnVersion);
  if (claim.error) return { ok: false, state: 'unavailable', error: 'Profile updates are unavailable right now, so nothing was saved.' };
  let row = claim.data;

  if (!row) {
    const existing = await store.read(key);
    if (!existing) return { ok: false, state: 'in_progress', error: 'This update is being saved by another request.' };
    if (existing.status === 'applied') return { ok: true, state: 'already_applied', field: existing.field, value: existing.saved_value ?? existing.value, label: existing.label ?? undefined };
    if (existing.status === 'rejected') return { ok: false, state: 'rejected', field: existing.field, error: existing.error ?? 'That update was not valid.' };
    if (existing.status === 'conflict') return conflictOutcome(existing.field);
    const expired = Date.parse(existing.lease_until) <= now();
    if (existing.status === 'claimed' && !expired) return { ok: false, state: 'in_progress', error: 'This update is being saved by another request.' };
    token = randomUUID();
    row = await store.takeOver(key, existing.claim_token, existing.status === 'failed' ? 'failed' : 'claimed', token, lease(), existing.attempts + 1);
    if (!row) return { ok: false, state: 'in_progress', error: 'This update is being saved by another request.' };
  }

  // Apply exactly what was claimed (for a takeover: the original update and its original base version).
  const field = row.field as MemoryField, label = row.label ?? undefined;
  try {
    for (let attempt = 0; attempt < APPLY_ATTEMPTS; attempt++) {
      const state = await store.readField(key.profileId, field);
      if (state.error !== null) throw new Error(state.error);
      const current = state.data;
      const computed = computeMemoryUpdate(field, row.value, current.row);
      // Closing without a write also needs the claim: if it was lost, another request owns the outcome.
      if (!computed.ok) {
        if (!(await store.finish(key, token, { status: 'rejected', error: computed.error.slice(0, 300) }))) return superseded(field);
        return { ok: false, state: 'rejected', field, error: computed.error };
      }
      if (computed.alreadyPresent) {
        if (!(await store.finish(key, token, { status: 'applied', saved_value: computed.saved }))) return superseded(field);
        return { ok: true, state: 'already_present', field, value: computed.saved, label };
      }
      const applied = await store.apply(key, token, field, computed.value, current.version);
      if (applied.error !== null) throw new Error(applied.error);
      const outcome = applied.data;
      switch (outcome.result) {
        case 'applied': await opts.onApplied?.(field, computed.saved); return { ok: true, state: 'applied', field, value: computed.saved, label };
        case 'conflict': return conflictOutcome(field);
        case 'lost_claim': return superseded(field);
        case 'rejected': return { ok: false, state: 'rejected', field, error: outcome.error ?? 'That update was not valid.' };
        case 'retry': continue; // the field changed while we computed the value; recompute from the current version
      }
    }
    await store.finish(key, token, { status: 'failed', error: 'field kept changing' });
    return { ok: false, state: 'failed', field, error: 'Your profile changed while saving this. It was not saved; ask again to retry.' };
  } catch (err) {
    await store.finish(key, token, { status: 'failed', error: (err instanceof Error ? err.message : 'unknown').slice(0, 300) });
    return { ok: false, state: 'failed', field, error: 'Could not save that to your profile. It will be retried if you ask again.' };
  }
}

function superseded(field: string): MemoryOutcome {
  return { ok: false, state: 'superseded', field, error: 'Another request took over this update, so this one did not write anything.' };
}

function conflictOutcome(field: string): MemoryOutcome {
  return { ok: false, state: 'conflict', field, error: `Not saved: your ${field.replace(/_/g, ' ')} changed after this answer was written. The newer value was kept; this suggestion is kept for you to review.` };
}

type Db = { from: (t: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Versions of every tracked field for an account (null if migration 042 is not installed). */
export async function readFieldVersions(db: Db, profileId: string): Promise<Record<string, number> | null> {
  const { data, error } = await db.from('company_fact_versions').select('field,version').eq('profile_id', profileId);
  if (error) return null;
  return Object.fromEntries(((data ?? []) as { field: string; version: number }[]).map((r) => [r.field, Number(r.version)]));
}

/** advisor_memory_ops + apply_advisor_memory() through the service-role client, keyed by account + conversation + question. */
export function supabaseMemoryOps(db: Db): MemoryOpsStore {
  const match = (k: MemoryOpKey) => ({ profile_id: k.profileId, session_id: k.sessionId, turn_id: k.turnId });
  const cols = 'status,field,value,label,claim_token,lease_until,attempts,saved_value,error,based_on_version';
  return {
    async insertClaim(k, p, token, leaseUntil, basedOnVersion) {
      const { data, error } = await db.from('advisor_memory_ops').insert({ ...match(k), field: p.field, value: p.value.slice(0, 1000), label: p.label.slice(0, 300), status: 'claimed', attempts: 1, claim_token: token, lease_until: leaseUntil, based_on_version: basedOnVersion }).select(cols).single();
      if (error) return error.code === '23505' ? { data: null, error: null } : { data: null, error: error.code ?? 'error' };
      return { data, error: null };
    },
    async read(k) {
      const { data } = await db.from('advisor_memory_ops').select(cols).match(match(k)).maybeSingle();
      return data ?? null;
    },
    async takeOver(k, expectedToken, from, token, leaseUntil, attempts) {
      let q = db.from('advisor_memory_ops').update({ status: 'claimed', claim_token: token, lease_until: leaseUntil, attempts, updated_at: new Date().toISOString() })
        .match(match(k)).eq('claim_token', expectedToken).eq('status', from);
      if (from === 'claimed') q = q.lt('lease_until', new Date().toISOString());
      const { data } = await q.select(cols).maybeSingle();
      return data ?? null;
    },
    async finish(k, token, patch) {
      const { data } = await db.from('advisor_memory_ops').update({ ...patch, updated_at: new Date().toISOString() }).match(match(k)).eq('claim_token', token).eq('status', 'claimed').select('status').maybeSingle();
      return Boolean(data);
    },
    async readField(profileId, field) {
      const [{ data: row, error: e1 }, { data: ver, error: e2 }] = await Promise.all([
        db.from('ceo_context').select('*').eq('profile_id', profileId).maybeSingle(),
        db.from('company_fact_versions').select('version').eq('profile_id', profileId).eq('field', field).maybeSingle(),
      ]);
      if (e1 || e2) return { data: null, error: (e1 ?? e2).code ?? 'error' };
      return { data: { row: row ?? null, version: Number(ver?.version ?? 0) }, error: null };
    },
    async apply(k, token, field, value, expectedVersion) {
      if (!db.rpc) return { data: null, error: 'rpc unavailable' };
      const { data, error } = await db.rpc('apply_advisor_memory', { p_profile: k.profileId, p_session: k.sessionId, p_turn: k.turnId, p_token: token, p_field: field, p_value: value, p_expected_version: expectedVersion });
      if (error) return { data: null, error: error.code ?? 'error' };
      return { data: data as { result: ApplyResult; error?: string }, error: null };
    },
  };
}

/**
 * The question must be the account's latest question in that conversation, with the same text the model answered.
 * `asked` is the last user message sent to the model; linked-context chats prefix it with context, ending in
 * "My question: <text>".
 */
export function turnMatches(messages: unknown, turnId: string, asked: string): boolean {
  if (!Array.isArray(messages)) return false;
  const users = messages.filter((m): m is { role: string; content: string; turnId?: string } => Boolean(m && typeof m === 'object' && (m as { role?: unknown }).role === 'user'));
  const last = users[users.length - 1];
  if (!last || last.turnId !== turnId || typeof last.content !== 'string' || !last.content.trim()) return false;
  const q = last.content.trim(), a = asked.trim();
  return a === q || a.endsWith(`My question: ${q}`);
}
