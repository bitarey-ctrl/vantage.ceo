import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { runConsequencePipeline } from "@/lib/ai/consequence-mapper";
import { logEvent, EVENTS } from "@/lib/analytics/log-event";
import type { Profile, CeoContext, Decision, Consequence } from "@/types/database";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: signalId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Return existing analysis if already done
    const { data: existing } = await supabase
      .from("consequences")
      .select("id, so_what, primary_impact, secondary_impact, tertiary_risk, action_recommendation, status, confidence_score")
      .eq("signal_id", signalId)
      .eq("profile_id", user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        consequenceId: existing.id,
        soWhat: existing.so_what ?? existing.primary_impact,
        ifYouAct: existing.secondary_impact ?? "Position ahead of this market shift.",
        ifYouDont: existing.tertiary_risk ?? "Risk falling behind as the market evolves.",
        immediateAction: existing.action_recommendation,
        status: existing.status,
        confidence_score: existing.confidence_score,
      });
    }

    // Fetch the raw signal
    const { data: signal, error: signalError } = await supabase
      .from("signals")
      .select("id, title, content, source")
      .eq("id", signalId)
      .single();

    if (signalError || !signal) {
      console.error("[analyse] Signal not found:", signalId, signalError?.message);
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }

    const adminSupabase = await createAdminClient();

    // Fetch profile
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("[analyse] Profile not found:", profileError?.message);
      return NextResponse.json({ error: "Profile not found — complete your profile first" }, { status: 404 });
    }

    // Fetch ceo_context (optional — use defaults if missing)
    const { data: contextRow } = await adminSupabase
      .from("ceo_context")
      .select("*")
      .eq("profile_id", user.id)
      .maybeSingle();

    const context: CeoContext = {
      id: contextRow?.id ?? "",
      profile_id: user.id,
      strategic_priorities: contextRow?.strategic_priorities ?? [],
      revenue_model: contextRow?.revenue_model ?? profile.business_model ?? "B2B SaaS",
      monthly_revenue_range: contextRow?.monthly_revenue_range ?? profile.revenue_range ?? "undisclosed",
      competitors: contextRow?.competitors ?? [],
      avoided_decision: contextRow?.avoided_decision ?? null,
      avoided_decision_stated_reason: contextRow?.avoided_decision_stated_reason ?? null,
      sector: contextRow?.sector ?? profile.industry ?? "technology",
      sector_tags: contextRow?.sector_tags ?? [],
      geography_detail: contextRow?.geography_detail ?? profile.geography ?? "Turkey",
      past_decision_regrets: contextRow?.past_decision_regrets ?? [],
      created_at: contextRow?.created_at ?? new Date().toISOString(),
      updated_at: contextRow?.updated_at ?? new Date().toISOString(),
    };

    const { data: recentDecisions } = await adminSupabase
      .from("decisions")
      .select("*")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    console.log(`[analyse] Running pipeline for signal: "${signal.title}" | Company: ${profile.company_name}`);

    // Run consequence pipeline
    let triageResult: { relevant: boolean; relevance_score: number; relevance_reason: string };
    let consequenceResult: {
      primary_impact: string;
      secondary_impact: string;
      tertiary_risk: string;
      action_recommendation: string;
      urgency_window: string;
      urgency_days: number;
      confidence_score: number;
      impact_matrix: Consequence["impact_matrix"];
      consequence_horizons: Consequence["consequence_horizons"];
    } | null;

    try {
      const result = await runConsequencePipeline(
        signal.id,
        signal.title,
        signal.content,
        profile as Profile,
        context,
        (recentDecisions ?? []) as Decision[]
      );
      triageResult = result.triageResult;
      consequenceResult = result.consequenceResult;
    } catch (pipelineError) {
      const msg = pipelineError instanceof Error ? pipelineError.message : String(pipelineError);
      console.error("[analyse] Pipeline error:", msg);
      return NextResponse.json(
        { error: `AI analysis failed: ${msg.slice(0, 200)}` },
        { status: 500 }
      );
    }

    // Save triage
    await adminSupabase.from("signal_triages").upsert({
      signal_id: signal.id,
      profile_id: user.id,
      relevant: triageResult.relevant,
      relevance_score: triageResult.relevance_score,
      relevance_reason: triageResult.relevance_reason,
    });

    if (!consequenceResult) {
      // This branch means the consequence-mapping call itself failed — it is
      // NOT a relevance judgement. Everything reaching this route already
      // passed the five-category gate at ingestion, so the old copy here
      // ("background noise ... relevance 100/100") described a state that
      // cannot exist and blamed the user's signal for an AI failure.
      return NextResponse.json(
        {
          error:
            "We couldn't complete the analysis for this signal. This is usually temporary — try again in a moment.",
        },
        { status: 422 }
      );
    }

    // Save consequence
    const { data: saved, error: saveError } = await adminSupabase
      .from("consequences")
      .insert({
        signal_id: signal.id,
        profile_id: user.id,
        so_what: consequenceResult.primary_impact,
        primary_impact: consequenceResult.primary_impact,
        secondary_impact: consequenceResult.secondary_impact ?? null,
        tertiary_risk: consequenceResult.tertiary_risk ?? null,
        action_recommendation: consequenceResult.action_recommendation,
        urgency_window: consequenceResult.urgency_window,
        urgency_days: consequenceResult.urgency_days,
        confidence_score: consequenceResult.confidence_score,
        impact_matrix: consequenceResult.impact_matrix,
        consequence_horizons: consequenceResult.consequence_horizons ?? [],
        status: "pending",
      })
      .select("id")
      .single();

    if (saveError || !saved) {
      const msg = saveError?.message ?? "Unknown error";
      console.error("[analyse] Save failed:", msg);
      return NextResponse.json({ error: `Failed to save analysis: ${msg}` }, { status: 500 });
    }

    console.log(`[analyse] Success — consequence saved: ${saved.id}`);
    await logEvent(user.id, EVENTS.signal_analysed, { signal_id: signalId, signal_title: signal.title, relevance_score: triageResult.relevance_score });

    return NextResponse.json({
      consequenceId: saved.id,
      soWhat: consequenceResult.primary_impact,
      ifYouAct: consequenceResult.secondary_impact ?? "Position ahead of this shift.",
      ifYouDont: consequenceResult.tertiary_risk ?? "Risk falling behind competitors.",
      immediateAction: consequenceResult.action_recommendation,
      status: "pending",
      confidence_score: consequenceResult.confidence_score,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[POST /api/signals/[id]/analyse] Unhandled error:", msg);
    return NextResponse.json({ error: `Analysis failed: ${msg.slice(0, 200)}` }, { status: 500 });
  }
}
