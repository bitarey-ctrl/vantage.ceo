import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

interface FeedbackBody {
  rating?: number;
  category?: string;
  message: string;
  page?: string;
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

    const body = (await request.json()) as FeedbackBody;

    if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    if (body.message.length > 1000) {
      return NextResponse.json({ error: "message must be under 1000 characters" }, { status: 400 });
    }

    const admin = await createAdminClient();
    const { error: insertError } = await admin.from("feedback").insert({
      profile_id: user.id,
      rating: body.rating ?? null,
      category: body.category ?? null,
      message: body.message.trim(),
      page: body.page ?? null,
    });

    if (insertError) {
      console.error("[POST /api/feedback] Insert failed:", insertError.message);
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[POST /api/feedback]", msg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
