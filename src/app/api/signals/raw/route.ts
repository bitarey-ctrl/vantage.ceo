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

    // Try via signal_triages first (this is the correct path once the table exists)
    const { data: triages, error: triageError } = await supabase
      .from("signal_triages")
      .select(`
        signal_id,
        signal:signals (
          id,
          title,
          content,
          source,
          url,
          published_at,
          urgency,
          category,
          what_happened,
          why_it_matters,
          what_to_consider,
          created_at
        )
      `)
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (triageError) {
      // Never fall back to an unscoped read: the service role bypasses row-level security and would show other
      // accounts' company-specific signals. Report the failure instead.
      console.error("[signals/raw] signal_triages read failed:", triageError.code ?? "unknown");
      return NextResponse.json({ error: "Your signals could not be loaded right now. Nothing was changed." }, { status: 503 });
    }

    // Extract unique signals for this user
    const seen = new Set<string>();
    const signals = [];
    for (const t of triages ?? []) {
      const s = t.signal as unknown as {
        id: string;
        title: string;
        content: string;
        source: string;
        url: string | null;
        published_at: string | null;
        urgency: string | null;
        category: string | null;
        what_happened: string | null;
        why_it_matters: string | null;
        what_to_consider: string | null;
        created_at: string;
      } | null;
      if (s && !seen.has(s.id)) {
        seen.add(s.id);
        signals.push(s);
      }
    }

    return NextResponse.json(signals);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[GET /api/signals/raw]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
