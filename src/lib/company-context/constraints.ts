/**
 * Decisive limits: the founder's stated constraints, turned into concrete rules the advice has to fit inside.
 *
 * Why this exists: in the 2026-11-05 isolated run, "no engineering capacity until Q3" and "about three months of cash
 * left" produced the same advice as no constraint. The Advisor never received them (its query omitted business_facts),
 * and even when present they were one line among twenty. Each limit is now classified
 * deterministically, its implication for the next step and timing is spelled out, and the same classification
 * drives a mention check on the finished answer. That check can show a limit was NOT addressed; it cannot prove the
 * advice complies — semantic compliance is not established by keyword matching, and nothing here claims it is.
 */
import type { BusinessFact, CompanyContext } from './context';

export type LimitKind = 'engineering' | 'capacity' | 'cash' | 'hiring' | 'responsibility' | 'other';
export interface Limit { text: string; kind: LimitKind; strength: 'hard' | 'preference'; until: string | null }

const PREFERENCE = /\b(prefer|would rather|ideally|we'?d like|rather not|if possible|hope to|want to avoid)\b/i;
const KINDS: [LimitKind, RegExp][] = [
  ['cash', /\b(cash|runway|overdraft|burn|money left|funding runs out|months? of (cash|money|runway))\b/i],
  ['hiring', /\b(no (new )?hires?|hiring freeze|(can'?t|cannot) hire|headcount)\b/i],
  ['engineering', /\b(engineer\w*|developers?|dev (team|capacity)|tech(nical)? (team|capacity)|coding|product build)\b/i],
  ['responsibility', /\b(lending|credit risk|handle payments|hold funds|only make introductions|liabilit\w+)\b/i],
  ['capacity', /\b(capacity|fully booked|bandwidth|no time)\b/i],
];
const UNTIL = /\buntil\s+(Q[1-4](?:\s*\d{4})?|(?:next|the end of)\s+\w+|[A-Z][a-z]+(?:\s+\d{4})?)/;

export function classifyLimit(f: Pick<BusinessFact, 'text'> & { strength?: unknown }): Limit {
  const kind = KINDS.find(([, re]) => re.test(f.text))?.[0] ?? 'other';
  const strength = f.strength === 'preference' || (f.strength !== 'hard' && PREFERENCE.test(f.text)) ? 'preference' : 'hard';
  return { text: f.text, kind, strength, until: f.text.match(UNTIL)?.[1] ?? null };
}

export function companyLimits(c: Pick<CompanyContext, 'constraints'>): Limit[] {
  return c.constraints.map(classifyLimit);
}

/** Commission / per-transaction intermediaries: the customer's real alternative is the same deal done directly. */
export function isCommissionModel(revenueModel: string | null): boolean {
  return Boolean(revenueModel && /\b(commission|take rate|booking fee|transaction fee|referral fee|% of (each|every))\b/i.test(revenueModel));
}

function implication(l: Limit): string {
  const until = l.until ? ` before ${l.until}` : '';
  switch (l.kind) {
    case 'engineering':
      return `Nothing that needs engineering or product build work${until}. The next step you recommend must be doable now without engineers (manual process, a partner, existing tools, a test with customers)${l.until ? `; anything that needs building is scheduled for ${l.until} or later, and you say so` : ''}.`;
    case 'capacity':
      return `Anything that needs this capacity waits${l.until ? ` until ${l.until}` : ''}. Recommend what they can do inside it now, and say what waits.`;
    case 'cash':
      return 'Cash is the binding limit here, not profit per sale. Running out of cash is the main risk in your assessment. Any spend you suggest must be small, stoppable and pay back well inside the time their cash lasts — otherwise say it should wait. Do not recommend a commitment (contracts, prepaid campaigns, hires, stock) that outlasts it.';
    case 'hiring':
      return 'No new hires: the answer must not depend on hiring. Give the path with the people they have.';
    case 'responsibility':
      return 'They do not take on this responsibility. Keep advice inside what they already do; if the best option needs it, say so and give the best option without it.';
    default:
      return 'The next step must fit inside it. If the best answer breaks it, say so and give the best option inside it.';
  }
}

/**
 * The prompt section placed right after the company context. Empty when there is nothing decisive to say.
 * Hard limits, preferences and estimates are kept apart so a preference is never treated as a wall and an estimate
 * never as a measured fact.
 */
export function decisiveLimitsBlock(c: Pick<CompanyContext, 'constraints' | 'estimates' | 'revenueModel'>): string {
  const limits = companyLimits(c);
  const hard = limits.filter((l) => l.strength === 'hard');
  const prefs = limits.filter((l) => l.strength === 'preference');
  const lines: string[] = [];
  if (hard.length) {
    lines.push('HARD LIMITS they stated — every recommendation, next step and timing must fit inside these:');
    for (const l of hard) lines.push(`- "${l.text}" → ${implication(l)}`);
  }
  if (prefs.length) {
    lines.push('PREFERENCES they stated — weigh them; they can be traded off, and if you trade one off, say so:');
    for (const l of prefs) lines.push(`- "${l.text}"`);
  }
  if (c.estimates.length) lines.push(`ESTIMATES they gave — their rough numbers, not measured; label them as their estimate when you use them: ${c.estimates.map((e) => `${e.label} ${e.value}${e.unit === '%' ? '%' : ''} (${e.basis})`).join('; ')}`);
  if (isCommissionModel(c.revenueModel)) {
    lines.push('HOW THEY GET PAID — they earn a commission on each transaction they bring about. For any question about price, commission rate, discounts or volume, the comparison that decides it is the customer\'s zero-fee alternative: doing the same job or deal directly (off-platform, through their own channels) and paying nothing. Say explicitly why a customer keeps paying any commission instead of going direct, and whether a lower rate changes that. A cheaper rate than a competitor is not the main comparison.');
  }
  return lines.length ? `## DECISIVE LIMITS\n${lines.join('\n')}` : '';
}

/** The last instruction before the answer (recency matters). Empty when there is nothing to check against. */
export function finalCheckBlock(c: Pick<CompanyContext, 'constraints' | 'estimates' | 'revenueModel'>): string {
  if (!decisiveLimitsBlock(c)) return '';
  return '## BEFORE YOU SEND\nRe-read DECISIVE LIMITS. Check your recommended next step and its timing against each hard limit; if a step breaks one, replace it with one that fits and say what waits. When a limit shapes the advice, name it in a short clause so they can see you used it. If HOW THEY GET PAID is present and they asked about price or volume, your answer compares against the zero-fee direct alternative.';
}

// ── Answer check (grading and diagnostics; never shown as a guarantee) ──────────────────────────────────────────

const BENCHMARK = /\b(?:most|many|the average|typical)\s+(?:[a-z-]+\s+){0,3}(?:shops?|businesses|companies|stores|brands|contractors|marketplaces|founders|retailers|startups)\b|\btypically\b|\bindustry (?:average|standard|benchmark|norm)s?\b|\bon average\b/gi;
const FIGURE = /[£$€]\s?\d[\d,.]*(?:\s?[-–]\s?[£$€]?\d[\d,.]*)?k?|\b\d[\d,.]*(?:\s?[-–]\s?\d[\d,.]*)?\s?%/g;

function limitMentioned(answer: string, l: Limit): boolean {
  const a = answer.toLowerCase();
  if (l.until && a.includes(l.until.toLowerCase())) return true;
  switch (l.kind) {
    case 'engineering': return /engineering (capacity|time|team)|no engineers|without engineers|engineers? (are|is) (busy|booked|unavailable)/.test(a);
    case 'cash': {
      const months = l.text.match(/(\w+)\s+months?/i)?.[1]?.toLowerCase();
      return /runway|cash (lasts|runs out|you have left|left in the bank)|before (the|your) cash/.test(a) || Boolean(months && new RegExp(`\\b${months}\\s+months?`).test(a));
    }
    case 'hiring': return /no (new )?hires?|without hiring|can'?t hire|hiring freeze/.test(a);
    default: return a.includes(l.text.toLowerCase().slice(0, 24));
  }
}

export interface AnswerCheck {
  limitsMissing: string[];
  commissionDirectCompared: boolean | null;
  unsupportedFigures: string[];
  benchmarkPhrases: string[];
  limitation: string;
}

/**
 * Does the answer visibly use each hard limit, compare against the direct alternative where required, and avoid
 * figures that are not in the context or the question? A pass means "mentioned", not "complied".
 */
export function checkAnswer(answer: string, c: Pick<CompanyContext, 'constraints' | 'estimates' | 'revenueModel'>, sourceText: string): AnswerCheck {
  const hard = companyLimits(c).filter((l) => l.strength === 'hard');
  const norm = (s: string) => s.replace(/\s+/g, '').replace(/[–]/g, '-');
  const allowed = norm(sourceText);
  const figures = [...new Set(answer.match(FIGURE) ?? [])].filter((f) => !allowed.includes(norm(f).replace(/[£$€%]/g, '')));
  return {
    limitsMissing: hard.filter((l) => !limitMentioned(answer, l)).map((l) => l.text),
    commissionDirectCompared: isCommissionModel(c.revenueModel) ? /\b(direct(ly)?|off[- ]platform|bypass|go(ing)? around (you|the platform)|zero[- ]fee|cut (you|the platform) out|without (paying|you))\b/i.test(answer) : null,
    unsupportedFigures: figures,
    benchmarkPhrases: [...new Set((answer.match(BENCHMARK) ?? []).map((s) => s.toLowerCase()))],
    limitation: 'Mention check only: it shows when a limit or comparison is absent, not that the advice actually complies.',
  };
}
