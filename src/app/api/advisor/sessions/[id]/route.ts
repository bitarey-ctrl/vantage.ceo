import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { saveConversation } from "@/lib/advisor/sessions";

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
  expectedUpdatedAt?: string;
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

/**
 * PATCH /api/advisor/sessions/[id]
 *   { title }                                  rename (owner only)
 *   { messages, expectedUpdatedAt }            replace messages only if unchanged since expectedUpdatedAt
 * Messages without expectedUpdatedAt are refused (428): this endpoint used to overwrite newer history silently.
 * The only remaining caller is the legacy /advisor page, which now redirects to /app.
 */
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
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const body = (await request.json().catch(() => null)) as PatchBody | null;
    if (!body || (body.messages === undefined && body.title === undefined)) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
    if (body.messages !== undefined && !body.expectedUpdatedAt) {
      return NextResponse.json({ error: "Messages were not saved: include expectedUpdatedAt so newer history is never overwritten." }, { status: 428 });
    }
    if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim() || body.title.length > 180)) {
      return NextResponse.json({ error: "Use a title of 1–180 characters." }, { status: 400 });
    }
    // Owner-scoped through the user's own session (row-level security) plus the explicit profile filter.
    if (body.messages !== undefined) {
      const saved = await saveConversation(supabase, user.id, id, body.expectedUpdatedAt!, body.messages);
      if (saved.status !== 200) return NextResponse.json({ error: saved.error }, { status: saved.status });
      if (body.title === undefined) return NextResponse.json(saved.row);
    }
    const { data, error } = await supabase
      .from("advisor_sessions")
      .update({ title: body.title!.trim(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("profile_id", user.id)
      .select()
      .maybeSingle<SessionRow>();
    if (error) return NextResponse.json({ error: "The title could not be saved." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "The conversation could not be updated." }, { status: 500 });
  }
}
