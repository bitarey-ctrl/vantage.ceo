import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("consequences")
      .select("signal_id, status, confidence_score, so_what, action_recommendation, secondary_impact, tertiary_risk, id")
      .eq("profile_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Build map: signal_id → minimal analysis preview
    const map: Record<string, {
      consequenceId: string;
      status: string;
      confidence_score: number | null;
      soWhat: string;
      ifYouAct: string;
      ifYouDont: string;
      immediateAction: string;
    }> = {};

    for (const row of data ?? []) {
      if (row.signal_id) {
        map[row.signal_id] = {
          consequenceId: row.id,
          status: row.status ?? "pending",
          confidence_score: row.confidence_score ?? null,
          soWhat: row.so_what ?? "",
          ifYouAct: row.secondary_impact ?? "",
          ifYouDont: row.tertiary_risk ?? "",
          immediateAction: row.action_recommendation ?? "",
        };
      }
    }

    return NextResponse.json(map);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
