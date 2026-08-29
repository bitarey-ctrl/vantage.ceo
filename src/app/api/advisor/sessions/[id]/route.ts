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

interface PatchBody {
  messages?: unknown[];
  title?: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const { data, error } = await supabase
      .from("advisor_sessions")
      .select("*")
      .eq("id", id)
      .eq("profile_id", user.id)
      .single<SessionRow>();

    if (error) {
      if (error.message?.includes("relation") || error.message?.includes("does not exist")) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (!data) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const admin = await createAdminClient();
    const { error } = await admin
      .from("advisor_sessions")
      .delete()
      .eq("id", id)
      .eq("profile_id", user.id);

    if (error) {
      if (error.message?.includes("relation") || error.message?.includes("does not exist")) {
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json() as PatchBody;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.messages !== undefined) updates.messages = body.messages;
    if (body.title !== undefined) updates.title = body.title;

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("advisor_sessions")
      .update(updates)
      .eq("id", id)
      .eq("profile_id", user.id)
      .select()
      .single<SessionRow>();

    if (error) {
      if (error.message?.includes("relation") || error.message?.includes("does not exist")) {
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (!data) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
