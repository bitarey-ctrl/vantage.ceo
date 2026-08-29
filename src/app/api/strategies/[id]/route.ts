import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logEvent, EVENTS } from "@/lib/analytics/log-event";
import type { StrategyStatus } from "@/types/database";

const STRATEGY_STATUSES: StrategyStatus[] = [
  "considering",
  "deciding",
  "decided",
  "archived",
];

export async function GET(
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

    const { data, error } = await supabase
      .from("strategies")
      .select("*, signal:signals(id, title)")
      .eq("id", id)
      .eq("profile_id", user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[GET /api/strategies/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
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
    const body = (await request.json()) as { status?: string };

    if (!body.status || !STRATEGY_STATUSES.includes(body.status as StrategyStatus)) {
      return NextResponse.json(
        { error: "status must be considering, deciding, decided, or archived" },
        { status: 400 }
      );
    }

    const { data: existing, error: fetchError } = await supabase
      .from("strategies")
      .select("id")
      .eq("id", id)
      .eq("profile_id", user.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("strategies")
      .update({
        status: body.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("profile_id", user.id)
      .select()
      .single();

    if (error || !data) {
      console.error("[PATCH /api/strategies/[id]]", error);
      return NextResponse.json({ error: "Failed to update strategy" }, { status: 500 });
    }

    if (body.status === "decided") {
      await logEvent(user.id, EVENTS.strategy_accepted, { strategy_id: id });
    } else if (body.status === "archived") {
      await logEvent(user.id, EVENTS.strategy_rejected, { strategy_id: id });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[PATCH /api/strategies/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
