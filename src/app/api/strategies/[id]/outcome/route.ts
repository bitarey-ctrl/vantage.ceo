import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logEvent, EVENTS } from "@/lib/analytics/log-event";

type OutcomeStatus = 'worked' | 'didnt_work' | 'too_early' | 'unclear';
const VALID: OutcomeStatus[] = ['worked', 'didnt_work', 'too_early', 'unclear'];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as {
      outcome_status?: string;
      outcome_notes?: string;
    };

    if (!body.outcome_status || !VALID.includes(body.outcome_status as OutcomeStatus)) {
      return NextResponse.json(
        { error: "outcome_status must be one of: worked, didnt_work, too_early, unclear" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("strategies")
      .update({
        outcome_status: body.outcome_status,
        outcome_notes: body.outcome_notes?.trim() || null,
        outcome_recorded_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("profile_id", user.id)
      .select("id, outcome_status")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Strategy not found" },
        { status: 404 }
      );
    }

    // EVENTS.strategy_generated is the closest existing event; we log under
    // a custom event_type literal since we don't want to modify the events enum
    await logEvent(user.id, EVENTS.strategy_generated, {
      strategy_id: data.id,
      outcome_status: data.outcome_status,
      kind: 'outcome_recorded',
    });

    return NextResponse.json({ success: true, strategy: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PATCH /api/strategies/[id]/outcome]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
