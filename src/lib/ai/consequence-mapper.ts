import { callClaude } from "./claude";
import { buildConsequencePrompt } from "./prompts/consequence";
import type { CeoContext, Profile, Decision, Consequence } from "@/types/database";

interface TriageResult {
  relevant: boolean;
  relevance_score: number;
  relevance_reason: string;
}

interface ConsequenceResult {
  primary_impact: string;
  secondary_impact: string;
  tertiary_risk: string;
  action_recommendation: string;
  urgency_window: string;
  urgency_days: number;
  confidence_score: number;
  impact_matrix: Consequence["impact_matrix"];
  consequence_horizons: Consequence["consequence_horizons"];
}

/**
 * Relevance is now decided once, up front, by the five-category gate
 * (src/lib/signals/gate.ts). Anything that reaches deep analysis has already
 * passed it, so there is nothing left to re-triage here.
 *
 * Kept as a passing stub because api/signals/refresh and api/signals/[id]/analyse
 * consume `triageResult` from runConsequencePipeline below.
 */
async function triageSignal(): Promise<TriageResult> {
  // These are placeholders, not a judgement. The shape is preserved only
  // because api/signals/[id]/analyse consumes triageResult and writes it to
  // the deprecated signal_triages scoring columns (see migration 028).
  return {
    relevant: true,
    relevance_score: 100,
    relevance_reason: "Passed the five-category gate at ingestion.",
  };
}

export async function mapConsequences(
  signalTitle: string,
  signalContent: string,
  profile: Profile,
  context: CeoContext,
  recentDecisions: Decision[]
): Promise<ConsequenceResult> {
  const prompt = buildConsequencePrompt(
    signalTitle,
    signalContent,
    profile,
    context,
    recentDecisions
  );
  return callClaude<ConsequenceResult>(prompt, { maxTokens: 2048 });
}

export async function runConsequencePipeline(
  _signalId: string,
  signalTitle: string,
  signalContent: string,
  profile: Profile,
  context: CeoContext,
  recentDecisions: Decision[]
): Promise<{
  triageResult: TriageResult;
  consequenceResult: ConsequenceResult | null;
}> {
  const [triageResult, consequenceAttempt] = await Promise.all([
    triageSignal(),
    mapConsequences(signalTitle, signalContent, profile, context, recentDecisions)
      .catch((err) => {
        console.error("[pipeline] Consequence mapping failed:", err);
        return null;
      }),
  ]);

  return { triageResult, consequenceResult: consequenceAttempt };
}
