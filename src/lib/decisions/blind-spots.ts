import { callClaude } from "@/lib/ai/claude";
import type {
  BlindSpot,
  BlindSpotCategory,
  DecisionConfidence,
} from "@/types/database";

export interface BusinessContext {
  companyName: string | null;
  industry: string | null;
  companyStage: string | null;
  businessModel: string | null;
  geography: string | null;
  revenueRange: string | null;
}

export interface BlindSpotInput {
  title: string;
  description: string | null;
  rationale: string | null;
  confidence: DecisionConfidence;
  knownContext: string | null;
  openQuestions: string | null;
  business: BusinessContext;
}

export type BlindSpotResult =
  | { analyzable: true; blindSpots: BlindSpot[] }
  | { analyzable: false; reason: string };

const VALID_CATEGORIES: BlindSpotCategory[] = [
  "financial",
  "regulatory",
  "competitive",
  "operational",
  "reputational",
  "market_timing",
  "team_capacity",
  "customer_perception",
];

const VALID_SEVERITIES: BlindSpot["severity"][] = ["low", "medium", "high"];

const CONFIDENCE_LABELS: Record<DecisionConfidence, string> = {
  confident: "Pretty sure — wants a sanity check",
  torn: "Genuinely torn",
  exploring: "Just exploring the idea",
};

function buildPrompt(input: BlindSpotInput): string {
  const { title, description, rationale, confidence, knownContext, openQuestions, business } =
    input;

  const ctx = [
    business.companyName && `Company: ${business.companyName}`,
    business.industry && `Industry: ${business.industry}`,
    business.companyStage && `Stage: ${business.companyStage}`,
    business.businessModel && `Business model: ${business.businessModel}`,
    business.geography && `Geography: ${business.geography}`,
    business.revenueRange && `Revenue range: ${business.revenueRange}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are a decision-analysis engine. Analyze the decision below for blind spots — risks, second-order effects, and angles the decision-maker is likely overlooking.

Before analyzing, evaluate whether the decision description contains enough substantive business context to generate meaningful blind spots. If the input is gibberish, nonsensical, joke text, fewer than ~15 meaningful words of business context, or appears to be a test/placeholder, return: {"analyzable": false, "reason": "<one sentence explaining what's missing>"}.

Only if the input is genuinely analyzable, return: {"analyzable": true, "blind_spots": [{category, description, severity}, ...]}.

Categories must come from: financial, regulatory, competitive, operational, reputational, market_timing, team_capacity, customer_perception. Severity: low | medium | high. Each blind_spot.description should reference SPECIFIC details from the user's input — if you can't reference specifics, the input wasn't analyzable, so return analyzable: false.

## BUSINESS CONTEXT
${ctx || "No additional business context provided."}

## DECISION
Title: ${title}
What they're deciding: ${description?.trim() || "(none provided)"}
Why they're considering it: ${rationale?.trim() || "(none provided)"}
How sure they are: ${CONFIDENCE_LABELS[confidence]}
What they already know: ${knownContext?.trim() || "(none provided)"}
What they're unsure about: ${openQuestions?.trim() || "(none provided)"}

## RULES (apply only when analyzable)
1. Each blind spot must be specific to THIS decision and THIS business — not generic advice.
2. NO INVENTED NUMBERS. You do not have this company's financials, pipeline, or customer data. Use qualitative language; never fabricate dollar amounts, percentages, or dates.
3. Be proportionate. Reserve "high" for blind spots that could materially harm the business.
4. Return between 2 and 6 blind spots. If the decision is genuinely low-risk, return fewer.

Return JSON ONLY — no markdown, no prose, no code fences.`;
}

/**
 * Runs a per-decision blind-spot analysis through Claude. Returns either a
 * refusal ({analyzable:false, reason}) when the input is too thin to analyze,
 * or a validated, normalized blind-spot list. Invalid items (bad
 * category/severity/empty description) are dropped rather than thrown so a
 * partial response still yields usable output.
 */
export async function analyzeBlindSpots(
  input: BlindSpotInput
): Promise<BlindSpotResult> {
  const raw = await callClaude<unknown>(buildPrompt(input), { maxTokens: 1500 });

  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // Explicit refusal from the model.
  if (obj.analyzable === false) {
    const reason =
      typeof obj.reason === "string" && obj.reason.trim()
        ? obj.reason.trim()
        : "The decision didn't include enough business context to analyze.";
    return { analyzable: false, reason };
  }

  const items = Array.isArray(raw)
    ? raw
    : Array.isArray(obj.blind_spots)
      ? (obj.blind_spots as unknown[])
      : [];

  const normalized: BlindSpot[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const category = String(r.category ?? "").trim() as BlindSpotCategory;
    const severity = String(r.severity ?? "").trim() as BlindSpot["severity"];
    const description = String(r.description ?? "").trim();
    if (!VALID_CATEGORIES.includes(category)) continue;
    if (!VALID_SEVERITIES.includes(severity)) continue;
    if (!description) continue;
    normalized.push({ category, description, severity });
  }

  // The model claimed analyzable but produced nothing usable — treat as a refusal
  // so the UI shows the empty state instead of a blank analysis.
  if (normalized.length === 0) {
    return {
      analyzable: false,
      reason: "Couldn't surface anything specific to this decision — try adding more detail.",
    };
  }

  return { analyzable: true, blindSpots: normalized };
}
