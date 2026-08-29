import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    const { error } = await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", user.id);

    if (error) {
      console.error("[POST /api/onboarding/complete]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/onboarding/complete]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
