import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { logEvent, EVENTS } from "@/lib/analytics/log-event";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-5";

interface InternalJson {
  strategic_clarity: number;
  information_processing: number;
  risk_calibration: number;
  execution_followthrough: number;
  strengths: string;
  focus_area: string;
  detected_patterns: string[];
}

interface ExternalJson {
  company_growth_score: number;
  company_risk_score: number;
  company_execution_score: number;
  company_market_score: number;
  company_strengths: string;
  company_focus_area: string;
  external_evaluation: string;
  investor_ready_score: number;
}

interface AssessmentJson {
  internal: InternalJson;
  external: ExternalJson;
}

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [profileRes, signalsRes, strategiesRes, decisionsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("company_name, industry, company_stage")
        .eq("id", user.id)
        .single(),
      supabase
        .from("consequences")
        .select("*", { count: "exact", head: true })
        .eq("profile_id", user.id),
      supabase
        .from("strategies")
        .select("status, title")
        .eq("profile_id", user.id),
      supabase
        .from("decisions")
        .select("title, category, rationale, urgency_level, confidence_score, emotional_context, status, actual_outcome")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const profile = profileRes.data;
    const signalsReviewed = signalsRes.count ?? 0;
    const strategiesAccepted = strategiesRes.data?.filter((s) => s.status === "accepted").length ?? 0;
    const strategiesRejected = strategiesRes.data?.filter((s) => s.status === "rejected").length ?? 0;
    const decisions = decisionsRes.data ?? [];

    const decisionContext =
      decisions.length > 0
        ? decisions
            .map(
              (d) =>
                `- [${d.category ?? "unknown"}] "${d.title}" | Urgency: ${d.urgency_level} | Confidence: ${d.confidence_score}/5 | Rationale: ${d.rationale ?? "none given"}${d.emotional_context ? ` | Emotional factor: ${d.emotional_context}` : ""}${d.actual_outcome ? ` | Outcome: ${d.actual_outcome}` : ""} | Status: ${d.status}`
            )
            .join("\n")
        : "No decisions logged yet.";

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1800,
      messages: [
        {
          role: "user",
          content: `You are a strategic advisor conducting a dual assessment: one of the CEO's personal decision-making, one of the company's external health. Be specific and direct.

## CEO PROFILE
Company: ${profile?.company_name ?? "Unknown"} | Industry: ${profile?.industry ?? "Unknown"} | Stage: ${profile?.company_stage ?? "Unknown"}

## PLATFORM ACTIVITY
Signals analyzed: ${signalsReviewed}
Strategies accepted: ${strategiesAccepted} | Strategies rejected: ${strategiesRejected}

## DECISIONS LOGGED (most important):
${decisionContext}

## YOUR TASK
Produce two assessments:

INTERNAL — evaluate the CEO's personal decision-making patterns:
- strategic_clarity: quality and coherence of decision rationale (0-100)
- information_processing: data-driven vs emotion-driven (0-100)
- risk_calibration: urgency choices and confidence calibration (0-100)
- execution_followthrough: resolved vs pending decision ratio (0-100)
- strengths: 2-3 sentences on genuine CEO strengths from actual behavior
- focus_area: 2-3 sentences on the specific pattern needing improvement, with a decision example
- detected_patterns: 3 specific behavioral patterns with examples

EXTERNAL — evaluate the company's market health inferred from the decisions and context:
- company_growth_score: market traction and growth trajectory signals (0-100)
- company_risk_score: how well risks are being managed at the company level (0-100)
- company_execution_score: operational execution quality inferred from decision outcomes (0-100)
- company_market_score: market positioning and competitive awareness (0-100)
- company_strengths: 2-3 sentences on the company's strongest external signals
- company_focus_area: 2-3 sentences on the strategic gap the company needs to close
- external_evaluation: 3-4 sentences written as if a board member is speaking frankly about this company's trajectory
- investor_ready_score: overall investor readiness score (0-100)

Return JSON only — no markdown, no explanation:
{
  "internal": {
    "strategic_clarity": <number>,
    "information_processing": <number>,
    "risk_calibration": <number>,
    "execution_followthrough": <number>,
    "strengths": "<string>",
    "focus_area": "<string>",
    "detected_patterns": ["<string>", "<string>", "<string>"]
  },
  "external": {
    "company_growth_score": <number>,
    "company_risk_score": <number>,
    "company_execution_score": <number>,
    "company_market_score": <number>,
    "company_strengths": "<string>",
    "company_focus_area": "<string>",
    "external_evaluation": "<string>",
    "investor_ready_score": <number>
  }
}`,
        },
      ],
    });

    const raw = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[assessment/generate] No JSON in response:", raw.slice(0, 200));
      return NextResponse.json({ error: "Failed to parse assessment from AI response" }, { status: 500 });
    }

    let parsed: AssessmentJson;
    try {
      parsed = JSON.parse(jsonMatch[0]) as AssessmentJson;
    } catch (e) {
      console.error("[assessment/generate] JSON parse failed:", e);
      return NextResponse.json({ error: "Failed to parse assessment from AI response" }, { status: 500 });
    }

    const clamp = (n: unknown) => Math.min(100, Math.max(0, Math.round(Number(n) || 0)));
    const i = parsed.internal;
    const ext = parsed.external;

    const admin = await createAdminClient();
    const { data, error: insertError } = await admin
      .from("assessments")
      .insert({
        profile_id: user.id,
        strategic_clarity: clamp(i.strategic_clarity),
        information_processing: clamp(i.information_processing),
        risk_calibration: clamp(i.risk_calibration),
        execution_followthrough: clamp(i.execution_followthrough),
        strengths: i.strengths ?? "",
        focus_area: i.focus_area ?? "",
        detected_patterns: Array.isArray(i.detected_patterns) ? i.detected_patterns : [],
        company_growth_score: clamp(ext.company_growth_score),
        company_risk_score: clamp(ext.company_risk_score),
        company_execution_score: clamp(ext.company_execution_score),
        company_market_score: clamp(ext.company_market_score),
        company_strengths: ext.company_strengths ?? "",
        company_focus_area: ext.company_focus_area ?? "",
        external_evaluation: ext.external_evaluation ?? "",
        investor_ready_score: clamp(ext.investor_ready_score),
        assessment_type: "full",
      })
      .select()
      .single();

    if (insertError || !data) {
      const msg = insertError?.message ?? "Unknown database error";
      console.error("[assessment/generate] Insert failed:", msg);
      return NextResponse.json({ error: `Failed to save assessment: ${msg}` }, { status: 500 });
    }

    await logEvent(user.id, EVENTS.assessment_generated, { assessment_id: data.id });

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[POST /api/assessment/generate]", msg);
    return NextResponse.json({ error: `Assessment failed: ${msg.slice(0, 200)}` }, { status: 500 });
  }
}
