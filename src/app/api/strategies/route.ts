import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Strategy, StrategyStatus } from "@/types/database";

const STRATEGY_STATUSES: StrategyStatus[] = [
  "considering",
  "deciding",
  "decided",
  "archived",
];

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const signalId = searchParams.get("signalId");
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);

    let query = supabase
      .from("strategies")
      .select("*, signal:signals(id, title)")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status && STRATEGY_STATUSES.includes(status as StrategyStatus)) {
      query = query.eq("status", status);
    }

    if (signalId) {
      query = query.eq("signal_id", signalId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[GET /api/strategies]", error);
      return NextResponse.json({ error: "Failed to fetch strategies" }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("[GET /api/strategies]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Partial<Strategy>;

    if (!body.title?.trim() || !body.description?.trim()) {
      return NextResponse.json(
        { error: "title and description are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("strategies")
      .insert({
        profile_id: user.id,
        signal_id: body.signal_id ?? null,
        title: body.title.trim(),
        description: body.description.trim(),
        timeline_30d: body.timeline_30d ?? null,
        timeline_90d: body.timeline_90d ?? null,
        timeline_6m: body.timeline_6m ?? null,
        cost_of_inaction: body.cost_of_inaction ?? null,
        status: "considering",
      })
      .select()
      .single();

    if (error || !data) {
      console.error("[POST /api/strategies]", error);
      return NextResponse.json({ error: "Failed to create strategy" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("[POST /api/strategies]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
