import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
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

    // Look up existing consequence for this signal + profile
    const { data: consequence, error } = await supabase
      .from("consequences")
      .select("*")
      .eq("signal_id", signalId)
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }

    if (!consequence) {
      return NextResponse.json(null);
    }

    return NextResponse.json({
      consequenceId: consequence.id,
      soWhat: consequence.so_what ?? consequence.primary_impact,
      ifYouAct: consequence.secondary_impact ?? "",
      ifYouDont: consequence.tertiary_risk ?? "",
      immediateAction: consequence.action_recommendation,
      status: consequence.status,
      confidence_score: consequence.confidence_score,
    });
  } catch (error) {
    console.error("[GET /api/signals/[id]/consequence]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
