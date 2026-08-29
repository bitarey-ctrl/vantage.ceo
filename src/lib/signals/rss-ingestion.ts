import type { CeoContext } from "@/types/database";
import { CURATED_FEEDS, buildQueryFeeds, type SourceFeed } from "./sources";

interface RssSignal {
  title: string;
  content: string;
  url: string | null;
  published_at: string;
  feed_name: string;
}

/** Default per-feed cap. Overridden per source in sources.ts. */
const DEFAULT_MAX_ITEMS = 5;

/** Only the last 7 days are candidates. Older items are stale by definition. */
const MAX_AGE_DAYS = 7;

/**
 * Fetch candidate articles from the curated source list.
 *
 * Sources are fixed for the ICP — there is no per-sector feed routing any
 * more. The only per-profile element is the competitor queries, built from
 * the names the founder entered at onboarding.
 */
export async function fetchRssSignals(
  context: CeoContext
): Promise<RssSignal[]> {
  const feeds = getFeedsForContext(context);

  const results = await Promise.allSettled(
    feeds.map((feed) =>
      fetchRssFeed(feed.url, feed.maxItems ?? DEFAULT_MAX_ITEMS, feed.name).catch(
        (err) => {
          console.warn(`[RSS] Failed to fetch ${feed.name} (${feed.url}):`, err);
          return [] as RssSignal[];
        }
      )
    )
  );

  const allSignals: RssSignal[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") allSignals.push(...result.value);
  }

  // Dedupe by URL (falling back to title), drop anything outside the candidate
  // window, then sort by recency.
  //
  // The window is bounded at BOTH ends. Some feeds publish items dated weeks
  // into the future (scheduled posts, bad timezone handling); an older-than
  // check alone lets those through and they never age out.
  const now = Date.now();
  const oldest = now - MAX_AGE_DAYS * 24 * 3600 * 1000;
  const newest = now + 24 * 3600 * 1000; // a day of clock skew
  const seen = new Set<string>();
  const deduped: RssSignal[] = [];

  for (const signal of allSignals) {
    const key = signal.url || signal.title;
    if (!key || seen.has(key)) continue;
    const published = new Date(signal.published_at).getTime();
    if (published < oldest || published > newest) continue;
    seen.add(key);
    deduped.push(signal);
  }

  return deduped.sort(
    (a, b) =>
      new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  );
}

/** The curated feeds, plus this profile's competitor queries. */
export function getFeedsForContext(context: CeoContext): SourceFeed[] {
  const competitorNames = (context?.competitors ?? [])
    .map((c) => (typeof c === "string" ? c : c?.name))
    .filter((n): n is string => Boolean(n && n.trim()));

  return [...CURATED_FEEDS, ...buildQueryFeeds(competitorNames)];
}

async function fetchRssFeed(
  url: string,
  maxItems: number,
  feedName: string
): Promise<RssSignal[]> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "VANTAGE/1.0 (Strategic Intelligence Platform)",
      Accept: "application/rss+xml, application/atom+xml, text/xml",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const text = await response.text();
  return parseRssFeed(text, feedName, maxItems);
}

// Strip HTML tags and collapse whitespace → clean text for the gate prompt.
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// Decode the common XML/HTML entities that survive tag-stripping.
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Tags AND entities — applied to both RSS <description> and Atom <summary>/<content>.
function cleanText(raw: string): string {
  return decodeEntities(stripHtml(raw));
}

// Tolerate malformed/missing dates instead of throwing on .toISOString().
function safeDate(raw: string | null): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function parseRssFeed(xmlText: string, feedName: string, maxItems: number): RssSignal[] {
  // Atom feeds (The Verge, Vercel, gov.uk) use <entry>; RSS 2.0 uses <item>.
  const isAtom =
    /<feed\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(xmlText) ||
    (/<entry[\s>]/i.test(xmlText) && !/<item[\s>]/i.test(xmlText));

  return isAtom
    ? parseAtomEntries(xmlText, feedName, maxItems)
    : parseRssItems(xmlText, feedName, maxItems);
}

function parseRssItems(xmlText: string, feedName: string, maxItems: number): RssSignal[] {
  const signals: RssSignal[] = [];

  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  const titleRegex = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;
  const descRegex =
    /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i;
  const linkRegex = /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i;
  const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/i;

  let match;
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const item = match[1];
    if (!item) continue;

    const title = cleanText(titleRegex.exec(item)?.[1]?.trim() ?? "");
    const description = cleanText(descRegex.exec(item)?.[1]?.trim() ?? "");
    const link = linkRegex.exec(item)?.[1]?.trim() || null;
    const pubDateStr = pubDateRegex.exec(item)?.[1]?.trim() ?? null;

    if (!title || title.length < 10) continue;

    signals.push({
      title,
      content: description || title,
      url: link,
      published_at: safeDate(pubDateStr),
      feed_name: feedName,
    });

    if (signals.length >= maxItems) break;
  }

  return signals;
}

function parseAtomEntries(xmlText: string, feedName: string, maxItems: number): RssSignal[] {
  const signals: RssSignal[] = [];

  const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  const titleRegex = /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;
  const summaryRegex = /<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i;
  const contentRegex = /<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i;
  const publishedRegex = /<published>([\s\S]*?)<\/published>/i;
  const updatedRegex = /<updated>([\s\S]*?)<\/updated>/i;

  let match;
  while ((match = entryRegex.exec(xmlText)) !== null) {
    const entry = match[1];
    if (!entry) continue;

    const title = cleanText(titleRegex.exec(entry)?.[1]?.trim() ?? "");
    const rawContent =
      summaryRegex.exec(entry)?.[1] ?? contentRegex.exec(entry)?.[1] ?? "";
    const content = cleanText(rawContent.trim());
    const url = extractAtomLink(entry);
    const dateStr =
      publishedRegex.exec(entry)?.[1]?.trim() ||
      updatedRegex.exec(entry)?.[1]?.trim() ||
      null;

    if (!title || title.length < 10) continue;

    signals.push({
      title,
      content: content || title,
      url,
      published_at: safeDate(dateStr),
      feed_name: feedName,
    });

    if (signals.length >= maxItems) break;
  }

  return signals;
}

// Atom <link> is an attribute, not text. Prefer rel="alternate" (the article
// page); fall back to a link with no rel; then any link with an href.
function extractAtomLink(entry: string): string | null {
  const links = [...entry.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1] ?? "");
  let relless: string | null = null;

  for (const attrs of links) {
    const href = /href=["']([^"']*)["']/i.exec(attrs)?.[1];
    if (!href) continue;
    const rel = /rel=["']([^"']*)["']/i.exec(attrs)?.[1];
    if (rel === "alternate") return href;
    if (relless === null && !rel) relless = href;
  }
  if (relless) return relless;

  for (const attrs of links) {
    const href = /href=["']([^"']*)["']/i.exec(attrs)?.[1];
    if (href) return href;
  }
  return null;
}
