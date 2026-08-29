import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/signals/[id]/review
 *
 * Marks a signal as reviewed the first time its detail view is opened. Signals
 * are global, so reviewed_at lives on the signals row itself; it's set once and
 * never overwritten. Suppresses the "missed signal" nudge email for this signal.
 */
export async function POST(
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

    // Admin client: setting reviewed_at on the global signals row isn't covered
    // by the per-user RLS policies, and it's a safe, single-column write.
    const admin = await createAdminClient();
    const { error } = await admin
      .from("signals")
      .update({ reviewed_at: new Date().toISOString() })
      .eq("id", id)
      .is("reviewed_at", null);

    if (error) {
      console.error("[POST /api/signals/[id]/review]", error);
      return NextResponse.json({ error: "Failed to mark reviewed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/signals/[id]/review]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
