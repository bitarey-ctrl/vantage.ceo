import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("assessments")
      .select("*")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      // No assessment yet — return null so the page shows the empty state
      return NextResponse.json(null);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[GET /api/assessment]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
