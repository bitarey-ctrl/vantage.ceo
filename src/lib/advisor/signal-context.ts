/**
 * What the Advisor knows about this account's signals, with an explicit coverage state, so it never says "you have
 * no signals" just because none reached the conversation. Read-only: no refresh, no research, no model calls.
 *
 *   available        assessed signals linked to this account (relevant / worth watching)
 *   unassessed_only  signals are linked but none has been assessed for this business yet
 *   empty            retrieval worked and nothing is linked (or everything was ruled out)
 *   unavailable      signal storage is not reachable for this conversation (e.g. not installed)
 *   failed           the lookup itself failed
 * plus coverage freshness from the last persisted collection run: fresh | stale | partial | never | unknown.
 */
import { parseStoredConnection } from '@/lib/company-context/verify';

export type SignalState = 'available' | 'unassessed_only' | 'empty' | 'unavailable' | 'failed';
export type Coverage = 'fresh' | 'stale' | 'partial' | 'never' | 'unknown';
export interface SignalRow { relevance_reason: string | null; signal: { id: string; title: string; url: string | null; published_at: string | null; created_at: string | null } | null }
export interface RunRow { finished_at: string | null; started_at: string; status: string }
type PgError = { code?: string } | null;

const STALE_DAYS = 7;
const missing = (e: PgError) => Boolean(e && (e.code === '42P01' || e.code === 'PGRST205'));

export function buildSignalContext(input: { rows: SignalRow[] | null; error: PgError; run: RunRow | null; runError: PgError; now?: number }): { state: SignalState; coverage: Coverage; text: string } {
  const now = input.now ?? Date.now();
  let coverage: Coverage = 'unknown';
  if (!missing(input.runError) && !input.runError) {
    if (!input.run) coverage = 'never';
    else if (input.run.status === 'partial' || input.run.status === 'failed') coverage = 'partial';
    else coverage = now - Date.parse(input.run.finished_at ?? input.run.started_at) > STALE_DAYS * 86_400_000 ? 'stale' : 'fresh';
  }
  const coverageLine = {
    fresh: `Coverage: last checked ${input.run?.finished_at?.slice(0, 10)}.`,
    stale: `Coverage: STALE — last checked ${input.run?.finished_at?.slice(0, 10) ?? input.run?.started_at.slice(0, 10)}, more than ${STALE_DAYS} days ago. Newer developments may be missing.`,
    partial: `Coverage: PARTIAL — the last check (${(input.run?.finished_at ?? input.run?.started_at ?? '').slice(0, 10)}) could not reach every source.`,
    never: 'Coverage: no source check has been recorded for this account.',
    unknown: 'Coverage: not recorded.',
  }[coverage];

  if (input.error) {
    const state: SignalState = missing(input.error) ? 'unavailable' : 'failed';
    return { state, coverage, text: state === 'failed'
      ? 'SIGNALS: the lookup failed for this conversation. Say that signals could not be retrieved right now — do NOT say there are none.'
      : 'SIGNALS: not available to this conversation. Say so — do NOT say there are none.' };
  }
  const rows = (input.rows ?? []).filter((r) => r.signal);
  const assessed: { r: SignalRow; st: NonNullable<ReturnType<typeof parseStoredConnection>> }[] = [];
  const unassessed: SignalRow[] = [];
  let ruledOut = 0;
  for (const r of rows) {
    const st = parseStoredConnection(r.relevance_reason);
    if (st?.status === 'rejected') { ruledOut++; continue; }
    if (st && (st.status === 'relevant' || st.status === 'watch')) assessed.push({ r, st }); else unassessed.push(r);
  }
  const date = (r: SignalRow) => (r.signal!.published_at ?? r.signal!.created_at ?? '').slice(0, 10) || 'date unknown';
  if (assessed.length) {
    const order = { relevant: 0, watch: 1 } as const;
    const list = assessed.sort((a, b) => order[a.st.status as 'relevant' | 'watch'] - order[b.st.status as 'relevant' | 'watch']).slice(0, 8).map(({ r, st }) =>
      `- [${st.status === 'relevant' ? 'Relevant' : 'Worth watching'}] ${r.signal!.title} (${date(r)}; source: ${r.signal!.url ?? 'no link'}; ${st.evidence.level === 'aggregator-headline' ? 'headline from news search' : 'original source'})\n  What changed: ${st.whatChanged ?? 'not stated'}\n  Connection to you: ${st.connection ?? 'not stated'}\n  Possible effect: ${st.effect ?? 'not stated'}${st.watchFor ? `\n  Watch for: ${st.watchFor}` : ''}\n  Still unknown: ${st.unknowns ?? 'not stated'}`);
    return { state: 'available', coverage, text: `SIGNALS (from this account's saved assessments; ${assessed.length} assessed, ${unassessed.length} not yet assessed, ${ruledOut} ruled out):\n${list.join('\n')}\n${coverageLine}` };
  }
  if (unassessed.length) {
    return { state: 'unassessed_only', coverage, text: `SIGNALS: ${unassessed.length} external reports are linked to this account but none has been assessed for this business yet:\n${unassessed.slice(0, 5).map((r) => `- ${r.signal!.title} (${date(r)}; source: ${r.signal!.url ?? 'no link'})`).join('\n')}\nTreat them as unassessed reports, not as established relevance. ${coverageLine}` };
  }
  return { state: 'empty', coverage, text: `SIGNALS: retrieval worked and no signal is currently linked to this account${ruledOut ? ` (${ruledOut} were checked and ruled out as not relevant)` : ''}. ${coverageLine}` };
}

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function loadSignalContext(db: Db, profileId: string) {
  const [linked, run] = await Promise.all([
    db.from('signal_triages').select('relevance_reason,signal:signals(id,title,url,published_at,created_at)').eq('profile_id', profileId).order('created_at', { ascending: false }).limit(60),
    db.from('source_collection_runs').select('finished_at,started_at,status').eq('profile_id', profileId).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  return buildSignalContext({ rows: linked.data as SignalRow[] | null, error: linked.error, run: run.data as RunRow | null, runError: run.error });
}
