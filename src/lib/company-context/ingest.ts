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
import { connectAndCheck } from './verify';

export interface FeedItem { title: string; url: string; published_at: string | null; content: string; publisher: string | null }
export interface SourceRunResult { id: string; label: string; ok: boolean; items: number; error?: string }
export interface PlanRunReport {
  planVersion: string; contextVersion: string; startedAt: string; finishedAt: string;
  sources: SourceRunResult[]; gaps: string[];
  fetched: number; uniqueEvents: number; keywordMatched: number; connected: number; notConnected: number; checked: boolean;
  signalIds: string[];
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
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    const title = strip(tag(block, 'title')).slice(0, 300);
    const url = strip(tag(block, 'link'));
    if (!title || !/^https:\/\//.test(url) || NOT_NEWS.test(title)) continue;
    const pub = strip(tag(block, 'pubDate'));
    const publisher = strip(tag(block, 'source')) || null;
    const desc = strip(tag(block, 'description')).slice(0, 800);
    const published = pub && !Number.isNaN(Date.parse(pub)) ? new Date(pub).toISOString() : null;
    out.push({ title, url: url.slice(0, 2000), published_at: published, publisher, content: desc && desc !== title ? desc : title });
    if (out.length >= limit) break;
  }
  return out;
}

type Admin = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export async function runSourcePlan(admin: Admin, ctx: CompanyContext, opts: { fetchImpl?: typeof fetch; perSourceTimeoutMs?: number; maxNew?: number; plan?: SourcePlan; call?: Parameters<typeof connectAndCheck>[2]['call'] } = {}): Promise<PlanRunReport> {
  const startedAt = new Date().toISOString();
  const plan = opts.plan ?? buildSourcePlan(ctx);
  const doFetch = opts.fetchImpl ?? fetch;
  const results: SourceRunResult[] = [];
  const items: (FeedItem & { sourceId: string })[] = [];
  await Promise.all(plan.sources.map(async (s) => {
    try {
      const res = await doFetch(s.url, { headers: { 'user-agent': 'VANTAGE-research/1.0 (+https://www.vantage.ceo)', accept: 'application/rss+xml, application/xml' }, signal: AbortSignal.timeout(opts.perSourceTimeoutMs ?? 12_000), redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseRss((await res.text()).slice(0, 2_000_000));
      items.push(...parsed.map((p) => ({ ...p, sourceId: s.id })));
      results.push({ id: s.id, label: s.label, ok: true, items: parsed.length });
    } catch (error) {
      results.push({ id: s.id, label: s.label, ok: false, items: 0, error: (error as Error).message.slice(0, 120) });
    }
  }));

  // One entry per underlying event within this run.
  const keyed = items.map((it, i) => ({ ...it, id: `c${i}` }));
  const clusters = clusterEvents(keyed);
  const canon = clusters.map((cl) => keyed.find((k) => k.id === cl.canonicalId)!);
  const keywordMatched = canon.filter((it) => connectionFor(it, ctx).candidate).length;
  // Keyword match on your details, then one batched check that drops namesakes and items with no plausible effect.
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

  // Match against stored signals (same event already known → link it instead of inserting a copy).
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const { data: recent } = await admin.from('signals').select('id,title,url,published_at,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(600);
  const { data: linkedRows } = await admin.from('signal_triages').select('signal_id').eq('profile_id', ctx.profileId);
  const linked = new Set<string>((linkedRows ?? []).map((r: { signal_id: string }) => r.signal_id));
  let inserted = 0, linkedExisting = 0, alreadyLinked = 0;
  const signalIds: string[] = [];
  for (const { it, stored, score } of chosen) {
    const existing = (recent ?? []).find((r: { id: string; title: string; url: string | null; published_at: string | null; created_at: string }) => sameEvent({ id: r.id, title: r.title, url: r.url, published_at: r.published_at, created_at: r.created_at }, { id: 'new', title: it.title, url: it.url, published_at: it.published_at }));
    let signalId: string | null = existing?.id ?? null;
    if (signalId && linked.has(signalId)) { alreadyLinked++; signalIds.push(signalId); continue; }
    if (!signalId) {
      const { data, error } = await admin.from('signals').insert({
        source: 'rss', title: it.title, content: it.publisher ? `${it.content} (Reported by ${it.publisher}.)` : it.content, url: it.url,
        published_at: it.published_at, what_happened: it.title, category: null, urgency: 'watch',
      }).select('id').single();
      if (error || !data) continue;
      signalId = data.id; inserted++;
      recent?.unshift({ id: signalId, title: it.title, url: it.url, published_at: it.published_at, created_at: new Date().toISOString() });
    } else linkedExisting++;
    const { error: triageError } = await admin.from('signal_triages').upsert({
      signal_id: signalId, profile_id: ctx.profileId, relevant: true,
      relevance_score: Math.min(100, Math.round(score * 10)), relevance_reason: JSON.stringify(stored),
    }, { onConflict: 'signal_id,profile_id' });
    if (!triageError) { linked.add(signalId!); signalIds.push(signalId!); }
  }
  return {
    planVersion: plan.version, contextVersion: ctx.version, startedAt, finishedAt: new Date().toISOString(),
    sources: results.sort((a, b) => a.id.localeCompare(b.id)), gaps: plan.gaps,
    fetched: items.length, uniqueEvents: canon.length, keywordMatched, connected: connected.length, notConnected: canon.length - connected.length, checked, signalIds,
    inserted, linkedExisting, alreadyLinked, capped: Math.max(0, connected.length - chosen.length),
  };
}
