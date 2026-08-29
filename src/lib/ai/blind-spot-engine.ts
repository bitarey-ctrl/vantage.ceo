import { callClaude } from "./claude";
import { buildBlindSpotPrompt } from "./prompts/blindspot";
import type { Decision, CeoContext, BlindSpotPattern } from "@/types/database";

interface DetectedPattern {
  pattern_type: BlindSpotPattern["pattern_type"];
  alert_message: string;
  confidence: number;
  detection_data: BlindSpotPattern["detection_data"];
}

interface BlindSpotDetectionResult {
  patterns: DetectedPattern[];
}

/**
 * Minimum decisions required before running blind spot detection.
 * Running on sparse data produces low-quality, noise patterns.
 */
const MIN_DECISIONS_FOR_DETECTION = 5;

/**
 * Minimum confidence threshold for surfacing a pattern to the CEO.
 * Below this, patterns are stored but not shown.
 */
const MIN_CONFIDENCE_TO_SURFACE = 60;

/**
 * Weekly blind spot detection run.
 * Takes decision history + context → returns patterns with evidence.
 *
 * Architecture note: This does NOT run per-signal. It runs once per week
 * on the full decision history. Pattern detection requires volume.
 */
export async function detectBlindSpots(
  decisions: Decision[],
  context: CeoContext,
  companyName: string
): Promise<DetectedPattern[]> {
  if (decisions.length < MIN_DECISIONS_FOR_DETECTION) {
    // Not enough data — return empty, no noise
    return [];
  }

  const prompt = buildBlindSpotPrompt(decisions, context, companyName);

  const result = await callClaude<BlindSpotDetectionResult>(prompt, {
    maxTokens: 2048,
  });

  // Filter to only high-confidence patterns
  return result.patterns.filter(
    (p) => p.confidence >= MIN_CONFIDENCE_TO_SURFACE
  );
}

/**
 * Checks if a decision being logged matches any known avoidance pattern.
 * Used in real-time during decision logging to surface immediate warnings.
 */
export function checkAvoidancePattern(
  decisions: Decision[],
  context: CeoContext
): string | null {
  const avoidedCategory = inferCategoryFromText(context.avoided_decision ?? '');
  if (!avoidedCategory) return null;

  const categoryDecisions = decisions.filter(
    (d) => d.category === avoidedCategory
  );
  const daysWithoutDecision = categoryDecisions.length > 0
    ? Math.floor(
        (Date.now() - new Date(categoryDecisions[0].created_at).getTime()) /
          86400000
      )
    : null;

  if (daysWithoutDecision !== null && daysWithoutDecision > 21) {
    return `No ${avoidedCategory} decisions in ${daysWithoutDecision} days. Pattern detected: avoidance in this category (stated reason: "${context.avoided_decision_stated_reason}").`;
  }

  return null;
}

function inferCategoryFromText(text: string): Decision["category"] | null {
  const lower = text.toLowerCase();
  if (lower.includes("hir") || lower.includes("team") || lower.includes("staffing"))
    return "hiring";
  if (lower.includes("pric") || lower.includes("revenue"))
    return "pricing";
  if (lower.includes("partner") || lower.includes("integrat"))
    return "partnerships";
  if (lower.includes("expand") || lower.includes("market") || lower.includes("launch"))
    return "expansion";
  if (lower.includes("product") || lower.includes("feature") || lower.includes("build"))
    return "product";
  if (lower.includes("regulat") || lower.includes("legal") || lower.includes("compliance"))
    return "regulatory";
  return null;
}
