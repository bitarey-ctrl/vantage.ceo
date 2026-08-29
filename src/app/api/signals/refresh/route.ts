import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { fetchPerplexitySignals } from "@/lib/signals/perplexity";
import { runConsequencePipeline } from "@/lib/ai/consequence-mapper";
import { logEvent, EVENTS } from "@/lib/analytics/log-event";
import type { Profile, CeoContext, Decision } from "@/types/database";

const BUDGET_MS = 50_000; // 50s budget — web fetch + Claude takes time

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const secret = request.headers.get("X-VANTAGE-SECRET");
    const isSecretAuth = secret === (process.env.VANTAGE_INGEST_SECRET ?? "vantage-secret-2026");

    const adminSupabase = await createAdminClient();
    let profileIds: string[] | null = null;

    if (!isSecretAuth) {
      const userSupabase = await createClient();
      const { data: { user }, error: authError } = await userSupabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      profileIds = [user.id];
    }

    let profileQuery = adminSupabase.from("profiles").select("*");
    if (profileIds) profileQuery = profileQuery.in("id", profileIds);
    const { data: profiles, error: profilesError } = await profileQuery;

    if (profilesError || !profiles || profiles.length === 0) {
      return NextResponse.json({ success: true, signalsAdded: 0, profilesProcessed: 0, message: "No profiles found" });
    }

    let totalSignalsAdded = 0;
    let profilesProcessed = 0;

    for (const profile of profiles as Profile[]) {
      if (Date.now() - startTime >= BUDGET_MS) {
        console.log("[refresh] Budget exhausted — stopping");
        break;
      }

      try {
        if (!profile.company_name) {
          console.log(`[refresh] Skipping ${profile.id}: no company_name`);
          continue;
        }

        const { data: contextRow } = await adminSupabase
          .from("ceo_context").select("*").eq("profile_id", profile.id).maybeSingle();

        const context: CeoContext = {
          id: contextRow?.id ?? "",
          profile_id: profile.id,
          strategic_priorities: contextRow?.strategic_priorities ?? [],
          revenue_model: contextRow?.revenue_model ?? profile.business_model ?? "B2B SaaS",
          monthly_revenue_range: contextRow?.monthly_revenue_range ?? profile.revenue_range ?? "undisclosed",
          competitors: contextRow?.competitors ?? [],
          avoided_decision: contextRow?.avoided_decision ?? null,
          avoided_decision_stated_reason: contextRow?.avoided_decision_stated_reason ?? null,
          sector: contextRow?.sector ?? profile.industry ?? "B2B SaaS",
          sector_tags: contextRow?.sector_tags ?? [],
          geography_detail: contextRow?.geography_detail ?? profile.geography ?? "Turkey",
          past_decision_regrets: contextRow?.past_decision_regrets ?? [],
          created_at: contextRow?.created_at ?? new Date().toISOString(),
          updated_at: contextRow?.updated_at ?? new Date().toISOString(),
        };

        const { data: recentDecisions } = await adminSupabase
          .from("decisions").select("*").eq("profile_id", profile.id)
          .order("created_at", { ascending: false }).limit(5);

        console.log(`[refresh] Fetching signals for ${profile.company_name}...`);
        console.log(`[refresh] DIAGNOSTICS:`);
        console.log(`[refresh]   - NEWSAPI_KEY set: ${!!process.env.NEWSAPI_KEY}`);
        console.log(`[refresh]   - Sector: ${context.sector}`);
        console.log(`[refresh]   - Geography: ${context.geography_detail}`);
        console.log(`[refresh]   - Competitors: ${context.competitors.length}`);
        let fetchedSignals: Awaited<ReturnType<typeof fetchPerplexitySignals>> = [];
        try {
          fetchedSignals = await fetchPerplexitySignals(context, profile.company_name);
        } catch (err) {
          console.error(`[refresh] fetchPerplexitySignals failed:`, err);
          profilesProcessed++;
          continue;
        }

        if (fetchedSignals.length === 0) {
          console.log(`[refresh] No signals returned for ${profile.company_name}`);
          profilesProcessed++;
          continue;
        }

        console.log(`[refresh] Got ${fetchedSignals.length} signals for ${profile.company_name}`);

        // ── DEDUPLICATION ─────────────────────────────────────────────
        // Check which titles already exist in the DB to avoid inserting duplicates
        const titles = fetchedSignals.map((s) => s.title);
        const { data: existingSignals } = await adminSupabase
          .from("signals")
          .select("title")
          .in("title", titles);

        const existingTitles = new Set((existingSignals ?? []).map((s) => s.title as string));
        const newSignals = fetchedSignals.filter((s) => !existingTitles.has(s.title));

        if (newSignals.length === 0) {
          console.log(`[refresh] All ${fetchedSignals.length} signals already exist — skipping insert`);
          profilesProcessed++;
          continue;
        }

        console.log(`[refresh] Inserting ${newSignals.length} new signals (${fetchedSignals.length - newSignals.length} duplicates skipped)`);
        // ──────────────────────────────────────────────────────────────

        const { data: insertedSignals, error: signalError } = await adminSupabase
          .from("signals")
          .insert(newSignals.map((s) => ({
            source: "perplexity" as const,
            title: s.title,
            content: s.content,
            url: s.url,
            published_at: s.published_at,
          })))
          .select("id, title, content");

        if (signalError || !insertedSignals) {
          console.error(`[refresh] Signal insert failed:`, signalError?.message);
          profilesProcessed++;
          continue;
        }

        totalSignalsAdded += insertedSignals.length;
        await logEvent(profile.id, EVENTS.signal_refreshed, { signals_added: insertedSignals.length, company: profile.company_name });

        // Triage each signal (don't run full consequence pipeline on refresh — let user trigger that)
        for (const signal of insertedSignals) {
          if (Date.now() - startTime >= BUDGET_MS) break;

          try {
            // Just save the triage — user will click Analyse for full consequence mapping
            await adminSupabase.from("signal_triages").upsert({
              signal_id: signal.id,
              profile_id: profile.id,
              relevant: true,
              relevance_score: 70,
              relevance_reason: "Fetched as relevant signal for this profile",
            });
          } catch (err) {
            console.error(`[refresh] Triage failed for signal ${signal.id}:`, err);
          }
        }

        profilesProcessed++;
      } catch (err) {
        console.error(`[refresh] Error for profile ${profile.id}:`, err);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[refresh] Done — ${totalSignalsAdded} signals added, ${profilesProcessed} profiles, ${elapsed}ms`);

    return NextResponse.json({ success: true, signalsAdded: totalSignalsAdded, profilesProcessed });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[POST /api/signals/refresh]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
