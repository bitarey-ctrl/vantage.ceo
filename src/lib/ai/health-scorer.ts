import { callClaude } from "./claude";
import { buildHealthScorePrompt } from "./prompts/health";
import type { Profile, CeoContext, Decision, BlindSpotPattern, HealthScore } from "@/types/database";

interface HealthScoreResult {
  score: number;
  components: HealthScore["components"];
  rationale: string;
}

export async function calculateHealthScore(
  profile: Profile,
  context: CeoContext,
  recentDecisions: Decision[],
  activeBlindSpots: BlindSpotPattern[],
  pendingRecommendationsCount: number,
  unprocessedSignalsCount: number
): Promise<HealthScoreResult> {
  const prompt = buildHealthScorePrompt(
    profile,
    context,
    recentDecisions,
    activeBlindSpots,
    pendingRecommendationsCount,
    unprocessedSignalsCount
  );

  return callClaude<HealthScoreResult>(prompt, {
    maxTokens: 512,
  });
}
