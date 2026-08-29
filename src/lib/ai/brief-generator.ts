import { callClaude } from "./claude";
import {
  buildDailyBriefPrompt,
  buildWeeklyBriefPrompt,
} from "./prompts/brief";
import type {
  Profile,
  CeoContext,
  Consequence,
  Decision,
  BlindSpotPattern,
  Brief,
} from "@/types/database";

interface DailyBriefResult {
  health_score: number;
  health_score_delta: number;
  health_score_rationale: string;
  top_signals: Brief["top_signals"];
  required_actions: Brief["required_actions"];
}

interface WeeklyBriefResult {
  weekly_summary: string;
}

export async function generateDailyBrief(
  profile: Profile,
  context: CeoContext,
  consequences: Consequence[],
  recentDecisions: Decision[],
  activeBlindSpots: BlindSpotPattern[],
  previousHealthScore: number | null
): Promise<DailyBriefResult> {
  const prompt = buildDailyBriefPrompt(
    profile,
    context,
    consequences,
    recentDecisions,
    activeBlindSpots,
    previousHealthScore
  );

  return callClaude<DailyBriefResult>(prompt, {
    maxTokens: 1500,
  });
}

export async function generateWeeklySummary(
  profile: Profile,
  context: CeoContext,
  weekDecisions: Decision[],
  weekConsequences: Consequence[],
  activeBlindSpots: BlindSpotPattern[],
  healthScoreHistory: number[]
): Promise<string> {
  const prompt = buildWeeklyBriefPrompt(
    profile,
    context,
    weekDecisions,
    weekConsequences,
    activeBlindSpots,
    healthScoreHistory
  );

  const result = await callClaude<WeeklyBriefResult>(prompt, {
    maxTokens: 512,
  });

  return result.weekly_summary;
}
