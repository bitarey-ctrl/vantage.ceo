/**
 * One canonical company-context contract for Advisor, Signals, analysis, the Company page and Decisions.
 *
 * Reads the existing records as they are stored (no migration): `profiles` plus `ceo_context`. Several fields were
 * written in two shapes over time — `strategic_priorities` and `competitors` exist both as a JSON string and as an
 * array of strings/objects — so every consumer goes through `normaliseCompanyContext` instead of reading raw columns.
 *
 * Rules: unknown stays unknown (no "B2B SaaS" / "Turkey" defaults), every value keeps where it came from, and the
 * context carries a version hash so stored judgements can tell when the facts behind them changed.
 */
import { createHash } from 'node:crypto';

export type FactOrigin = 'founder' | 'founder_profile' | 'advisor_noted' | 'research_accepted';

/** A business fact beyond the fixed columns (ceo_context.business_facts). Estimates stay labelled as estimates. */
export interface BusinessFact { id: string; text: string; origin: FactOrigin; evidence?: string | null }
export interface Estimate { id: string; label: string; value: number; unit: '%' | 'currency' | 'count'; basis: 'estimate' | 'actual'; origin: FactOrigin }
export interface ContextFact { value: string; origin: FactOrigin; field: string }

export interface CompanyContext {
  profileId: string;
  version: string;
  companyName: string | null;
  website: string | null;
  product: string | null;
  buyers: string | null;
  revenueModel: string | null;
  revenueRange: string | null;
  stage: string | null;
  sector: string | null;
  geography: string[];
  topPriority: string | null;
  priorities: string[];
  competitors: string[];
  avoidedDecision: string | null;
  notes: string | null;
  /** Suppliers, platforms, channels or inputs the business depends on. */
  dependencies: BusinessFact[];
  /** Limits on what the founder can do (cash, team, time, contracts, rules). */
  constraints: BusinessFact[];
  /** Public facts from research that the founder accepted (identity, history). */
  publicFacts: BusinessFact[];
  /** Founder-supplied numbers; used only in deterministic calculations, never invented. */
  estimates: Estimate[];
  /** Field → where the value came from. */
  provenance: Record<string, ContextFact>;
  /** Plain-language list of what is not known (and must not be assumed). */
  unknowns: string[];
}

type Row = object | null | undefined;
const field = (row: Row, key: string): unknown => (row ? (row as Record<string, unknown>)[key] : undefined);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** A list stored as an array of strings/objects, or as one string. Never splits a sentence on commas. */
export function normaliseList(raw: unknown, key: 'title' | 'name', splitOnCommas: boolean): string[] {
  let items: unknown[] = [];
  if (Array.isArray(raw)) items = raw;
  else if (typeof raw === 'string') {
    const text = raw.trim();
    if (text.startsWith('[')) { try { const parsed = JSON.parse(text); if (Array.isArray(parsed)) items = parsed; } catch { items = [text]; } }
    else items = text.split(splitOnCommas ? /[\n;,]+/ : /[\n;]+|\s+•\s+/);
  }
  const out = items.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      return String(o[key] ?? o.title ?? o.name ?? o.text ?? o.description ?? '');
    }
    return '';
  }).map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter((s) => s.length > 1);
  return [...new Set(out)];
}

function factList(raw: unknown, origin: FactOrigin): BusinessFact[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((f, i) => {
    const o = (f && typeof f === 'object' ? f : { text: f }) as Record<string, unknown>;
    const text = str(o.text);
    const fact: BusinessFact | null = text ? { id: str(o.id) ?? `f${i}`, text, origin: (str(o.origin) as FactOrigin) ?? origin, evidence: str(o.evidence) } : null;
    return fact;
  }).filter((x): x is BusinessFact => x !== null);
}
function estimateList(raw: unknown): Estimate[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e, i) => {
    const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    const value = typeof o.value === 'number' && Number.isFinite(o.value) ? o.value : null;
    const label = str(o.label);
    const unit = o.unit === '%' || o.unit === 'currency' || o.unit === 'count' ? o.unit : null;
    const est: Estimate | null = label && value !== null && unit ? { id: str(o.id) ?? `e${i}`, label, value, unit, basis: o.basis === 'actual' ? 'actual' : 'estimate', origin: (str(o.origin) as FactOrigin) ?? 'founder' } : null;
    return est;
  }).filter((x): x is Estimate => x !== null);
}

const ARR_BANDS: Record<string, string> = {
  pre_seed: 'Pre-revenue', pre_1m: 'Under $1M a year (ARR)', '1m_5m': '$1M–$5M a year (ARR)', '5m_20m': '$5M–$20M a year (ARR)', '20m_plus': 'Over $20M a year (ARR)',
};

function firstUrl(text: string | null): string | null {
  const m = text?.match(/\bhttps?:\/\/[^\s)]+|\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|ai|eu|uk|de|fr|tr|com\.tr)\b/i);
  if (!m) return null;
  try { const u = new URL(m[0].startsWith('http') ? m[0] : `https://${m[0]}`); return u.hostname.replace(/^www\./, ''); } catch { return null; }
}

/** Build the canonical context from the stored profile and ceo_context rows. */
export function normaliseCompanyContext(profileId: string, profile: Row, ctx: Row): CompanyContext {
  const provenance: Record<string, ContextFact> = {};
  const take = (field: string, value: string | null, origin: FactOrigin) => { if (value) provenance[field] = { value, origin, field }; return value; };
  const companyName = take('companyName', str(field(profile, 'company_name')), 'founder_profile');
  const notes = take('notes', str(field(ctx, 'additional_context')), 'founder');
  const product = take('product', str(field(ctx, 'product_description')), 'founder');
  const buyers = take('buyers', str(field(ctx, 'target_customer')), 'founder');
  const revenueModel = take('revenueModel', str(field(ctx, 'revenue_model')) ?? str(field(profile, 'business_model')), 'founder');
  const band = str(field(ctx, 'arr_band'));
  const revenueRange = take('revenueRange', str(field(ctx, 'monthly_revenue_range')) ?? (band ? ARR_BANDS[band] ?? band : null) ?? str(field(profile, 'revenue_range')), 'founder');
  const stage = take('stage', str(field(profile, 'company_stage')), 'founder_profile');
  const sector = take('sector', str(field(ctx, 'sector')) ?? str(field(profile, 'industry')), 'founder');
  const geoText = str(field(ctx, 'geography_detail')) ?? str(field(profile, 'geography'));
  take('geography', geoText, 'founder');
  const geography = geoText ? [...new Set(geoText.split(/[,;\n/]+|\band\b/i).map((s) => s.trim()).filter((s) => s.length > 1))] : [];
  const topRaw = str(field(ctx, 'top_priority'));
  const topPriority = take('topPriority', topRaw === 'Other' ? str(field(ctx, 'top_priority_other')) ?? 'Other' : topRaw, 'founder');
  const priorities = normaliseList(field(ctx, 'strategic_priorities'), 'title', false);
  if (priorities.length) take('priorities', priorities.join('; '), 'founder');
  const competitors = normaliseList(field(ctx, 'competitors'), 'name', true);
  if (competitors.length) take('competitors', competitors.join(', '), 'founder');
  const avoidedDecision = take('avoidedDecision', str(field(ctx, 'avoided_decision')), 'founder');
  const website = take('website', firstUrl(notes) ?? firstUrl(product), 'founder');
  const bf = (field(ctx, 'business_facts') ?? {}) as Record<string, unknown>;
  const dependencies = factList(bf.dependencies, 'founder');
  const constraints = factList(bf.constraints, 'founder');
  const estimates = estimateList(bf.estimates);
  const publicFacts = factList(bf.public_facts, 'research_accepted');

  const unknowns: string[] = [];
  if (!product) unknowns.push('what the company sells');
  if (!buyers) unknowns.push('who buys');
  if (!revenueModel) unknowns.push('how it makes money');
  if (!geography.length) unknowns.push('where it operates and sells');
  if (!competitors.length) unknowns.push('which competitors matter');
  if (!priorities.length && !topPriority) unknowns.push('current priorities');
  if (!dependencies.length) unknowns.push('key suppliers, platforms or channels it depends on');
  if (!constraints.length) unknowns.push('limits on what it can do now (cash, team, time)');
  unknowns.push('margins, costs, cash and payment terms (never inferred)');

  const facts = { companyName, website, product, buyers, revenueModel, revenueRange, stage, sector, geography, topPriority, priorities, competitors, avoidedDecision, notes, dependencies, constraints, estimates, publicFacts };
  const version = createHash('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, 16);
  return { profileId, version, ...facts, provenance, unknowns };
}

/**
 * The context block every model call receives. Short, explicit about unknowns, and explicit that the values are what
 * the founder told VANTAGE (not verified facts).
 */
export function companyContextBlock(c: CompanyContext): string {
  const line = (label: string, value: string | null | undefined) => `${label}: ${value && value.trim() ? value : 'not recorded'}`;
  return [
    line('Company', c.companyName ? `${c.companyName}${c.website ? ` (${c.website})` : ''}` : null),
    line('What they sell', c.product),
    line('Who buys', c.buyers),
    line('How they make money', c.revenueModel),
    line('Revenue range (founder-reported)', c.revenueRange),
    line('Stage', c.stage),
    line('Sector', c.sector),
    line('Where they operate and sell', c.geography.join(', ')),
    line('Current #1 priority', c.topPriority),
    line('Strategic priorities', c.priorities.join('; ')),
    line('Competitors they named', c.competitors.join(', ')),
    line('Decision they have been avoiding', c.avoidedDecision),
    line('Public facts they confirmed', c.publicFacts.map((d) => d.text).join('; ')),
    line('Depends on', c.dependencies.map((d) => d.text).join('; ')),
    line('Constraints they stated', c.constraints.map((d) => d.text).join('; ')),
    line('Numbers they gave', c.estimates.map((e) => `${e.label}: ${e.value}${e.unit === '%' ? '%' : e.unit === 'currency' ? ' (currency)' : ''} (${e.basis})`).join('; ')),
    line('Notes they gave', c.notes),
    `Not known — do not assume or invent: ${c.unknowns.join('; ')}.`,
    'All values above are founder-reported unless stated otherwise; they are not independently verified.',
  ].join('\n');
}

/** The same context, shaped for the browser (Company page, decision guidance). */
export function companyContextForClient(c: CompanyContext) {
  const { provenance, ...rest } = c;
  return { ...rest, origins: Object.fromEntries(Object.entries(provenance).map(([k, f]) => [k, f.origin])) };
}
