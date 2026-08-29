import type { CeoContext, Profile, Consequence, Decision, BlindSpotPattern } from "@/types/database";

// ─── Safe accessors for user-supplied data ────────────────────────────────────
// The profile page saves strategic_priorities and competitors as plain strings.
// Onboarding may save them as arrays of objects. Both must be handled.

function normalizePriorities(raw: unknown): string {
  if (!raw) return 'Not specified';
  if (typeof raw === 'string') return raw.trim() || 'Not specified';
  if (Array.isArray(raw)) {
    const items = raw.map((p) => {
      if (typeof p === 'string') return p;
      const obj = p as Record<string, unknown>;
      return (obj.title ?? obj.text ?? obj.description ?? JSON.stringify(p)) as string;
    }).filter(Boolean);
    return items.length > 0 ? items.join('\n    ') : 'Not specified';
  }
  return String(raw);
}

function topPriority(raw: unknown): string {
  if (!raw) return 'Not set';
  if (typeof raw === 'string') {
    // Extract first line or first comma-separated item
    const first = raw.split(/[\n,]/)[0]?.trim();
    return first || 'Not set';
  }
  if (Array.isArray(raw) && raw.length > 0) {
    const p = raw[0];
    if (typeof p === 'string') return p;
    const obj = p as Record<string, unknown>;
    return (obj.title ?? obj.text ?? JSON.stringify(p)) as string;
  }
  return 'Not set';
}

function prioritiesShortList(raw: unknown, max: number): string {
  if (!raw) return 'Not set';
  if (typeof raw === 'string') {
    const items = raw.split(/[\n,]/).map(s => s.trim()).filter(Boolean).slice(0, max);
    return items.length > 0 ? items.join(' | ') : raw;
  }
  if (Array.isArray(raw)) {
    return raw.slice(0, max).map((p) => {
      if (typeof p === 'string') return p;
      const obj = p as Record<string, unknown>;
      return (obj.title ?? obj.text ?? JSON.stringify(p)) as string;
    }).join(' | ');
  }
  return String(raw);
}

export function buildDailyBriefPrompt(
  profile: Profile,
  context: CeoContext,
  consequences: Consequence[],
  recentDecisions: Decision[],
  activeBlindSpots: BlindSpotPattern[],
  previousHealthScore: number | null
): string {
  const consequencesSummary =
    consequences.length > 0
      ? consequences
          .slice(0, 5)
          .map(
            (c, i) =>
              `SIGNAL ${i + 1} (Urgency: ${c.urgency_days} days, Confidence: ${c.confidence_score}%):
  Primary: ${c.primary_impact}
  Action: ${c.action_recommendation}`
          )
          .join("\n\n")
      : "No new high-priority signals today.";

  const pendingDecisions = recentDecisions.filter((d) => d.status === "open");
  const blindSpotAlert =
    activeBlindSpots.length > 0 ? activeBlindSpots[0].alert_message : null;

  return `You are the brief generator for VANTAGE, a strategic intelligence platform.

Your job: Generate a CEO daily brief that is:
- 90 seconds to read
- Action-focused (not informational)
- Specific to THIS CEO's business
- Honest, including when things look bad

## CEO CONTEXT
Company: ${profile.company_name} | Industry: ${profile.industry}
Revenue: ${context?.monthly_revenue_range ?? 'Not specified'}
Top Priority Today: ${topPriority(context?.strategic_priorities)}
Previous Health Score: ${previousHealthScore ?? "First brief"}

## TODAY'S SIGNALS (${consequences.length} processed)
${consequencesSummary}

## PENDING DECISIONS (${pendingDecisions.length})
${pendingDecisions.slice(0, 3).map((d) => `- ${d.title} (${d.urgency_level} urgency)`).join("\n") || "None pending."}

## ACTIVE BLIND SPOT ALERT
${blindSpotAlert ?? "No active blind spot alerts."}

## YOUR TASK
Generate a daily brief with:
1. health_score (0-100): Synthesize all signals into a single company health number. Be honest — don't inflate.
2. health_score_delta: Change from ${previousHealthScore ?? 50} (positive = improving)
3. health_score_rationale: One sentence explaining the score
4. top_signals: Array of 2-4 most important signals (so_what must be ONE sentence answering "what does this mean for ${profile.company_name}?")
5. required_actions: 1-3 actions the CEO should take TODAY or THIS WEEK, ranked by cost-of-inaction

Respond with ONLY valid JSON:
{
  "health_score": number,
  "health_score_delta": number,
  "health_score_rationale": string,
  "top_signals": [
    {
      "consequence_id": string (use actual UUID from signals, or "none" if no specific signal),
      "signal_title": string,
      "so_what": string (ONE sentence: what this means for ${profile.company_name} specifically),
      "action_required": boolean,
      "urgency_days": number
    }
  ],
  "required_actions": [
    {
      "description": string (specific, executable, not generic),
      "time_window": string,
      "linked_consequence_id": string|null,
      "category": string
    }
  ]
}`;
}

export function buildWeeklyBriefPrompt(
  profile: Profile,
  context: CeoContext,
  weekDecisions: Decision[],
  weekConsequences: Consequence[],
  activeBlindSpots: BlindSpotPattern[],
  healthScoreHistory: number[]
): string {
  return `You are generating the weekly strategic digest for ${profile.company_name}.

## WEEK IN REVIEW
Decisions Made: ${weekDecisions.length}
Signals Processed: ${weekConsequences.length}
Health Score Trend: ${healthScoreHistory.join(" → ")}

## DECISIONS THIS WEEK
${weekDecisions.map((d) => `- [${d.category}] ${d.title} | Confidence: ${d.confidence_score}/5`).join("\n") || "No decisions logged this week."}

## ACTIVE BLIND SPOTS
${activeBlindSpots.map((b) => `- [${b.pattern_type}] ${b.alert_message} (confidence: ${b.confidence}%)`).join("\n") || "No active blind spot alerts."}

## CEO CONTEXT
Top 3 Priorities: ${prioritiesShortList(context?.strategic_priorities, 3)}
Avoided Decision: ${context?.avoided_decision ?? 'Not specified'}

Generate a weekly summary (3-4 sentences) covering:
1. What the most important strategic development was this week
2. What pattern is emerging that the CEO should watch
3. What the single most important thing to do in the coming week is

Keep it sharp. No corporate speak. This is an advisor speaking directly.

Respond with ONLY a JSON object:
{
  "weekly_summary": string
}`;
}
