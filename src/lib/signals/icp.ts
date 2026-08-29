/**
 * The single definition of who VANTAGE is for, and the only five things a
 * signal is allowed to change for them.
 *
 * Every prompt that filters or explains a signal imports from here. If the ICP
 * moves, it moves in this file and nowhere else.
 */

export const ICP_DESCRIPTION = `B2B SaaS founders and CEOs in the US and UK, roughly $1M-$20M ARR, with a small leadership team or none at all, and no chief of staff.`;

/** The five categories. A signal that hits none of them is discarded. */
export const SIGNAL_CATEGORIES = [
  "pricing",
  "cost_base",
  "competition",
  "compliance",
  "capital",
] as const;

export type SignalCategory = (typeof SIGNAL_CATEGORIES)[number];

export function isSignalCategory(value: unknown): value is SignalCategory {
  return SIGNAL_CATEGORIES.includes(value as SignalCategory);
}

/** Display labels for the UI. */
export const CATEGORY_LABEL: Record<SignalCategory, string> = {
  pricing: "Pricing",
  cost_base: "Cost Base",
  competition: "Competition",
  compliance: "Compliance",
  capital: "Capital",
};

/**
 * The category definitions, written as the gate prompt reads them. Kept as
 * prose rather than keywords on purpose — keyword floors are what made the
 * old triage layer pass everything.
 */
export const CATEGORY_DEFINITIONS = `1. PRICING — what they can charge, or what the market will bear.
2. COST BASE — infrastructure, AI/model pricing, tooling, headcount costs.
3. COMPETITION — a competitor's funding, launch, pricing move, shutdown, or acquisition.
4. COMPLIANCE — regulation, data/privacy, AI rules, or security standards they must meet.
5. CAPITAL — fundraising climate, SaaS multiples, M&A activity in their category.`;
