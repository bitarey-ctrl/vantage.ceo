/**
 * The single definition of who VANTAGE is for, and the only five things a
 * signal is allowed to change for them.
 *
 * Every prompt that filters or explains a signal imports from here. If the ICP
 * moves, it moves in this file and nowhere else.
 */

// Account-neutral on purpose: the shared gate must not filter public evidence around one kind of business (or around
// whichever account triggered a refresh). Whether a signal matters to a particular business is decided later, per
// account, against that account's validated context (src/lib/company-context/verify.ts).
export const ICP_DESCRIPTION = `Founders and CEOs of small and mid-sized operating businesses — any sector, any country — with a small leadership team or none at all, and no chief of staff.`;

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
export const CATEGORY_DEFINITIONS = `1. PRICING — what businesses can charge, or what buyers in a market will pay.
2. COST BASE — what it costs to operate: materials, energy, freight, labour, rent, duties and taxes, software, cloud and AI/model pricing, platform and payment fees.
3. COMPETITION — a company's funding, launch, pricing move, expansion, shutdown, or acquisition.
4. COMPLIANCE — rules businesses must meet: product, trade, tax, employment, data/privacy, AI or security rules and standards.
5. CAPITAL — financing conditions: lending, investment and fundraising climate, valuations, M&A activity.`;
