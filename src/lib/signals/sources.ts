import type { SignalCategory } from "./icp";

/**
 * The curated source list. Every feed here was chosen for one of the five
 * categories and reachability-tested before being added.
 *
 * `category` records why the source is on the list. It is a provenance hint,
 * not the signal's category — the gate decides that per-article, and a Cost
 * Base feed regularly produces a Compliance signal.
 */
export interface SourceFeed {
  name: string;
  url: string;
  category: SignalCategory;
  /** Per-feed item cap. Higher for feeds where volume is the point. */
  maxItems?: number;
}

// ─── COST BASE — AI providers, cloud, infra pricing and status ───────────────
const COST_BASE_FEEDS: SourceFeed[] = [
  { name: "OpenAI Blog",         url: "https://openai.com/blog/rss.xml",                                    category: "cost_base" },
  { name: "Google DeepMind",     url: "https://deepmind.google/blog/rss.xml",                               category: "cost_base" },
  { name: "AWS What's New",      url: "https://aws.amazon.com/about-aws/whats-new/recent/feed/",            category: "cost_base", maxItems: 8 },
  { name: "AWS News Blog",       url: "https://aws.amazon.com/blogs/aws/feed/",                             category: "cost_base" },
  { name: "Azure Updates",       url: "https://www.microsoft.com/releasecommunications/api/v2/azure/rss",   category: "cost_base", maxItems: 8 },
  { name: "Google Cloud Blog",   url: "https://cloudblog.withgoogle.com/rss/",                              category: "cost_base" },
  { name: "Vercel Changelog",    url: "https://vercel.com/atom",                                            category: "cost_base" },
  { name: "Cloudflare Blog",     url: "https://blog.cloudflare.com/rss/",                                   category: "cost_base" },
  { name: "Stripe Blog",         url: "https://stripe.com/blog/feed.rss",                                   category: "cost_base" },
  { name: "AWS Status",          url: "https://status.aws.amazon.com/rss/all.rss",                          category: "cost_base" },
  { name: "Google Cloud Status", url: "https://status.cloud.google.com/en/feed.atom",                       category: "cost_base" },
  { name: "Anthropic Status",    url: "https://status.anthropic.com/history.rss",                           category: "cost_base" },
  { name: "OpenAI Status",       url: "https://status.openai.com/history.rss",                              category: "cost_base" },
  { name: "Stripe Status",       url: "https://www.stripestatus.com/history.rss",                           category: "cost_base" },
];

// ─── COMPLIANCE — regulators and standards bodies, primary sources only ──────
const COMPLIANCE_FEEDS: SourceFeed[] = [
  { name: "EU AI Act",           url: "https://artificialintelligenceact.eu/feed/",                         category: "compliance" },
  { name: "EC Digital Strategy", url: "https://digital-strategy.ec.europa.eu/en/rss.xml",                   category: "compliance" },
  { name: "FTC Press",           url: "https://www.ftc.gov/feeds/press-release.xml",                        category: "compliance" },
  { name: "SEC Press",           url: "https://www.sec.gov/news/pressreleases.rss",                         category: "compliance" },
  { name: "CISA Advisories",     url: "https://www.cisa.gov/cybersecurity-advisories/all.xml",              category: "compliance", maxItems: 8 },
  { name: "NIST News",           url: "https://www.nist.gov/news-events/news/rss.xml",                      category: "compliance" },
  { name: "UK NCSC",             url: "https://www.ncsc.gov.uk/api/1/services/v1/news-rss-feed.xml",        category: "compliance" },
  { name: "UK DSIT",             url: "https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=department-for-science-innovation-and-technology", category: "compliance" },
];

// ─── CAPITAL — funding climate, SaaS multiples, M&A ──────────────────────────
const CAPITAL_FEEDS: SourceFeed[] = [
  { name: "TechCrunch Venture",  url: "https://techcrunch.com/category/venture/feed/",                      category: "capital", maxItems: 8 },
  { name: "Crunchbase News",     url: "https://news.crunchbase.com/feed/",                                  category: "capital" },
  { name: "Sifted",              url: "https://sifted.eu/feed",                                             category: "capital" },
  { name: "Tech.eu",             url: "https://tech.eu/feed/",                                              category: "capital" },
  { name: "SaaStr",              url: "https://www.saastr.com/feed/",                                       category: "capital" },
  { name: "Tomasz Tunguz",       url: "https://tomtunguz.com/index.xml",                                    category: "capital" },
  { name: "ChartMogul",          url: "https://chartmogul.com/blog/feed/",                                  category: "capital" },
];

// ─── COMPETITION — competitor launches ───────────────────────────────────────
// Product Hunt is the only general feed here. Everything else in this category
// is generated per-profile from the competitor names the founder entered at
// onboarding (see buildCompetitorQuery). General tech-interest feeds were
// deliberately excluded — they reintroduce the breadth this rewrite removes.
const COMPETITION_FEEDS: SourceFeed[] = [
  { name: "Product Hunt",        url: "https://www.producthunt.com/feed",                                   category: "competition", maxItems: 10 },
];

/** Every static feed, in one list. */
export const CURATED_FEEDS: SourceFeed[] = [
  ...COST_BASE_FEEDS,
  ...COMPLIANCE_FEEDS,
  ...CAPITAL_FEEDS,
  ...COMPETITION_FEEDS,
];

// ─── Targeted Google News queries ────────────────────────────────────────────

/** Wrap a raw search string into a Google News RSS URL. */
export function buildGoogleNewsRssUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

/**
 * AI provider pricing. No provider publishes a pricing changelog feed, so this
 * query stands in for one. Bounded to named providers, pricing verbs, and 7d.
 */
export const AI_PRICING_QUERY = `("OpenAI" OR "Anthropic" OR "Google Cloud") ("API pricing" OR "price cut" OR "price increase" OR "per million tokens") when:7d`;

/**
 * PRICING — what the reader can charge, or what the market will bear.
 *
 * No feed covers B2B SaaS pricing practice directly, and keyword queries on
 * "price increase" pull consumer retail noise (Tesla, groceries). Anchoring on
 * pricing-MODEL vocabulary instead keeps it inside software.
 */
export const SAAS_PRICING_QUERY = `("usage-based pricing" OR "per-seat pricing" OR "seat-based pricing" OR "outcome-based pricing") (SaaS OR software) when:14d`;

/**
 * One query per competitor the founder named at onboarding.
 *
 * Deliberately undisambiguated: adding (software OR SaaS OR startup) makes
 * Google News OR-expand and drown the quoted name. Common-word competitor
 * names will leak some unrelated results; the category gate discards them.
 */
export const MIN_COMPETITOR_NAME_LENGTH = 2;
export const MAX_COMPETITOR_QUERIES = 3;

export function buildCompetitorQuery(name: string): string {
  return `"${name}" (launch OR pricing OR funding OR acquired OR "shuts down") when:7d`;
}

/** Google News feeds for a profile: the pricing query plus up to 3 competitors. */
export function buildQueryFeeds(competitors: string[]): SourceFeed[] {
  const feeds: SourceFeed[] = [
    {
      name: "AI provider pricing",
      url: buildGoogleNewsRssUrl(AI_PRICING_QUERY),
      category: "cost_base",
      maxItems: 8,
    },
    {
      name: "SaaS pricing models",
      url: buildGoogleNewsRssUrl(SAAS_PRICING_QUERY),
      category: "pricing",
      maxItems: 8,
    },
  ];

  // Filter BEFORE taking the top 3, so corrupted entries cannot crowd out real
  // ones. A one-character "name" is never a real competitor — it is a string
  // that was stored character-by-character, and querying "P" returns pure
  // noise. Guarding here because this is the single choke point for the query.
  const usable = competitors
    .map((name) => name.trim())
    .filter((name) => name.length >= MIN_COMPETITOR_NAME_LENGTH);

  for (const trimmed of usable.slice(0, MAX_COMPETITOR_QUERIES)) {
    feeds.push({
      name: `Competitor: ${trimmed}`,
      url: buildGoogleNewsRssUrl(buildCompetitorQuery(trimmed)),
      category: "competition",
      maxItems: 6,
    });
  }

  return feeds;
}
