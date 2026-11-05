/**
 * Verified coverage: the actual sources that apply to one company (its own pages, competitors' newsrooms, suppliers,
 * government and regulator pages), stored in company_sources with why each matters, what claims it can support, its
 * jurisdiction and its collection status.
 *
 *   proposed  found by research or named by the founder, not yet opened by us
 *   verified  we opened it ourselves (HTTPS, public host) and it returned content
 *   failed    our last attempt failed; retried with backoff, never silently dropped
 *   retired   the founder removed it
 *
 * "Verified" means the source exists and was retrieved — not that every claim on it is true. A news-search result is
 * a lead to an original source, not a verified source.
 */
import { createHash } from 'node:crypto';
import { safeFetch, pageText, feedLink } from './safe-fetch';
import { parseRss, type FeedItem } from './ingest';
import type { ProposedSource } from './research';

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface SourceRow {
  id: string; profile_id: string; url: string; final_url: string | null; title: string | null; kind: string;
  why: string | null; claims: string | null; jurisdiction: string | null; collection_method: 'rss' | 'page' | 'search';
  feed_url: string | null; status: 'proposed' | 'verified' | 'failed' | 'retired';
  last_checked_at: string | null; last_ok_at: string | null; last_error: string | null; consecutive_failures: number;
  content_hash: string | null; last_changed_at: string | null;
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);

/** Save research-proposed sources as "proposed" (existing rows keep their status). */
export async function saveProposedSources(db: Db, profileId: string, sources: ProposedSource[], runId: string | null): Promise<number> {
  if (!sources.length) return 0;
  const rows = sources.map((s) => ({ profile_id: profileId, url: s.url, title: s.title, kind: s.kind, why: s.why, claims: s.claims, jurisdiction: s.jurisdiction, discovered_by: 'research', research_run_id: runId }));
  const { error } = await db.from('company_sources').upsert(rows, { onConflict: 'profile_id,url', ignoreDuplicates: true });
  if (error) throw new Error(`Could not save sources: ${error.message}`);
  return rows.length;
}

/**
 * An advertised feed is used only when it plausibly follows the page itself: same site, and not a site-wide change,
 * edit or comments log (Wikipedia's RecentChanges feed, /comments/feed). Otherwise the page itself is watched.
 * Found in the isolated run: a company's Wikipedia page advertised the site-wide edit log, 20 unrelated items a run.
 */
export function usableFeed(feedUrl: string | null, pageUrl: string): string | null {
  if (!feedUrl) return null;
  try {
    const f = new URL(feedUrl), p = new URL(pageUrl);
    const site = (h: string) => h.replace(/^www\./, '');
    if (site(f.hostname) !== site(p.hostname)) return null;
    if (/special:|recentchanges|action=history|\/comments\/feed|[?&]feed=comments/i.test(decodeURIComponent(f.pathname + f.search))) return null;
    return feedUrl;
  } catch { return null; }
}

/** Open a source ourselves: record final URL, title, feed (if advertised and usable) and a content fingerprint. */
export async function verifySource(url: string, fetchImpl?: typeof fetch) {
  const page = await safeFetch(url, { fetchImpl });
  if (!page.ok) return { ok: false as const, error: page.error ?? `HTTP ${page.status}`, finalUrl: page.finalUrl };
  const isFeed = /xml|rss|atom/i.test(page.contentType) || /^\s*<\?xml|<rss\b|<feed\b/i.test(page.text.slice(0, 500));
  if (isFeed) {
    const items = parseRss(page.text, 30);
    const channel = page.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim().slice(0, 200) ?? null;
    return { ok: true as const, finalUrl: page.finalUrl, title: channel, feedUrl: page.finalUrl, method: 'rss' as const, hash: hash(items.map((i) => i.url).join('\n')), text: '' };
  }
  const { title, text } = pageText(page.text);
  if (text.length < 80) return { ok: false as const, error: 'Page had no readable text (it may need a browser)', finalUrl: page.finalUrl };
  const feed = usableFeed(feedLink(page.text, page.finalUrl), page.finalUrl);
  return { ok: true as const, finalUrl: page.finalUrl, title, feedUrl: feed, method: feed ? 'rss' as const : 'page' as const, hash: hash(text.slice(0, 20000)), text: text.slice(0, 20000) };
}

/** Verify every proposed or failed source that is due (failures back off: 1h, 6h, 24h, then daily). */
export async function verifyDueSources(db: Db, profileId: string, opts: { fetchImpl?: typeof fetch; limit?: number; now?: number } = {}) {
  const now = opts.now ?? Date.now();
  const { data } = await db.from('company_sources').select('*').eq('profile_id', profileId).in('status', ['proposed', 'failed']).limit(50);
  const due = ((data ?? []) as SourceRow[]).filter((s) => {
    if (s.status === 'proposed' || !s.last_checked_at) return true;
    const wait = [1, 6, 24][Math.min(s.consecutive_failures, 3) - 1] ?? 24;
    return now - Date.parse(s.last_checked_at) >= wait * 3_600_000;
  }).slice(0, opts.limit ?? 10);
  let verified = 0, failed = 0;
  await Promise.all(due.map(async (s) => {
    const r = await verifySource(s.url, opts.fetchImpl);
    const at = new Date(now).toISOString();
    const patch = r.ok
      ? { status: 'verified', final_url: r.finalUrl, title: r.title || s.title, feed_url: r.feedUrl, collection_method: r.method, content_hash: r.hash, last_checked_at: at, last_ok_at: at, last_error: null, consecutive_failures: 0, updated_at: at }
      : { status: 'failed', last_checked_at: at, last_error: r.error, consecutive_failures: s.consecutive_failures + 1, updated_at: at };
    await db.from('company_sources').update(patch).eq('id', s.id).eq('profile_id', profileId);
    if (r.ok) verified++; else failed++;
  }));
  return { checked: due.length, verified, failed };
}

export interface CollectedItem extends FeedItem { sourceId: string; sourceKind: string; evidenceLevel: 'original-feed' | 'original-page-change' }

/**
 * Collect from verified sources: new feed entries, or a changed page. Items carry the source's original URL, so a
 * selected signal can be traced to the source itself rather than to an aggregator.
 */
export async function collectVerifiedSources(db: Db, profileId: string, opts: { fetchImpl?: typeof fetch; limit?: number; now?: number } = {}) {
  const now = new Date(opts.now ?? Date.now()).toISOString();
  const { data } = await db.from('company_sources').select('*').eq('profile_id', profileId).eq('status', 'verified').order('last_checked_at', { ascending: true, nullsFirst: true }).limit(opts.limit ?? 12);
  const items: CollectedItem[] = [];
  const report: { id: string; url: string; ok: boolean; items: number; changed: boolean; error?: string }[] = [];
  await Promise.all(((data ?? []) as SourceRow[]).map(async (s) => {
    // Sources stored before usableFeed() existed are held to the same rule at collection time.
    const feedUrl = s.collection_method === 'rss' && s.feed_url && (s.feed_url === (s.final_url ?? s.url) || usableFeed(s.feed_url, s.final_url ?? s.url)) ? s.feed_url : null;
    const target = feedUrl ?? s.final_url ?? s.url;
    const page = await safeFetch(target, { fetchImpl: opts.fetchImpl });
    if (!page.ok) {
      report.push({ id: s.id, url: target, ok: false, items: 0, changed: false, error: page.error });
      await db.from('company_sources').update({ last_checked_at: now, last_error: page.error ?? 'failed', consecutive_failures: s.consecutive_failures + 1, ...(s.consecutive_failures + 1 >= 3 ? { status: 'failed' } : {}), updated_at: now }).eq('id', s.id).eq('profile_id', profileId);
      return;
    }
    let found: CollectedItem[] = [], fingerprint: string, changed = false;
    if (feedUrl) {
      const entries = parseRss(page.text, 20);
      fingerprint = hash(entries.map((e) => e.url).join('\n'));
      changed = fingerprint !== s.content_hash;
      // First collection only records the baseline; later runs return entries newer than the last success.
      const since = s.last_ok_at ? Date.parse(s.last_ok_at) - 86_400_000 : null;
      found = (since === null ? [] : entries.filter((e) => !e.published_at || Date.parse(e.published_at) >= since))
        .map((e) => ({ ...e, sourceId: s.id, sourceKind: s.kind, evidenceLevel: 'original-feed' as const, publisher: e.publisher ?? s.title }));
    } else {
      const { title, text } = pageText(page.text);
      fingerprint = hash(text.slice(0, 20000));
      changed = Boolean(s.content_hash) && fingerprint !== s.content_hash;
      if (changed) found = [{ title: `${title || s.title || s.url} — page updated`, url: page.finalUrl, published_at: now, content: text.slice(0, 800), publisher: s.title, sourceId: s.id, sourceKind: s.kind, evidenceLevel: 'original-page-change' }];
    }
    items.push(...found);
    report.push({ id: s.id, url: target, ok: true, items: found.length, changed });
    await db.from('company_sources').update({ last_checked_at: now, last_ok_at: now, last_error: null, consecutive_failures: 0, content_hash: fingerprint, ...(changed ? { last_changed_at: now } : {}), updated_at: now }).eq('id', s.id).eq('profile_id', profileId);
  }));
  return { items, report };
}
