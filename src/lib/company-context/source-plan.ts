/**
 * A per-company source plan: what to search, where, in which language, and why — derived only from the company's
 * stated context. Versioned by the context version, so a corrected profile produces a new plan.
 *
 * Phase 1 uses Google News search feeds (public RSS, no key) as the collection method. Each entry records its exact
 * address, publisher, reason, coverage and limitations. Results are leads, not verified facts; the per-company
 * relevance check (relevance.ts) still decides whether anything is shown.
 */
import type { CompanyContext } from './context';
import { exposureTerms } from './relevance';

export interface PlannedSource {
  id: string;
  label: string;
  query: string;
  url: string;
  language: string;
  publisher: string;
  reason: string;
  coverage: string;
  limitations: string;
  method: 'rss';
  cadence: 'daily';
}
export interface SourcePlan { version: string; contextVersion: string; sources: PlannedSource[]; gaps: string[] }

const LANG: Record<string, { hl: string; gl: string; lang: string }> = {
  turkey: { hl: 'tr', gl: 'TR', lang: 'tr' }, germany: { hl: 'de', gl: 'DE', lang: 'de' }, france: { hl: 'fr', gl: 'FR', lang: 'fr' },
  netherlands: { hl: 'nl', gl: 'NL', lang: 'nl' }, italy: { hl: 'it', gl: 'IT', lang: 'it' }, spain: { hl: 'es', gl: 'ES', lang: 'es' }, poland: { hl: 'pl', gl: 'PL', lang: 'pl' },
};
const TRADE_WORDS = /\b(export|import|manufactur|supplier|wholesale|marketplace|cross-border|customs|logistic|freight|sourcing|factory|retailer)/i;
/** Goal words too broad to search on ("growth" news about anything). */
const GENERIC_GOALS = new Set(['growth', 'margin', 'revenue', 'profit', 'other']);
const LIMITS = 'Google News search results: headlines from publishers Google indexes, last 30 days. Not a complete record; repeated coverage is not independent confirmation; publisher text is a claim, not a verified fact.';

export function newsSearchUrl(query: string, locale = { hl: 'en-US', gl: 'US', lang: 'en' }): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:30d`)}&hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.gl}:${locale.lang}`;
}
const quote = (s: string) => `"${s.replace(/"/g, '')}"`;

export function buildSourcePlan(c: CompanyContext): SourcePlan {
  const t = exposureTerms(c);
  const sources: PlannedSource[] = [];
  const gaps: string[] = [];
  const add = (id: string, label: string, query: string, reason: string, coverage: string, locale?: { hl: string; gl: string; lang: string }) => {
    if (sources.some((s) => s.query === query && s.language === (locale?.lang ?? 'en'))) return;
    sources.push({ id, label, query, url: newsSearchUrl(query, locale), language: locale?.lang ?? 'en', publisher: 'Google News (search aggregator)', reason, coverage, limitations: LIMITS, method: 'rss', cadence: 'daily' });
  };
  const markets = c.geography.slice(0, 3);
  const marketClause = markets.length ? ` (${markets.map(quote).join(' OR ')})` : '';

  if (c.companyName) {
    const identity = [quote(c.companyName), ...(c.website ? [quote(c.website)] : [])].join(' OR ');
    add('company', `News about ${c.companyName}`, identity, 'Direct mentions of your company.', 'English-language news.');
    for (const m of markets) { const loc = LANG[m.toLowerCase()]; if (loc) add(`company-${loc.lang}`, `${c.companyName} in ${m} press`, identity, `Your company in local ${m} reporting.`, `${m} news in its main language.`, loc); }
  } else gaps.push('Company name is missing, so company mentions cannot be searched.');

  // One-word competitor names are ambiguous; pair them with your own business terms.
  const context = [...t.productWords, ...t.buyerWords].filter((w) => !/^(order|online)$/.test(w)).slice(0, 4);
  for (const name of t.competitors.slice(0, 4)) {
    const q = name.includes(' ') || !context.length ? quote(name) : `${quote(name)} (${context.join(' OR ')})`;
    add(`competitor-${name.toLowerCase().replace(/\W+/g, '-')}`, `Competitor: ${name}`, q, `${name} is a competitor you named.`, 'English-language news.');
  }
  if (!t.competitors.length) gaps.push('No competitors are recorded, so competitor moves are not monitored.');

  const topics = t.productPhrases.slice(0, 2);
  for (const p of topics) add(`topic-${p.replace(/\W+/g, '-')}`, `Your market: ${p}`, `${quote(p)}${marketClause}`, `"${p}" is part of what you told us you sell.`, markets.length ? `News mentioning ${markets.join(', ')}.` : 'Any geography.');
  if (!topics.length && c.product) add('topic-product', 'Your market', `${t.productWords.slice(0, 3).join(' ')}${marketClause}`, 'Built from your product description.', 'Broad match.');
  if (!c.product) gaps.push('Your product description is missing, so market searches cannot be targeted.');

  // A product phrase plus a priority term targets the work you said matters now (e.g. "strategic intelligence" CEOs).
  const priorityWord = t.priorityWords.find((w) => w.length >= 3 && !GENERIC_GOALS.has(w));
  for (const p of t.priorityPhrases.slice(0, 2)) add(`priority-${p.replace(/\W+/g, '-')}`, `Your priority: ${p}`, `${quote(p)}${marketClause}`, `"${p}" comes from a priority you stated.`, markets.length ? `News mentioning ${markets.join(', ')}.` : 'Any geography.');
  if (!t.priorityPhrases.length && topics[0] && priorityWord) add('topic-priority', `Your priority: ${topics[0]}`, `${quote(topics[0])} ${priorityWord}`, 'Combines what you sell with your stated priority.', 'Any geography.');
  if (c.buyers && t.buyerWords.length) add('buyers', `Your buyers: ${c.buyers.slice(0, 60)}`, `${t.buyerWords.slice(0, 3).join(' ')}${marketClause}`, 'Changes affecting the buyers you named.', 'Broad match on buyer terms.');

  const tradeText = `${c.product ?? ''} ${c.buyers ?? ''} ${c.notes ?? ''} ${c.revenueModel ?? ''}`;
  if (markets.length >= 2 && TRADE_WORDS.test(tradeText)) {
    const goods = t.productWords.filter((w) => !/marketplace|platform|online|order/.test(w)).slice(0, 2).join(' ');
    add('trade-rules', `Trade rules: ${markets.join(' ↔ ')}`, `(tariff OR customs OR "import duty" OR "trade agreement" OR regulation) ${markets.map(quote).join(' ')}${goods ? ` ${goods}` : ''}`,
      `You trade across ${markets.join(' and ')}; customs, tariff and trade-rule changes can change your costs or buyers' demand.`, 'News, official announcements reported by news outlets.');
  }
  // Rules and regulators for what you sell, in your markets. Built from your own words, for any kind of business.
  const ruleTopic = topics[0] ?? t.productWords.slice(0, 2).join(' ');
  if (ruleTopic) add('rules', `Rules for ${ruleTopic}`, `(regulation OR regulator OR rules OR law OR licence OR license) ${topics[0] ? quote(ruleTopic) : ruleTopic}${marketClause}`,
    'New rules, enforcement or regulator moves touching what you sell.', markets.length ? `News mentioning ${markets.join(', ')}.` : 'Any geography.');
  const contextVersion = c.version;
  const version = `${contextVersion}:${sources.map((s) => s.id).join(',')}`.slice(0, 200);
  return { version, contextVersion, sources: sources.slice(0, 10), gaps };
}
