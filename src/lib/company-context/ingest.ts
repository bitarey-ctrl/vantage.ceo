/**
 * Run a company's source plan once: fetch each planned public feed, de-duplicate at event level (within the run and
 * against signals already stored), keep only items with a stated connection to this company, and link them to the
 * account with that connection as the stored reason. Nothing is shown that lacks a connection; nothing is invented.
 *
 * Retrieved text is untrusted: it is only parsed as RSS, length-capped and stored as text. Article pages are not
 * fetched, so no private-network or third-party page content is followed.
 */
import type { CompanyContext } from './context';
import { connectionFor } from './relevance';
import { clusterEvents, sameEvent } from './events';
import { buildSourcePlan, type SourcePlan } from './source-plan';
import { connectAndCheck, parseStoredConnection, type EvidenceLevel, type StoredConnection } from './verify';
import { verifyDueSources, collectVerifiedSources } from './sources';

export interface FeedItem { title: string; url: string; published_at: string | null; content: string; publisher: string | null }
export interface SourceRunResult { id: string; label: string; ok: boolean; items: number; error?: string }
export interface PlanRunReport {
  planVersion: string; contextVersion: string; startedAt: string; finishedAt: string;
  sources: SourceRunResult[]; gaps: string[];
  fetched: number; uniqueEvents: number; keywordMatched: number; connected: number; notConnected: number; checked: boolean;
  signalIds: string[];
  /** Verified-source coverage this run (original pages and feeds, not search results). */
  verifiedSources: { checked: number; verified: number; failed: number; collected: number; originalItems: number };
  reassessed: { checked: number; retired: number; kept: number };
  runId: string | null; trigger: 'manual' | 'scheduled' | 'test';
  status: 'done' | 'partial' | 'failed';
  inserted: number; linkedExisting: number; alreadyLinked: number; capped: number;
}

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');
const strip = (s: string) => decode(decode(s)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
/** Evergreen listicles and guides ("10 best …", "compare 7 …", "how to …") are not events. */
export const NOT_NEWS = /^(?:\d+\s+(?:best|top|ways|tips|things|reasons)\b|(?:the\s+)?(?:best|top \d+)\b|compare\b|how to\b|what is\b|a guide\b|guide to\b)|\bbest\b.*\b(?:of|for|in) 20\d\d\b/i;
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))?.[1] ?? '';

/** Parse an RSS document into items. Exported for tests. */
export function parseRss(xml: string, limit = 15): FeedItem[] {
  const out: FeedItem[] = [];
  // RSS <item> and Atom <entry> (Atom links are an href attribute).
  for (const m of xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const block = m[2];
    const title = strip(tag(block, 'title')).slice(0, 300);
    const url = strip(tag(block, 'link')) || (block.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1] ?? '').replace(/&amp;/g, '&');
    if (!title || !/^https:\/\//.test(url) || NOT_NEWS.test(title)) continue;
    const pub = strip(tag(block, 'pubDate')) || strip(tag(block, 'updated')) || strip(tag(block, 'published'));
    const publisher = strip(tag(block, 'source')) || null;
    const desc = (strip(tag(block, 'description')) || strip(tag(block, 'summary'))).slice(0, 800);
    const published = pub && !Number.isNaN(Date.parse(pub)) ? new Date(pub).toISOString() : null;
    out.push({ title, url: url.slice(0, 2000), published_at: published, publisher, content: desc && desc !== title ? desc : title });
    if (out.length >= limit) break;
  }
  return out;
}

type Admin = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export async function runSourcePlan(admin: Admin, ctx: CompanyContext, opts: { fetchImpl?: typeof fetch; perSourceTimeoutMs?: number; maxNew?: number; plan?: SourcePlan; call?: Parameters<typeof connectAndCheck>[2]['call']; trigger?: 'manual' | 'scheduled' | 'test' } = {}): Promise<PlanRunReport> {
  const startedAt = new Date().toISOString();
  const trigger = opts.trigger ?? 'manual';
  const plan = opts.plan ?? buildSourcePlan(ctx);
  const doFetch = opts.fetchImpl ?? fetch;
  // Persist the run first, so a crash still leaves a record. A missing table (migration 040 not applied) is tolerated.
  const { data: runRow } = await admin.from('source_collection_runs').insert({ profile_id: ctx.profileId, trigger, status: 'running' }).select('id').single();
  const runId: string | null = runRow?.id ?? null;

  // 1. Verified coverage: open due sources ourselves, then collect new entries from verified ones (original sources).
  const verification = await verifyDueSources(admin, ctx.profileId, { fetchImpl: opts.fetchImpl }).catch(() => ({ checked: 0, verified: 0, failed: 0 }));
  const collected = await collectVerifiedSources(admin, ctx.profileId, { fetchImpl: opts.fetchImpl }).catch(() => ({ items: [], report: [] }));

  // 2. Discovery: news-search leads (aggregator headlines, not verified claims).
  const results: SourceRunResult[] = [];
  const items: (FeedItem & { sourceId: string; evidenceLevel: EvidenceLevel; forceCandidate?: boolean })[] = [];
  await Promise.all(plan.sources.map(async (s) => {
    try {
      const res = await doFetch(s.url, { headers: { 'user-agent': 'VANTAGE-research/1.0 (+https://www.vantage.ceo)', accept: 'application/rss+xml, application/xml' }, signal: AbortSignal.timeout(opts.perSourceTimeoutMs ?? 12_000), redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseRss((await res.text()).slice(0, 2_000_000));
      items.push(...parsed.map((p) => ({ ...p, sourceId: s.id, evidenceLevel: 'aggregator-headline' as const })));
      results.push({ id: s.id, label: s.label, ok: true, items: parsed.length });
    } catch (error) {
      results.push({ id: s.id, label: s.label, ok: false, items: 0, error: (error as Error).message.slice(0, 120) });
    }
  }));
  for (const r of collected.report) results.push({ id: `source:${r.id}`, label: r.url, ok: r.ok, items: r.items, ...(r.error ? { error: r.error } : {}) });
  // Items from verified sources go to the assessment even without a keyword match: indirect effects matter.
  items.push(...collected.items.map((it) => ({ ...it, sourceId: `source:${it.sourceId}`, forceCandidate: true })));

  // 3. One entry per underlying event within this run; original sources win over aggregator copies.
  const keyed = items.map((it, i) => ({ ...it, id: `c${i}` }));
  const clusters = clusterEvents(keyed);
  const canon = clusters.map((cl) => {
    const members = cl.memberIds.map((id) => keyed.find((k) => k.id === id)!);
    return members.find((m) => m.evidenceLevel !== 'aggregator-headline') ?? members[0];
  });
  const keywordMatched = canon.filter((it) => connectionFor(it, ctx).candidate).length;

  // 4. Reassess this account's existing links that were never assessed, or were assessed for older details.
  const { data: linkedRows } = await admin.from('signal_triages').select('signal_id,relevance_reason,signal:signals(id,title,content,what_happened)').eq('profile_id', ctx.profileId).order('created_at', { ascending: false }).limit(200);
  const linked = new Set<string>((linkedRows ?? []).map((r: { signal_id: string }) => r.signal_id));
  const stale = ((linkedRows ?? []) as { signal_id: string; relevance_reason: string | null; signal: { id: string; title: string; content: string | null; what_happened: string | null } | null }[])
    .filter((r) => r.signal && (() => { const st = parseStoredConnection(r.relevance_reason); return !st || st.status === 'unassessed' || (st.status !== 'rejected' && st.contextVersion !== ctx.version); })())
    .slice(0, 15);
  const reassessed = { checked: 0, retired: 0, kept: 0 };
  if (stale.length) {
    const judged = await connectAndCheck(ctx, stale.map((r) => ({ key: r.signal_id, title: r.signal!.title, content: r.signal!.content, what_happened: r.signal!.what_happened, evidenceLevel: 'stored-signal' as const, forceCandidate: true })), { call: opts.call, connectionFor, includeRejected: true, limit: 15 });
    for (const j of judged) {
      if (!j.stored.checked) continue; // assessment unavailable: leave as it was
      reassessed.checked++;
      if (j.stored.status === 'rejected') reassessed.retired++; else reassessed.kept++;
      await admin.from('signal_triages').update({ relevance_reason: JSON.stringify(j.stored) }).eq('profile_id', ctx.profileId).eq('signal_id', j.item.key);
    }
  }

  // 5. Assess new candidates.
  const connected = (await connectAndCheck(ctx, canon.map((it) => ({ ...it, key: it.id })), { call: opts.call, connectionFor, limit: 30 }))
    .map(({ item, stored, score }) => ({ it: item, stored, score }));
  const checked = connected.length === 0 || connected.some((c) => c.stored.checked);
  const maxNew = opts.maxNew ?? 12;
  // Variety: at most 2 items per competitor or source, so one busy name cannot fill the feed.
  const perKey = new Map<string, number>();
  const varied = connected.filter((j) => {
    const m = j.stored.matched;
    const key = m.some((x) => x.kind === 'company') ? 'company' : m.find((x) => x.kind === 'competitor')?.term ?? j.it.sourceId;
    const n = perKey.get(key) ?? 0; if (n >= 2) return false; perKey.set(key, n + 1); return true;
  });
  // Leftover slots go to the capped items, so a quiet week is not padded and a busy one is not starved.
  const chosen = [...varied, ...connected.filter((j) => !varied.includes(j))].slice(0, maxNew);

  // 6. Store: link an already-known event instead of inserting a copy.
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const { data: recent } = await admin.from('signals').select('id,title,url,published_at,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(600);
  let inserted = 0, linkedExisting = 0, alreadyLinked = 0, writeErrors = 0;
  const signalIds: string[] = [];
  for (const { it, stored, score } of chosen) {
    const existing = (recent ?? []).find((r: { id: string; title: string; url: string | null; published_at: string | null; created_at: string }) => sameEvent({ id: r.id, title: r.title, url: r.url, published_at: r.published_at, created_at: r.created_at }, { id: 'new', title: it.title, url: it.url, published_at: it.published_at }));
    let signalId: string | null = existing?.id ?? null;
    if (signalId && linked.has(signalId)) { alreadyLinked++; signalIds.push(signalId); continue; }
    if (!signalId) {
      const { data, error } = await admin.from('signals').insert({
        source: 'rss', title: it.title, content: it.publisher ? `${it.content} (Reported by ${it.publisher}.)` : it.content, url: it.url,
        published_at: it.published_at, what_happened: (stored as StoredConnection).whatChanged ?? it.title, category: null, urgency: 'watch',
      }).select('id').single();
      if (error || !data) { writeErrors++; continue; }
      signalId = data.id; inserted++;
      recent?.unshift({ id: signalId, title: it.title, url: it.url, published_at: it.published_at, created_at: new Date().toISOString() });
    } else linkedExisting++;
    const { error: triageError } = await admin.from('signal_triages').upsert({
      signal_id: signalId, profile_id: ctx.profileId, relevant: true,
      relevance_score: Math.min(100, Math.round(score * 10)), relevance_reason: JSON.stringify(stored),
    }, { onConflict: 'signal_id,profile_id' });
    if (triageError) writeErrors++; else { linked.add(signalId!); signalIds.push(signalId!); }
  }
  const failedSources = results.filter((r) => !r.ok).length;
  const status: PlanRunReport['status'] = writeErrors && !signalIds.length && chosen.length ? 'failed' : failedSources || writeErrors || !checked ? 'partial' : 'done';
  const report: PlanRunReport = {
    planVersion: plan.version, contextVersion: ctx.version, startedAt, finishedAt: new Date().toISOString(),
    sources: results.sort((a, b) => a.id.localeCompare(b.id)), gaps: plan.gaps,
    fetched: items.length, uniqueEvents: canon.length, keywordMatched, connected: connected.length, notConnected: canon.length - connected.length, checked, signalIds,
    inserted, linkedExisting, alreadyLinked, capped: Math.max(0, connected.length - chosen.length),
    verifiedSources: { ...verification, collected: collected.report.length, originalItems: collected.items.length },
    reassessed, runId, trigger, status,
  };
  if (runId) await admin.from('source_collection_runs').update({ status, finished_at: report.finishedAt, report, error: writeErrors ? `${writeErrors} write(s) failed` : null }).eq('id', runId);
  return report;
}
