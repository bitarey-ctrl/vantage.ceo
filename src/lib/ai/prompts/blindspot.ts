import type { Decision, CeoContext } from "@/types/database";

export function buildBlindSpotPrompt(
  decisions: Decision[],
  context: CeoContext,
  companyName: string
): string {
  const decisionData = decisions.map((d) => ({
    id: d.id,
    category: d.category,
    title: d.title,
    confidence_score: d.confidence_score,
    predicted_outcome: d.predicted_outcome,
    actual_outcome: d.actual_outcome,
    urgency_level: d.urgency_level,
    outcome_variance_cost: d.outcome_variance_cost,
    outcome_variance_description: d.outcome_variance_description,
    days_to_decide: null, // Could be calculated from created_at
    created_at: d.created_at,
    status: d.status,
  }));

  const avoidedDecision = context.avoided_decision;
  const avoidedReason = context.avoided_decision_stated_reason;

  return `You are the Blind Spot Detection Engine for VANTAGE.

Your job: Analyze a CEO's decision history and identify structural patterns that represent cognitive biases or systematic execution failures. These patterns cost money. Your job is to find them.

## COMPANY: ${companyName}

## DECISION HISTORY (${decisions.length} decisions)
${JSON.stringify(decisionData, null, 2)}

## CURRENTLY AVOIDED DECISION
"${avoidedDecision}"
Stated reason: "${avoidedReason}"

## PATTERN TYPES TO DETECT

1. **optimism_inflation**: CEO's predicted timelines are consistently shorter than actual outcomes.
   Detection threshold: 2+ decisions where outcome_variance shows timeline overrun.

2. **avoidance**: CEO repeatedly defers decisions in a specific category for 3+ decisions,
   or the avoided decision category matches a pattern in the decision log.

3. **recency_bias**: CEO's recent decisions show disproportionate weight on very recent signals
   compared to longer-term trends (confidence spike on recent vs. earlier similar decisions).

4. **confirmation_bias**: CEO accepts recommendations that confirm stated direction, rejects those
   that contradict. Detection requires recommendation acceptance pattern data.

5. **risk_aversion**: CEO systematically avoids high-urgency decisions or downgrades urgency levels.

6. **sunk_cost**: CEO continues in a direction despite negative outcome variance data.

## YOUR TASK
Identify 0-3 active blind spot patterns. For each pattern detected:
- You need at least 2 supporting data points from the decision history
- The alert_message must be SPECIFIC with numbers, categories, and estimated costs
- Do NOT generate a pattern without evidence in the data
- confidence must reflect data quality (low data = low confidence)

Example of a GOOD alert_message:
"You are about to hire 3 engineers. The last 3 times you hired during a growth phase, actual time-to-productivity was 6.2 months vs your 3-month estimate. This pattern has cost approximately $140K in misallocated runway. Add a 10-week buffer to your Q2 plan."

Example of a BAD alert_message (too generic):
"You may have optimism bias in your timelines. Consider adding buffer time."

Respond with ONLY valid JSON:
{
  "patterns": [
    {
      "pattern_type": "optimism_inflation"|"avoidance"|"recency_bias"|"confirmation_bias"|"risk_aversion"|"sunk_cost",
      "alert_message": string (specific, quantified, actionable),
      "confidence": number (0-100),
      "detection_data": {
        "decision_ids": string[],
        "data_points": string[],
        "quantified_cost": number|null,
        "pattern_description": string
      }
    }
  ]
}

If no patterns are detected with sufficient evidence, return: { "patterns": [] }`;
}
