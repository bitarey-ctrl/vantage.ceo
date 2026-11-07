/**
 * Does this signal connect to THIS company — and exactly how? Deterministic and explainable: a connection is stated
 * only when the signal's own text (title, source summary) mentions something the founder told VANTAGE about the
 * business. Model-written text about the signal (why_it_matters etc.) is never used as evidence of a connection.
 *
 *   connected  the reason names the matched company fact (competitor, product, buyers, priority, market)
 *   monitor    nothing in the signal touches the stated business; shown below connected items, never presented as
 *              relevant. Missing company details make more signals "monitor" — that is honest, not a failure.
 */
import type { CompanyContext } from './context';
import { headlineCore } from './events';

export interface Connection {
  status: 'connected' | 'monitor';
  score: number;
  text: string;
  basis: string;
  matched: { kind: 'company' | 'competitor' | 'product' | 'buyers' | 'priority' | 'market' | 'dependency'; term: string }[];
  contextVersion: string;
  /** Loose match worth sending to the check in verify.ts (company or competitor named, or a phrase of yours used). */
  candidate: boolean;
}

const STOP = new Set(('a an and are as at be by for from has have in into is it its of on or our that the their them they this to was we were will with your you comes come mainly plus via sells sell selling offers including mostly ' +
  'company companies business businesses customer customers client clients platform product products service services solution solutions software tool tools ' +
  'team teams market markets industry industries global new more most best help helps helping make makes making based small medium large mid sized size ' +
  'world online digital data via use using used one two three first year years month months want need needs other also any all each across within ' +
  'b2b b2c saas app apps sell sells selling buy buys buying offer offers way ways work works working people firms firm leading top focus focused ' +
  'the and for are was has its our who how why can may not but own per out off all any via new big low key end yet too its etc ' +
  'while when where which what whilst because through between than then there these those such very much many some each').split(/\s+/));

/** Common business words: they count as evidence only alongside a more specific term. */
const GENERIC = new Set('management account accounts fees fee transaction transactions commission subscription subscriptions sales capital group holding holdings partner partners system systems network service retail store stores brand brands growth price prices cost costs order orders'.split(' '));

/** Verbs and generic goal words: never used as a business term or search term. */
const VERBS = new Set('validate grow reach launch hire raise build improve increase reduce paying achieve expand enter win keep find get secure close sign'.split(' '));

const GEO_ALIASES: Record<string, string[]> = {
  turkey: ['turkey', 'turkiye', 'turkish', 'istanbul', 'ankara', 'izmir'],
  eu: ['european union', ' eu ', 'eu-', 'europe', 'european', 'brussels'],
  germany: ['germany', 'german', 'berlin'], france: ['france', 'french', 'paris'], netherlands: ['netherlands', 'dutch', 'amsterdam'],
  'united kingdom': ['united kingdom', ' uk ', 'britain', 'british', 'london'], uk: ['united kingdom', ' uk ', 'britain', 'british', 'london'],
  'united states': ['united states', ' us ', 'u.s.', 'american', 'america'], us: ['united states', ' us ', 'u.s.', 'american'], usa: ['united states', ' us ', 'u.s.', 'american'],
  italy: ['italy', 'italian'], spain: ['spain', 'spanish'], poland: ['poland', 'polish'], china: ['china', 'chinese'], india: ['india', 'indian'],
};

function norm(text: string): string {
  return ` ${text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[“”"'’`]/g, '').replace(/[^a-z0-9.+\-\s]/g, ' ').replace(/\s+/g, ' ')} `;
}
const ACRONYMS = new Set(['ceo', 'ceos', 'cfo', 'cfos', 'cto', 'coo', 'sme', 'smes', 'smb', 'smbs', 'vat', 'erp', 'crm']);
const MONTHS = new Set('january february march april june july august september october november december'.split(' '));
const words = (text: string) => norm(text).trim().split(' ').map((w) => w.replace(/^[.\-+]+|[.\-+]+$/g, '')).filter((w) => (w.length >= 3 || ACRONYMS.has(w)) && !STOP.has(w) && !MONTHS.has(w) && !/^\d+$/.test(w));
/** Strip a trailing "s" so "manufacturers" matches "manufacturer" and "CEOs" matches "CEO". */
const stem = (w: string) => (w.endsWith('s') && !w.endsWith('ss') && (w.length > 5 || ACRONYMS.has(w)) ? w.slice(0, -1) : w);
const has = (hay: string, needle: string) => hay.includes(needle.startsWith(' ') ? needle : ` ${needle}`);

/** Two-word phrases from words that are adjacent in the original text (a stop word or verb breaks adjacency). */
function phrases(text: string | null): string[] {
  if (!text) return [];
  const out = new Set<string>();
  // Commas, full stops and similar end a phrase: "current accounts, payments" is not "account payment".
  for (const part of text.split(/[,.;:!?()\n]+/)) {
    const raw = norm(part).trim().split(' ');
    for (let i = 0; i < raw.length - 1; i++) {
      const [a, b] = [raw[i], raw[i + 1]];
      const ok = (w: string) => w.length >= 3 && !STOP.has(w) && !VERBS.has(w) && !/^\d+$/.test(w) && !/ing$/.test(w);
      if (ok(a) && ok(b)) out.add(`${stem(a)} ${stem(b)}`);
    }
  }
  return [...out];
}

/** Upper-case abbreviations as written by the founder (e.g. a regulator or standard), kept despite being short. */
function acronymsIn(text: string): string[] {
  return [...new Set((text.match(/\b[A-Z]{2,5}\b/g) ?? []).map((a) => a.toLowerCase()))].filter((a) => !STOP.has(a));
}

function geoTerms(geography: string[]): { label: string; aliases: string[] }[] {
  return geography.map((g) => {
    const key = g.toLowerCase().trim();
    const aliases = GEO_ALIASES[key] ?? (key.length > 2 ? [key] : []);
    return { label: g, aliases };
  }).filter((g) => g.aliases.length);
}

/** Phrases whose words recur across your details first ("olive oil" over "family-run producer"); stable otherwise. */
function rankByRecurrence(list: string[], text: string): string[] {
  const counts = new Map<string, number>();
  for (const w of words(text).map(stem)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const weight = (p: string) => p.split(' ').reduce((n, w) => n + (counts.get(w) ?? 0), 0);
  return list.map((p, i) => ({ p, i, w: weight(p) })).sort((a, b) => b.w - a.w || a.i - b.i).map((x) => x.p);
}

/** Terms a company is exposed through, with where each came from. Exported for the source plan. */
export function exposureTerms(c: CompanyContext) {
  const named = (list: string[]) => list.map((n) => n.trim()).filter((n) => n.length >= 3);
  // Nationality and place words are markets, not products or buyers (they still count inside phrases).
  const geoWords = new Set(Object.values(GEO_ALIASES).flat().map((a) => a.trim()).filter((a) => !a.includes(' ')));
  // Single words come from what they sell and the sector only. How they make money ("most revenue comes from …
  // retailers") describes the model, not the product; its words matched unrelated news ("comes", "retailer").
  const productText = `${c.product ?? ''} ${c.sector ?? ''}`;
  const productWords = [...new Set([...words(productText).map(stem), ...acronymsIn(productText)])].filter((w) => !geoWords.has(w));
  const buyerWords = [...new Set(words(c.buyers ?? '').map(stem))].filter((w) => !geoWords.has(w));
  const priorityText = [c.topPriority ?? '', ...c.priorities].join('. ');
  const priorityWords = [...new Set([...words(priorityText).map(stem), ...acronymsIn(priorityText)])]
    .filter((w) => !(c.companyName && norm(c.companyName).includes(` ${w} `)) && !VERBS.has(w) && !geoWords.has(w));
  return {
    company: [c.companyName, c.website].filter((x): x is string => Boolean(x && x.length >= 4)),
    competitors: named(c.competitors),
    productPhrases: rankByRecurrence(phrases(`${c.product ?? ''}. ${c.revenueModel ?? ''}`), `${c.product ?? ''} ${c.buyers ?? ''} ${c.notes ?? ''} ${priorityText}`),
    priorityPhrases: phrases(priorityText).filter((p) => !p.split(' ').some((w) => VERBS.has(w) || MONTHS.has(w))),
    productWords, buyerWords, priorityWords,
    markets: geoTerms(c.geography),
    // Suppliers, platforms and inputs: a name ("AWS", "Stripe") or a distinctive word ("aluminium", "barley").
    dependencies: c.dependencies.map((d) => {
      const name = d.text.match(/\b[A-Z][A-Za-z0-9&.-]{1,}(?:\s+[A-Z][A-Za-z0-9&.-]+)*\b/)?.[0] ?? null;
      // A dependency matches by its name ("AWS", "Stripe") or by one of its own two-word phrases ("green coffee",
      // "natural gas") — never by a single common word ("calls", "supply", "green"), which matched unrelated news.
      return { text: d.text, name: name && name.length >= 3 ? name : null, phrases: phrases(d.text), public: d.origin === 'research_accepted' };
    }),
  };
}

/** Remove the publisher name ("Headline - Publisher", "(Reported by X.)") so a site's own posts do not "mention" it. */
function withoutPublisher(text: string, publisher: string | null): string {
  let out = text.replace(/\(Reported by [^)]*\)/g, ' ');
  if (publisher) out = out.split(publisher).join(' ');
  return out;
}

export function connectionFor(signal: { title?: string | null; content?: string | null; what_happened?: string | null }, c: CompanyContext): Connection {
  const title = signal.title ?? '';
  const publisher = title.match(/\s[-–—|]\s([^-–—|]{2,60})$/)?.[1]?.trim() ?? signal.content?.match(/\(Reported by ([^)]*)\.\)/)?.[1] ?? null;
  const raw = withoutPublisher(`${headlineCore(title)}. ${signal.what_happened ? headlineCore(signal.what_happened) : ''}. ${signal.content ?? ''}`, publisher);
  const hay = norm(raw);
  const hayStems = new Set([...words(raw).map(stem), ...norm(raw).trim().split(' ').filter((w) => w.length >= 2 && w.length <= 5)]);
  const t = exposureTerms(c);
  const matched: Connection['matched'] = [];
  let score = 0;

  // Same-name protection: a company-name hit counts only alongside its website or another business fact.
  const companyHit = t.company.find((n) => has(hay, norm(n).trim()));
  const competitorHits = t.competitors.filter((name) => has(hay, norm(name).trim()));
  for (const p of t.productPhrases) if (has(hay, p)) { matched.push({ kind: 'product', term: p }); score += 3; }
  for (const p of t.priorityPhrases) if (has(hay, p) && !matched.some((m) => m.term === p)) { matched.push({ kind: 'priority', term: p }); score += 2.5; }
  const productHits = t.productWords.filter((w) => hayStems.has(w) && !matched.some((m) => m.term.includes(w)));
  const buyerHits = t.buyerWords.filter((w) => hayStems.has(w) && !productHits.includes(w));
  const priorityHits = t.priorityWords.filter((w) => hayStems.has(w) && !productHits.includes(w) && !buyerHits.includes(w) && !matched.some((m) => m.term.includes(w)));
  for (const w of productHits) { matched.push({ kind: 'product', term: w }); score += 1.5; }
  for (const w of buyerHits) { matched.push({ kind: 'buyers', term: w }); score += 1.5; }
  for (const w of priorityHits.slice(0, 2)) { matched.push({ kind: 'priority', term: w }); score += 1; }
  const marketHits = t.markets.filter((m) => m.aliases.some((a) => has(hay, a.startsWith(' ') ? a : a)));
  const dependencyHits = t.dependencies.filter((d) => (d.name && has(hay, norm(d.name).trim())) || d.phrases.some((p) => has(hay, p)));
  const businessHits = matched.length;
  // A specific term: a two-word phrase from your details, or a word that is not common business vocabulary.
  const specificHits = matched.filter((m) => m.term.includes(' ') || !GENERIC.has(m.term)).length;
  // Competitor names collide with ordinary words and unrelated businesses ("Faire", "Alibaba" chip orders). A one-word
  // name counts only next to a business term from your details; a distinctive multi-word name counts on its own.
  for (const name of competitorHits) {
    // Namesakes ("Concord Legal Group" for a competitor called Concord) are removed by the check in verify.ts.
    if (name.trim().includes(' ') || specificHits >= 1 || businessHits >= 2) { matched.unshift({ kind: 'competitor', term: name }); score += 5; }
  }
  // A market alone (e.g. any news mentioning the UK) is not exposure; it strengthens an existing business match.
  if (businessHits) for (const m of marketHits) { matched.push({ kind: 'market', term: m.label }); score += 1.5; }
  // Your company: a multi-word name or your website is distinctive on its own; a one-word name needs a business term.
  const distinctiveCompany = t.company.some((n) => (n.includes('.') || n.trim().includes(' ')) && has(hay, norm(n).trim()));
  if (companyHit && (businessHits || distinctiveCompany)) { matched.unshift({ kind: 'company', term: companyHit }); score += 6; }

  // A two-word product phrase is strong only with one more business term (e.g. "strategic intelligence" + CEOs),
  // because phrases also occur in unrelated fields (defence "strategic intelligence").
  const phraseHit = matched.some((m) => m.kind === 'product' && m.term.includes(' '));
  const strong = matched.some((m) => m.kind === 'company' || m.kind === 'competitor') || (phraseHit && matched.filter((m) => m.kind !== 'market' && (m.term.includes(' ') || !GENERIC.has(m.term))).length >= 2);
  const businessWordCount = matched.filter((m) => (m.kind === 'product' || m.kind === 'buyers') && !GENERIC.has(m.term)).length;
  // One word plus a market counts only when your own phrase ties them, e.g. "Turkish textile" + Türkiye + textile.
  const geoPhraseHit = marketHits.length > 0 && t.productPhrases.some((p) => {
    const [a, b] = p.split(' ');
    const geoWord = marketHits.some((m) => m.aliases.some((al) => al.trim() === a || al.trim() === b));
    return geoWord && (hayStems.has(a) || hayStems.has(b));
  });
  const connected = strong || (score >= 4 && businessWordCount >= 2) || geoPhraseHit;
  // Loose candidates for the check: your company or a competitor is named (even without a business term), or one of
  // your own phrases appears with anything else of yours. The check decides; the strict rule above stands alone.
  const anyPhrase = matched.some((m) => (m.kind === 'product' || m.kind === 'priority') && m.term.includes(' '));
  // Something you depend on (a supplier, platform or input) changing is a candidate even with no other match.
  for (const d of dependencyHits) matched.push({ kind: 'dependency', term: d.name && has(hay, norm(d.name).trim()) ? d.name : d.phrases.find((p) => has(hay, p)) ?? d.text });
  // One distinctive word alone is too weak to spend an assessment on: it takes one of your own phrases, or two words.
  const specificWords = matched.filter((m) => (m.kind === 'product' || m.kind === 'buyers' || m.kind === 'priority') && !m.term.includes(' ') && !GENERIC.has(m.term)).length;
  const candidate = connected || Boolean(companyHit) || competitorHits.length > 0 || dependencyHits.length > 0 || anyPhrase || specificWords >= 2;
  if (!connected && candidate) {
    if (companyHit && !matched.some((m) => m.kind === 'company')) matched.unshift({ kind: 'company', term: companyHit });
    for (const name of competitorHits) if (!matched.some((m) => m.term === name)) matched.unshift({ kind: 'competitor', term: name });
    if (!businessHits) for (const m of marketHits) matched.push({ kind: 'market', term: m.label });
  }
  if (!connected) {
    return { status: 'monitor', score: Math.round(score * 10) / 10, matched: candidate ? matched : [], contextVersion: c.version, basis: 'No established exposure', candidate,
      text: candidate ? describe(matched) : 'Monitor · no exposure to your business is established from the details you gave.' };
  }
  return { status: 'connected', score: Math.round(score * 10) / 10, matched, contextVersion: c.version, basis: 'Matched to your company details', text: describe(matched), candidate: true };
}

function describe(matched: Connection['matched']): string {
  const parts: string[] = [];
  const list = (kind: Connection['matched'][number]['kind']) => [...new Set(matched.filter((m) => m.kind === kind).map((m) => m.term))];
  if (list('company').length) parts.push('mentions your company');
  if (list('competitor').length) parts.push(`mentions ${list('competitor').join(' and ')}, which you named as a competitor`);
  if (list('product').length) parts.push(`touches what you sell (${list('product').slice(0, 3).join(', ')})`);
  if (list('buyers').length) parts.push(`touches your buyers (${list('buyers').slice(0, 3).join(', ')})`);
  if (list('priority').length) parts.push(`relates to your stated priority (${list('priority').join(', ')})`);
  if (list('dependency').length) parts.push(`touches something you depend on (${list('dependency').join(', ')})`);
  if (list('market').length) parts.push(`concerns ${list('market').join(' and ')}, where you said you operate or sell`);
  return `Why this may matter to you: it ${parts.join('; it ')}. Possible relevance from your stated details — not a confirmed effect.`;
}
