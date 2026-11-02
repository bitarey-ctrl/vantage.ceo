/**
 * Deterministic quality checks on an impact analysis — no second model. They do not prove an analysis is good; they
 * catch the failures that matter most: generic text that ignores the business, invented numbers, actions that break
 * a stated constraint, and missing follow-on effects.
 */
import type { CompanyContext } from './context';

export interface AnalysisText { soWhat: string | null; ifYouAct: string | null; ifYouDont: string | null; immediateAction: string | null }
export interface QualityReport {
  usesBusinessFacts: string[];         // company facts the analysis actually names
  inventedNumbers: string[];           // numbers not found in the signal, the context or the calculation
  constraintConflicts: string[];       // stated constraints the action appears to break
  secondOrder: boolean;                // states a follow-on effect (If you don't …)
  actionConcrete: boolean;             // action names a time frame and an output
  pass: boolean;
}

const lower = (s: string | null | undefined) => (s ?? '').toLowerCase();
const STOP = new Set('the and for with your you our their from that this into over have has will can may not are was'.split(' '));

function factTerms(c: CompanyContext): string[] {
  const terms = [...c.competitors, ...c.dependencies.map((d) => d.text), ...c.geography, ...(c.companyName ? [c.companyName] : [])];
  const productWords = lower(`${c.product ?? ''} ${c.buyers ?? ''}`).split(/[^a-z0-9-]+/).filter((w) => w.length >= 5 && !STOP.has(w));
  return [...new Set([...terms.map((t) => t.trim()).filter((t) => t.length >= 2), ...productWords])];
}

export function analysisQuality(a: AnalysisText, c: CompanyContext, sourceText: string, calculationText: string | null = null): QualityReport {
  const all = [a.soWhat, a.ifYouAct, a.ifYouDont, a.immediateAction].map(lower).join(' ');
  const usesBusinessFacts = factTerms(c).filter((t) => all.includes(t.toLowerCase())).slice(0, 12);
  const allowed = lower(`${sourceText} ${calculationText ?? ''} ${c.estimates.map((e) => e.value).join(' ')} ${c.revenueRange ?? ''} ${c.priorities.join(' ')} ${c.constraints.map((x) => x.text).join(' ')}`);
  const numbers = (all.match(/\b\d+(?:[.,]\d+)?\s?%|\$\s?\d[\d,.]*\s?[kmb]?|\b\d{2,}(?:[.,]\d+)?\b/gi) ?? []).map((n) => n.replace(/\s/g, ''));
  const inventedNumbers = [...new Set(numbers.filter((n) => { const core = n.replace(/[^\d.]/g, ''); return core && !allowed.replace(/\s/g, '').includes(core) && !/^(20[0-3]\d|30|60|90)$/.test(core); }))];
  // A constraint written as "No X" / "Can't X" / "Not X" is broken when the action proposes X.
  const action = lower(a.immediateAction);
  const constraintConflicts = c.constraints.map((x) => x.text).filter((t) => {
    const m = lower(t).match(/\b(?:no|not|can't|cannot|won't|without)\s+(?:new\s+)?([a-z]{4,})/);
    if (!m) return false;
    const stem = m[1].replace(/(ing|es|s)$/, '');
    return stem.length >= 3 && new RegExp(`\\b${stem}`).test(action);
  });
  const secondOrder = Boolean(a.ifYouDont && a.ifYouDont.length > 60 && !/^no clear systemic risk/i.test(a.ifYouDont));
  const actionConcrete = /\b(this week|today|tomorrow|\d+\s?(minutes?|mins?|hours?|days?))\b/.test(action) && /\b(list|draft|decide|decision|number|email|call|ask|compare|check|write|send|book|price|quote)\b/.test(action);
  return { usesBusinessFacts, inventedNumbers, constraintConflicts, secondOrder, actionConcrete, pass: usesBusinessFacts.length >= 2 && !inventedNumbers.length && !constraintConflicts.length && actionConcrete };
}
