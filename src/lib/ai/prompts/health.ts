import type { Profile, CeoContext, Decision, BlindSpotPattern } from "@/types/database";

export function buildHealthScorePrompt(
  profile: Profile,
  context: CeoContext,
  recentDecisions: Decision[],
  activeBlindSpots: BlindSpotPattern[],
  pendingRecommendationsCount: number,
  unprocessedSignalsCount: number
): string {
  const decisionVelocity = recentDecisions.filter(
    (d) =>
      new Date(d.created_at).getTime() >
      Date.now() - 7 * 24 * 60 * 60 * 1000
  ).length;

  const resolvedDecisions = recentDecisions.filter(
    (d) => d.status === "decided"
  );
  const negativeOutcomes = resolvedDecisions.filter(
    (d) => (d.outcome_variance_cost ?? 0) > 0
  ).length;

  return `You are the Health Score Engine for VANTAGE. Calculate a single 0-100 score representing
this CEO's strategic health. This score is the first thing they see every morning.

## INPUT DATA
Company: ${profile.company_name}
Context completeness: ${context ? "Complete" : "Incomplete"}

Decisions in last 7 days: ${decisionVelocity}
Resolved decisions with tracked outcomes: ${resolvedDecisions.length}
Negative outcome decisions: ${negativeOutcomes}
Active blind spot alerts: ${activeBlindSpots.length}
Pending recommendations: ${pendingRecommendationsCount}
Unprocessed signals: ${unprocessedSignalsCount}

## SCORING COMPONENTS (each 0-100, your job is to synthesize these)

1. signal_clarity (0-100): How well-processed is the signal environment?
   - High: signals being ingested and triaged, low noise
   - Low: many unprocessed signals, or no signals at all

2. decision_velocity (0-100): Is the CEO making decisions at an appropriate cadence?
   - High: 2-5 decisions per week, appropriate urgency
   - Low: decision avoidance or paralysis

3. blind_spot_risk (0-100, inverted — 100 = no blind spots):
   - 100: no active blind spots
   - Lower with each active, high-confidence blind spot

4. execution_momentum (0-100): Are pending recommendations being acted on?
   - High: most recommendations acknowledged and acted on
   - Low: backlog of unacknowledged recommendations

5. context_freshness (0-100): Is the CEO's context current?
   - Based on how recently context was updated

## SYNTHESIZE
Calculate a weighted overall score. Weight: signal_clarity 20%, decision_velocity 25%,
blind_spot_risk 25%, execution_momentum 20%, context_freshness 10%.

Respond with ONLY valid JSON:
{
  "score": number (0-100, weighted average of components),
  "components": {
    "signal_clarity": number,
    "decision_velocity": number,
    "blind_spot_risk": number,
    "execution_momentum": number,
    "context_freshness": number
  },
  "rationale": string (one sentence explaining the score)
}`;
}
