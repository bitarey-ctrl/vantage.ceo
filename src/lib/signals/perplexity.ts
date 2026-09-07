import type { CeoContext } from "@/types/database";

/**
 * NewsAPI candidate fetching.
 *
 * This module used to run its own four-lens Claude filter before returning.
 * That second filter is gone — all filtering now happens once, in the gate
 * (see ./gate.ts). This file only fetches raw candidates.
 *
 * The file name is historical; the source is NewsAPI, not Perplexity.
 */

interface FetchedSignal {
  title: string;
  content: string;
  url: string | null;
  published_at: string;
  feed_name: string;
}

interface NewsApiArticle {
  title: string;
  description: string | null;
  content: string | null;
  url: string;
  publishedAt: string;
  source: { name: string };
}

/**
 * Queries scoped to the five categories, not to sector or geography.
 *
 * The old query was `${sector} ${geography} startup funding technology
 * business` — unbounded, and the main reason NewsAPI flooded the candidate
 * pool with generic business news.
 */
const CATEGORY_QUERIES: { label: string; query: string }[] = [
  {
    label: "competition",
    query: '"B2B SaaS" AND (launch OR acquired OR "shuts down" OR pricing)',
  },
  {
    label: "capital",
    query: '("seed round" OR "Series A" OR "Series B") AND (SaaS OR "software startup")',
  },
  {
    label: "compliance",
    query: '("EU AI Act" OR GDPR OR "SOC 2" OR "data protection") AND (software OR SaaS)',
  },
];

async function fetchNewsApiQuery(
  query: string,
  apiKey: string,
  fromDate: string
): Promise<NewsApiArticle[]> {
  try {
    const res = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${fromDate}&sortBy=publishedAt&language=en&pageSize=15&apiKey=${apiKey}`,
      { headers: { "User-Agent": "VANTAGE/1.0" } }
    );
    if (!res.ok) {
      console.error(`[news] NewsAPI error: ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { articles?: NewsApiArticle[]; status: string };
    if (data.status !== "ok") return [];
    return data.articles ?? [];
  } catch (err) {
    console.error("[news] Failed to fetch from NewsAPI:", err);
    return [];
  }
}

/**
 * Fetch NewsAPI candidates for the five categories.
 * Returns raw articles — the gate decides what survives.
 */
export async function fetchPerplexitySignals(
  _context: CeoContext,
  _companyName: string
): Promise<FetchedSignal[]> {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) return [];

  const fromDate = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    .toISOString()
    .split("T")[0];

  const results = await Promise.all(
    CATEGORY_QUERIES.map((q) =>
      fetchNewsApiQuery(q.query, apiKey, fromDate).catch(() => [])
    )
  );

  const seen = new Set<string>();
  const merged: FetchedSignal[] = [];

  // Interleave across queries so one noisy category cannot crowd out the rest.
  const maxLen = Math.max(...results.map((r) => r.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const bucket of results) {
      const a = bucket[i];
      if (!a) continue;
      // NewsAPI returns null titles (and a literal "[Removed]") for articles
      // that have been pulled. They cannot be deduped or gated, and a null
      // title crashes normalizeTitle downstream.
      const title = a.title?.trim();
      if (!title || title === "[Removed]") continue;

      const key = a.url || title;
      if (!key || seen.has(key)) continue;
      if (!a.url || !a.url.startsWith("http")) continue;
      seen.add(key);
      merged.push({
        title,
        content: a.description ?? a.content ?? title,
        url: a.url,
        published_at: a.publishedAt,
        feed_name: a.source?.name ?? "NewsAPI",
      });
    }
  }

  console.log(`[news] NewsAPI returned ${merged.length} candidates`);
  return merged;
}
