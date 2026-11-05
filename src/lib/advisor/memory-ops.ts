/**
 * At-most-once Advisor memory updates, per account + conversation + question (advisor_memory_ops, migration 041).
 *
 *   1. The question must be this account's latest question in that conversation (a reused or foreign question id
 *      authorizes nothing).
 *   2. Claim: INSERT keyed by (profile, session, turn). The primary key decides the single winner across instances.
 *   3. The winner applies the update it claimed and records the result with its claim token.
 *   4. A later request for the same question: applied/rejected → nothing more; a live claim → reported as in
 *      progress; an expired claim (crash) or a temporary failure → taken over atomically (compare-and-swap on the
 *      claim token) and THE ORIGINALLY CLAIMED update is applied — never a different one from a newer reply.
 *
 * Applying an update twice (crash after the write, before it was recorded) is harmless: the underlying writes are
 * idempotent for the same value (set fields) or de-duplicated (appended competitors and notes).
 */
import { randomUUID } from 'node:crypto';
import type { MemoryField } from './apply-memory';

export interface MemoryOpKey { profileId: string; sessionId: string; turnId: string }
export interface MemoryProposal { field: MemoryField; value: string; label: string }
export interface MemoryOpRow { status: 'claimed' | 'applied' | 'failed' | 'rejected'; field: string; value: string; label: string | null; claim_token: string; lease_until: string; attempts: number; saved_value: string | null; error: string | null }
type Result<T> = { data: T; error: null } | { data: null; error: string };

export interface MemoryOpsStore {
  /** Atomic claim. data=null with no error means another request already holds this key. */
  insertClaim(key: MemoryOpKey, p: MemoryProposal, token: string, leaseUntil: string): Promise<Result<MemoryOpRow | null>>;
  read(key: MemoryOpKey): Promise<MemoryOpRow | null>;
  /** Compare-and-swap takeover: succeeds only if the row still has `expectedToken` and status `from`. */
  takeOver(key: MemoryOpKey, expectedToken: string, from: 'claimed' | 'failed', token: string, leaseUntil: string, attempts: number): Promise<MemoryOpRow | null>;
  /** Record the outcome; only the current claim holder (token) can. */
  finish(key: MemoryOpKey, token: string, patch: { status: 'applied' | 'failed' | 'rejected'; saved_value?: string | null; error?: string | null }): Promise<boolean>;
}

export interface MemoryOutcome {
  ok: boolean; field?: string; value?: string; label?: string; error?: string;
  state: 'applied' | 'already_applied' | 'rejected' | 'failed' | 'in_progress' | 'unverified_turn' | 'unavailable';
}

const LEASE_MS = 60_000;
type Apply = (field: MemoryField, value: string) => Promise<{ ok: boolean; saved?: string; error?: string }>;

export async function commitMemory(opts: {
  store: MemoryOpsStore; key: MemoryOpKey; proposal: MemoryProposal;
  verifyTurn: () => Promise<boolean>; apply: Apply; now?: () => number;
}): Promise<MemoryOutcome> {
  const { store, key, proposal, apply } = opts;
  const now = opts.now ?? Date.now;
  if (!(await opts.verifyTurn())) return { ok: false, state: 'unverified_turn', error: 'This update could not be tied to your question, so it was not saved.' };

  let token = randomUUID();
  const lease = () => new Date(now() + LEASE_MS).toISOString();
  const claim = await store.insertClaim(key, proposal, token, lease());
  if (claim.error) return { ok: false, state: 'unavailable', error: 'Profile updates are unavailable right now, so nothing was saved.' };
  let row = claim.data;

  if (!row) {
    const existing = await store.read(key);
    if (!existing) return { ok: false, state: 'in_progress', error: 'This update is being saved by another request.' };
    if (existing.status === 'applied') return { ok: true, state: 'already_applied', field: existing.field, value: existing.saved_value ?? existing.value, label: existing.label ?? undefined };
    if (existing.status === 'rejected') return { ok: false, state: 'rejected', field: existing.field, error: existing.error ?? 'That update was not valid.' };
    const expired = Date.parse(existing.lease_until) <= now();
    if (existing.status === 'claimed' && !expired) return { ok: false, state: 'in_progress', error: 'This update is being saved by another request.' };
    token = randomUUID();
    row = await store.takeOver(key, existing.claim_token, existing.status === 'failed' ? 'failed' : 'claimed', token, lease(), existing.attempts + 1);
    if (!row) return { ok: false, state: 'in_progress', error: 'This update is being saved by another request.' };
  }

  // Apply exactly what was claimed (for a takeover, the original update — not the newer reply's).
  const field = row.field as MemoryField, value = row.value, label = row.label ?? undefined;
  let result: { ok: boolean; saved?: string; error?: string };
  try {
    result = await apply(field, value);
  } catch (err) {
    await store.finish(key, token, { status: 'failed', error: (err instanceof Error ? err.message : 'unknown').slice(0, 300) });
    return { ok: false, state: 'failed', field, error: 'Could not save that to your profile. It will be retried if you ask again.' };
  }
  if (!result.ok) {
    await store.finish(key, token, { status: 'rejected', error: (result.error ?? 'invalid').slice(0, 300) });
    return { ok: false, state: 'rejected', field, error: result.error };
  }
  await store.finish(key, token, { status: 'applied', saved_value: result.saved ?? value });
  return { ok: true, state: 'applied', field, value: result.saved ?? value, label };
}

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** advisor_memory_ops through the service-role client. Every statement is keyed by account + conversation + question. */
export function supabaseMemoryOps(db: Db): MemoryOpsStore {
  const match = (k: MemoryOpKey) => ({ profile_id: k.profileId, session_id: k.sessionId, turn_id: k.turnId });
  const cols = 'status,field,value,label,claim_token,lease_until,attempts,saved_value,error';
  return {
    async insertClaim(k, p, token, leaseUntil) {
      const { data, error } = await db.from('advisor_memory_ops').insert({ ...match(k), field: p.field, value: p.value.slice(0, 1000), label: p.label.slice(0, 300), status: 'claimed', attempts: 1, claim_token: token, lease_until: leaseUntil }).select(cols).single();
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
