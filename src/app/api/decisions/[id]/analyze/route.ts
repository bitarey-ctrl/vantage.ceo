import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadCompanyContext } from "@/lib/company-context/load";
import { logEvent, EVENTS } from "@/lib/analytics/log-event";
import { analyzeBlindSpots } from "@/lib/decisions/blind-spots";

export const maxDuration = 60;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const { data: decision, error: fetchError } = await supabase
      .from("decisions")
      .select("id, title, description, rationale, confidence, known_context, open_questions")
      .eq("id", id)
      .eq("profile_id", user.id)
      .single();

    if (fetchError || !decision) {
      return NextResponse.json({ error: "Decision not found" }, { status: 404 });
    }

    // The same validated business context as the Advisor and signals (no team size posing as a business model).
    const company = await loadCompanyContext(supabase, user.id);

    const result = await analyzeBlindSpots({
      title: decision.title,
      description: decision.description,
      rationale: decision.rationale,
      confidence: decision.confidence,
      knownContext: decision.known_context,
      openQuestions: decision.open_questions,
      business: {
        companyName: company.companyName,
        industry: company.sector,
        companyStage: company.stage,
        // Unconfirmed values are not passed as facts.
        businessModel: company.flags.some((f) => f.field === "ceo_context.revenue_model" && f.action === "confirm") ? null : company.revenueModel,
        geography: company.geography.join(", ") || null,
        revenueRange: company.revenueRange,
      },
    });

    // When the input is too thin to analyze, clear any stale blind spots and
    // tell the client to show the "not enough context" state.
    const blindSpots = result.analyzable ? result.blindSpots : [];

    const { error: updateError } = await supabase
      .from("decisions")
      .update({ blind_spots: blindSpots, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("profile_id", user.id);

    if (updateError) {
      console.error("[POST /api/decisions/[id]/analyze]", updateError);
      return NextResponse.json({ error: "Failed to save analysis" }, { status: 500 });
    }

    await logEvent(user.id, EVENTS.blind_spot_scan, {
      decision_id: id,
      count: blindSpots.length,
      analyzable: result.analyzable,
    });

    if (!result.analyzable) {
      return NextResponse.json({ analyzable: false, reason: result.reason });
    }

    return NextResponse.json({ analyzable: true, blind_spots: blindSpots });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    console.error("[POST /api/decisions/[id]/analyze]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
