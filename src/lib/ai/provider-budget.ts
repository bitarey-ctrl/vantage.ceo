/**
 * Test-only hard ceiling and ledger for billable model requests. Inactive unless PROVIDER_BUDGET_FILE is set
 * (only scripts/isolated/with-isolated-env.mjs sets it). Every billable request reserves a slot BEFORE it is sent;
 * past the ceiling the request is refused, so a test run cannot exceed its approved call count. Usage (tokens,
 * server-side searches) is appended afterwards for exact cost reporting.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

interface Ledger { limit: number; calls: { at: string; kind: string; model: string; usage?: Record<string, unknown> }[] }
const file = () => process.env.PROVIDER_BUDGET_FILE;

function load(): Ledger | null {
  const f = file();
  if (!f) return null;
  if (!existsSync(f)) return { limit: Number(process.env.PROVIDER_CALL_LIMIT ?? 0), calls: [] };
  return JSON.parse(readFileSync(f, 'utf8')) as Ledger;
}

/** Reserve one billable request. Returns the slot index, or null when the ledger is inactive. Throws past the ceiling. */
export function reserveProviderCall(kind: string, model: string): number | null {
  const l = load();
  if (!l) return null;
  if (l.calls.length >= l.limit) throw new Error(`Provider call budget reached (${l.limit}); ${kind} not sent.`);
  l.calls.push({ at: new Date().toISOString(), kind, model });
  writeFileSync(file()!, JSON.stringify(l, null, 1), { mode: 0o600 });
  return l.calls.length - 1;
}

export function recordProviderUsage(slot: number | null, usage: unknown): void {
  if (slot === null) return;
  const l = load();
  if (!l || !l.calls[slot]) return;
  l.calls[slot].usage = (usage ?? {}) as Record<string, unknown>;
  writeFileSync(file()!, JSON.stringify(l, null, 1), { mode: 0o600 });
}
