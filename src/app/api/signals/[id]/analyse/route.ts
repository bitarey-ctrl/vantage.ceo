/**
 * POST /api/signals/[id]/analyse  { force?: boolean }
 *
 * The only signal impact-analysis endpoint. Logic lives in src/lib/company-context/impact.ts: canonical company
 * context, this account's stored relevance assessment, versioned results (a stale analysis is never silently reused;
 * history is kept), numbers only from the stored calculation.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { runImpactAnalysis } from "@/lib/company-context/impact";
import { logEvent, EVENTS } from "@/lib/analytics/log-event";

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    let originHost = "";
    try { const o = request.headers.get("origin"); originHost = o ? new URL(o).host : ""; } catch { /* malformed */ }
    if (!originHost || originHost !== (request.headers.get("host") || new URL(request.url).host)) {
      return NextResponse.json({ error: "This action must come from your VANTAGE workspace." }, { status: 403 });
    }
    const { id: signalId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const force = Boolean(((await request.json().catch(() => ({}))) as { force?: boolean }).force);
    const admin = await createAdminClient();
    const result = await runImpactAnalysis({ supabase, admin, userId: user.id, signalId, force });
    if (result.status === 200 && !result.body.reused) await logEvent(user.id, EVENTS.signal_analysed, { signal_id: signalId });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ error: "Analysis failed. Nothing was changed. Try again in a moment." }, { status: 500 });
  }
}
