/**
 * Values that do not belong in the field they are stored in.
 *
 * Verified mapping defects in onboarding (src/app/api/onboarding/step/route.ts, unchanged here):
 *   step 3 team size       → profiles.business_model
 *   step 6 decision style  → ceo_context.revenue_model
 *   step 7 risk tolerance  → ceo_context.avoided_decision
 * A stored value that is exactly one of those answer options is that answer, not a business fact. Anything else is
 * kept as the founder's value; short values that do not describe money are kept but marked for confirmation.
 * These lists mirror src/app/onboarding/page.tsx (a test keeps them in step).
 */
export const ONBOARDING_TEAM_SIZES = ['Solo', '2–5', '6–15', '16–50', '51–200', '200+'];
export const ONBOARDING_DECISION_STYLES = ['Analytical', 'Intuitive', 'Consensus', 'Decisive', 'Collaborative'];
export const ONBOARDING_RISK_TOLERANCES = ['Low', 'Medium', 'High', 'Calculated'];

export interface FieldFlag { field: string; stored: string; meaning: string; reason: string; action: 'reinterpreted' | 'confirm' }

const norm = (s: string) => s.trim().replace(/-/g, '–');
const REVENUE_WORDS = /(subscri|commission|fee|licen|wholesale|retail|marketplace|advert|ads\b|service|consult|resale|resell|transaction|usage|freemium|per\s|pricing|sale|sell|revenue|margin|rent|lease|interest|royalt|contract|project|hour|seat|saas|b2b|b2c|d2c|direct)/i;

export function classifyBusinessModel(v: string | null): { value: string | null; teamSize: string | null; flag: FieldFlag | null } {
  if (!v) return { value: null, teamSize: null, flag: null };
  if (ONBOARDING_TEAM_SIZES.includes(norm(v))) return { value: null, teamSize: norm(v), flag: { field: 'profiles.business_model', stored: v, meaning: 'team size', reason: 'Onboarding stores the team-size answer in this field.', action: 'reinterpreted' } };
  return { value: v, teamSize: null, flag: null };
}

export function classifyRevenueModel(v: string | null): { value: string | null; decisionStyle: string | null; flag: FieldFlag | null } {
  if (!v) return { value: null, decisionStyle: null, flag: null };
  if (ONBOARDING_DECISION_STYLES.includes(v.trim())) return { value: null, decisionStyle: v.trim(), flag: { field: 'ceo_context.revenue_model', stored: v, meaning: 'decision style', reason: 'Onboarding stores the decision-style answer in this field.', action: 'reinterpreted' } };
  if (v.trim().length <= 25 && !REVENUE_WORDS.test(v)) return { value: v, decisionStyle: null, flag: { field: 'ceo_context.revenue_model', stored: v, meaning: 'unclear', reason: 'This does not read like a description of how the business makes money.', action: 'confirm' } };
  return { value: v, decisionStyle: null, flag: null };
}

export function classifyAvoidedDecision(v: string | null): { value: string | null; riskTolerance: string | null; flag: FieldFlag | null } {
  if (!v) return { value: null, riskTolerance: null, flag: null };
  if (ONBOARDING_RISK_TOLERANCES.includes(v.trim())) return { value: null, riskTolerance: v.trim(), flag: { field: 'ceo_context.avoided_decision', stored: v, meaning: 'risk tolerance', reason: 'Onboarding stores the risk-tolerance answer in this field.', action: 'reinterpreted' } };
  return { value: v, riskTolerance: null, flag: null };
}
