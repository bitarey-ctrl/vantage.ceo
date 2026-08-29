import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

interface SessionRow {
  id: string;
  profile_id: string;
  title: string;
  messages: unknown;
  created_at: string;
  updated_at: string;
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("advisor_sessions")
      .select("id, title, created_at, updated_at")
      .eq("profile_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(30);

    if (error) {
      if (error.message?.includes("relation") || error.message?.includes("does not exist")) {
        return NextResponse.json([]);
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as { title?: string };
    const admin = await createAdminClient();

    const { data, error } = await admin
      .from("advisor_sessions")
      .insert({
        profile_id: user.id,
        title: body.title ?? "New conversation",
        messages: [],
      })
      .select()
      .single<SessionRow>();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
