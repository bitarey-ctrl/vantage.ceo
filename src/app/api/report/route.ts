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
      .from("reports")
      .select("*")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[GET /api/report]", error);
      return NextResponse.json({ error: "Failed to fetch report" }, { status: 500 });
    }

    return NextResponse.json(data ?? null);
  } catch (error) {
    console.error("[GET /api/report]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
