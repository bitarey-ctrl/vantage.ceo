/**
 * Verified coverage: the actual sources that apply to one company (its own pages, competitors' newsrooms, suppliers,
 * government and regulator pages), stored in company_sources with why each matters, what claims it can support, its
 * jurisdiction and its collection status.
 *
 *   proposed  a discovery candidate: found by research or named by the founder; not monitored. Candidates that were
 *             opened but did not pass the eligibility checks keep last_error "Not monitored: …" and are rechecked weekly.
 *   verified  an eligible monitoring source: we opened it ourselves (HTTPS, public host) and it passed eligibility —
 *             identity, relevance, claim authority, access method, cadence and the per-account monitoring budget
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
import type { CompanyContext } from './context';
import { connectionFor } from './relevance';

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
    return { ok: true as const, finalUrl: page.finalUrl, title: channel, feedUrl: page.finalUrl, method: 'rss' as const, hash: hash(items.map((i) => i.url).join('\n')), text: '', feedItems: items };
  }
  const { title, text } = pageText(page.text);
  if (text.length < 80) return { ok: false as const, error: 'Page had no readable text (it may need a browser)', finalUrl: page.finalUrl };
  const feed = usableFeed(feedLink(page.text, page.finalUrl), page.finalUrl);
  // An advertised feed is read once here so eligibility can judge what the source actually publishes.
  const feedItems = feed ? await safeFetch(feed, { fetchImpl }).then((f) => (f.ok ? parseRss(f.text, 20) : undefined)).catch(() => undefined) : undefined;
  return { ok: true as const, finalUrl: page.finalUrl, title, feedUrl: feed, method: feed ? 'rss' as const : 'page' as const, hash: hash(text.slice(0, 20000)), text: text.slice(0, 20000), feedItems };
}


/** Per-account monitoring budget: sources collected every run, and items per source sent to paid assessment. */
export const MONITOR_LIMIT = 10;
export const ITEMS_PER_SOURCE = 5;
const NOT_MONITORED = 'Not monitored: ';
const TERTIARY = /(^|\.)(wikipedia|wikimedia|wikidata|fandom|reddit|quora)\.(org|com)$/i;
const GOVERNMENT = /(\.gov(\.[a-z]{2})?|\.gouv\.[a-z]{2}|\.gob\.[a-z]{2}|\.go\.[a-z]{2}|\.gc\.ca|europa\.eu|\.admin\.ch|\.bund\.de)$/i;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const nameTokens = (n: string | null | undefined) => (n ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !['news', 'blog', 'home', 'page', 'press', 'official', 'site', 'feed', 'latest'].includes(w));

/**
 * Should this discovered public source be monitored for this company? No founder approval is needed for public
 * sources; these automatic checks decide. Every failed check is returned as a plain reason.
 */
export function sourceEligibility(
  source: { url: string; final_url?: string | null; kind: string; title?: string | null },
  fetched: { pageTitle?: string | null; text?: string; feedItems?: { title: string; content?: string; published_at?: string | null }[] },
  ctx: CompanyContext,
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const h = host(source.final_url ?? source.url);
  const pageTitle = (fetched.pageTitle ?? '').toLowerCase();
  // Claim authority: user-edited or tertiary pages are fine as research leads, not as sources of new developments.
  if (TERTIARY.test(h)) reasons.push('user-edited or tertiary source (useful for research, not for monitoring)');
  // Identity: the source is what research said it is.
  if (source.kind === 'company') {
    const site = ctx.website ? host(`https://${ctx.website.replace(/^https?:\/\//, '')}`) : '';
    const named = ctx.companyName && pageTitle.includes(ctx.companyName.toLowerCase());
    if (!(site && (h === site || h.endsWith(`.${site}`))) && !named) reasons.push("not your company's own site");
  } else if (source.kind === 'government' || source.kind === 'regulator') {
    if (!GOVERNMENT.test(h)) reasons.push('not an official government or regulator domain');
  } else if (source.kind === 'competitor' || source.kind === 'supplier' || source.kind === 'customer') {
    const tokens = nameTokens(source.title);
    if (tokens.length && !tokens.some((t) => h.includes(t) || pageTitle.includes(t))) reasons.push(`the page does not identify itself as ${source.title}`);
  }
  // Relevance and cadence: what it publishes has to touch this business.
  if (fetched.feedItems) {
    const items = fetched.feedItems.slice(0, 20);
    const related = items.filter((i) => connectionFor({ title: i.title, content: i.content ?? '' }, ctx).candidate).length;
    const dated = items.map((i) => Date.parse(i.published_at ?? '')).filter((t) => Number.isFinite(t));
    const spanDays = dated.length >= 2 ? Math.max(1, (Math.max(...dated) - Math.min(...dated)) / 86_400_000) : 7;
    const perWeek = dated.length ? (dated.length / spanDays) * 7 : 0;
    const ownOrOfficial = source.kind === 'company' || source.kind === 'competitor' || source.kind === 'government' || source.kind === 'regulator';
    if (items.length && !ownOrOfficial && related === 0) reasons.push('none of its recent items mention your company, competitors, products or dependencies');
    if (perWeek > 35 && related / Math.max(1, items.length) < 0.2) reasons.push(`high-volume feed (about ${Math.round(perWeek)} items a week) that is mostly unrelated to you`);
  } else if (fetched.text !== undefined) {
    const ownOrOfficial = source.kind === 'company' || source.kind === 'government' || source.kind === 'regulator';
    if (!ownOrOfficial && !connectionFor({ title: fetched.pageTitle ?? '', content: fetched.text.slice(0, 6000) }, ctx).candidate) reasons.push('the page does not mention your company, competitors, products or dependencies');
  }
  return { eligible: reasons.length === 0, reasons };
}

/** Verify every proposed or failed source that is due (failures back off: 1h, 6h, 24h, then daily). */
export async function verifyDueSources(db: Db, profileId: string, opts: { fetchImpl?: typeof fetch; limit?: number; now?: number; ctx?: CompanyContext } = {}) {
  const now = opts.now ?? Date.now();
  const { data } = await db.from('company_sources').select('*').eq('profile_id', profileId).in('status', ['proposed', 'failed']).limit(50);
  const { data: monitoredRows } = await db.from('company_sources').select('id').eq('profile_id', profileId).eq('status', 'verified');
  let monitored = (monitoredRows ?? []).length;
  const due = ((data ?? []) as SourceRow[]).filter((s) => {
    // An opened candidate that did not qualify is rechecked weekly, not every run.
    if (s.status === 'proposed' && s.last_error?.startsWith(NOT_MONITORED) && s.last_checked_at) return now - Date.parse(s.last_checked_at) >= 7 * 86_400_000;
    if (s.status === 'proposed' || !s.last_checked_at) return true;
    const wait = [1, 6, 24][Math.min(s.consecutive_failures, 3) - 1] ?? 24;
    return now - Date.parse(s.last_checked_at) >= wait * 3_600_000;
  }).slice(0, opts.limit ?? 10);
  let verified = 0, failed = 0;
  await Promise.all(due.map(async (s) => {
    const r = await verifySource(s.url, opts.fetchImpl);
    const at = new Date(now).toISOString();
    let notMonitored: string | null = null;
    if (r.ok && opts.ctx) {
      const e = sourceEligibility({ ...s, final_url: r.finalUrl }, { pageTitle: r.title, text: r.method === 'page' ? r.text : undefined, feedItems: r.feedItems }, opts.ctx);
      if (!e.eligible) notMonitored = e.reasons.join('; ');
      else if (monitored >= MONITOR_LIMIT) notMonitored = `monitoring limit of ${MONITOR_LIMIT} sources reached`;
      else monitored++;
    }
    const patch = r.ok && notMonitored
      ? { status: 'proposed', final_url: r.finalUrl, title: r.title || s.title, feed_url: r.feedUrl, collection_method: r.method, last_checked_at: at, last_error: (NOT_MONITORED + notMonitored).slice(0, 300), consecutive_failures: 0, updated_at: at }
      : r.ok
      ? { status: 'verified', final_url: r.finalUrl, title: r.title || s.title, feed_url: r.feedUrl, collection_method: r.method, content_hash: r.hash, last_checked_at: at, last_ok_at: at, last_error: null, consecutive_failures: 0, updated_at: at }
      : { status: 'failed', last_checked_at: at, last_error: r.error, consecutive_failures: s.consecutive_failures + 1, updated_at: at };
    await db.from('company_sources').update(patch).eq('id', s.id).eq('profile_id', profileId);
    if (r.ok && !notMonitored) verified++; else if (!r.ok) failed++;
  }));
  return { checked: due.length, verified, failed };
}

export interface CollectedItem extends FeedItem { sourceId: string; sourceKind: string; evidenceLevel: 'original-feed' | 'original-page-change' }

/**
 * Collect from verified sources: new feed entries, or a changed page. Items carry the source's original URL, so a
 * selected signal can be traced to the source itself rather than to an aggregator.
 */
export async function collectVerifiedSources(db: Db, profileId: string, opts: { fetchImpl?: typeof fetch; limit?: number; now?: number; ctx?: CompanyContext } = {}) {
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
    // Sources monitored before eligibility existed are held to it too; one that fails goes back to being a candidate.
    if (opts.ctx) {
      const pt = feedUrl ? null : pageText(page.text);
      const e = sourceEligibility(s, feedUrl ? { pageTitle: s.title, feedItems: parseRss(page.text, 20) } : { pageTitle: pt!.title, text: pt!.text }, opts.ctx);
      if (!e.eligible) {
        report.push({ id: s.id, url: target, ok: true, items: 0, changed: false, error: (NOT_MONITORED + e.reasons.join('; ')).slice(0, 160) });
        await db.from('company_sources').update({ status: 'proposed', last_checked_at: now, last_error: (NOT_MONITORED + e.reasons.join('; ')).slice(0, 300), updated_at: now }).eq('id', s.id).eq('profile_id', profileId);
        return;
      }
    }
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
    // Budget: at most ITEMS_PER_SOURCE items from one source go on to paid assessment in a run.
    found = found.slice(0, ITEMS_PER_SOURCE);
    items.push(...found);
    report.push({ id: s.id, url: target, ok: true, items: found.length, changed });
    await db.from('company_sources').update({ last_checked_at: now, last_ok_at: now, last_error: null, consecutive_failures: 0, content_hash: fingerprint, ...(changed ? { last_changed_at: now } : {}), updated_at: now }).eq('id', s.id).eq('profile_id', profileId);
  }));
  return { items, report };
}
