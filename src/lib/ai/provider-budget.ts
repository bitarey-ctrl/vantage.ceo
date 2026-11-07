/**
 * Test-only hard ceilings and ledger for billable model requests. Inactive unless PROVIDER_BUDGET_FILE is set
 * (only scripts/isolated/with-isolated-env.mjs sets it). Every billable request reserves a slot BEFORE it is sent:
 * - call ceiling (`limit`): past it the request is refused;
 * - dollar ceiling (`dollarLimit`, optional): the request's WORST-CASE cost is reserved first — input tokens bounded
 *   by the prompt's UTF-8 byte count (a token always covers at least one byte) plus the full output cap at the
 *   ledger's per-model prices. A request whose worst case could cross the ceiling is refused. A call without recorded
 *   usage (in flight, cancelled, failed) counts at its reserved worst case, or at `unrecordedAllowanceUsd`.
 * Usage (tokens, server-side searches) is appended afterwards for exact cost reporting.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

interface Call { at: string; kind: string; model: string; servedModel?: string; worstUsd?: number; usage?: Record<string, unknown>; failure?: { kind: string; cause: string; at: string } }
interface Ledger {
  limit: number; calls: Call[];
  dollarLimit?: number;
  /** $ per million input/output tokens, per model id. Required when dollarLimit is set. */
  prices?: Record<string, [number, number]>;
  searchUsd?: number;
  unrecordedAllowanceUsd?: number;
}
export interface CallEstimate { inputBytes: number; maxTokens: number; toolUsd?: number }

export class ProviderBudgetError extends Error {
  constructor(message: string) { super(message); this.name = 'ProviderBudgetError'; }
}

const file = () => process.env.PROVIDER_BUDGET_FILE;
function load(): Ledger | null {
  const f = file();
  if (!f) return null;
  if (!existsSync(f)) return { limit: Number(process.env.PROVIDER_CALL_LIMIT ?? 0), calls: [] };
  return JSON.parse(readFileSync(f, 'utf8')) as Ledger;
}

export function usageCost(l: Pick<Ledger, 'prices' | 'searchUsd'>, model: string, usage: Record<string, unknown>): number {
  const [pin, pout] = l.prices?.[model] ?? [0, 0];
  const n = (k: string) => (typeof usage[k] === 'number' ? (usage[k] as number) : 0);
  const searches = ((usage.server_tool_use as Record<string, unknown> | undefined)?.web_search_requests as number | undefined) ?? 0;
  // Thinking tokens are billed as output and included in output_tokens. Cache reads: 0.05x on Sonnet 5.5 / Opus 5.5.
  const cacheRead = /^claude-(sonnet|opus)-5-5/.test(model) ? 0.05 : 0.1;
  return ((n('input_tokens') + n('cache_creation_input_tokens') * 1.25 + n('cache_read_input_tokens') * cacheRead) * pin + n('output_tokens') * pout) / 1e6 + searches * (l.searchUsd ?? 0.01);
}

/** Money already committed: recorded usage, or the reserved worst case for calls without usage. */
export function committedUsd(l: Ledger): number {
  return l.calls.reduce((a, c) => a + (c.usage && Object.keys(c.usage).length ? usageCost(l, c.model, c.usage) : c.worstUsd ?? l.unrecordedAllowanceUsd ?? 0), 0);
}

export function worstCaseUsd(l: Pick<Ledger, 'prices'>, model: string, e: CallEstimate): number | null {
  const p = l.prices?.[model];
  if (!p) return null;
  return ((e.inputBytes + 100) * p[0] + e.maxTokens * p[1]) / 1e6 + (e.toolUsd ?? 0);
}

/** Reserve one billable request. Returns the slot index, or null when the ledger is inactive. Throws past a ceiling. */
export function reserveProviderCall(kind: string, model: string, estimate?: CallEstimate): number | null {
  const l = load();
  if (!l) return null;
  if (l.calls.length >= l.limit) throw new ProviderBudgetError(`Provider call budget reached (${l.limit}); ${kind} not sent.`);
  let worstUsd: number | undefined;
  if (typeof l.dollarLimit === 'number') {
    const w = estimate ? worstCaseUsd(l, model, estimate) : null;
    if (w === null) throw new ProviderBudgetError(`No worst-case estimate or price for ${kind} (${model}); not sent.`);
    const committed = committedUsd(l);
    if (committed + w > l.dollarLimit) throw new ProviderBudgetError(`Dollar ceiling: committed $${committed.toFixed(4)} + worst case $${w.toFixed(4)} would exceed $${l.dollarLimit.toFixed(2)}; ${kind} not sent.`);
    worstUsd = Math.round(w * 1e6) / 1e6;
  }
  l.calls.push({ at: new Date().toISOString(), kind, model, ...(worstUsd !== undefined ? { worstUsd } : {}) });
  writeFileSync(file()!, JSON.stringify(l, null, 1), { mode: 0o600 });
  return l.calls.length - 1;
}

export function recordProviderUsage(slot: number | null, usage: unknown, servedModel?: string): void {
  if (slot === null) return;
  const l = load();
  if (!l || !l.calls[slot]) return;
  l.calls[slot].usage = (usage ?? {}) as Record<string, unknown>;
  // The model that actually answered (the migration check asserts it).
  if (servedModel) l.calls[slot].servedModel = servedModel;
  writeFileSync(file()!, JSON.stringify(l, null, 1), { mode: 0o600 });
}

/**
 * Record that a reserved call failed. Its usage stays unknown (the request may or may not have reached the provider),
 * so it keeps counting at its reserved worst case; the failure class and low-level cause are kept for diagnosis.
 */
export function recordProviderFailure(slot: number | null, kind: string, cause: string): void {
  if (slot === null) return;
  const l = load();
  if (!l || !l.calls[slot]) return;
  l.calls[slot].failure = { kind, cause: cause.slice(0, 120), at: new Date().toISOString() };
  writeFileSync(file()!, JSON.stringify(l, null, 1), { mode: 0o600 });
}
