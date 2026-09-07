import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { processSignalsForProfile } from "@/lib/signals/signal-processor";
import { PIPELINE_ENV, requireEnv } from "@/lib/env";
import { logEvent, EVENTS } from "@/lib/analytics/log-event";
import type { Profile, CeoContext, Decision } from "@/types/database";

/**
 * POST /api/signals/refresh — the "Refresh Signals" button on /signals.
 *
 * This route used to fetch candidates and insert them directly, which meant it
 * bypassed the five-category gate entirely: raw NewsAPI articles landed in the
 * feed with no category and no what-happened/why-it-matters/what-to-consider.
 * It now delegates to processSignalsForProfile, the same path the ingest cron
 * uses, so the button and the cron cannot drift apart again.
 *
 * It also used to report a missing NEWSAPI_KEY as "0 new signals" — a silent
 * failure indistinguishable from a quiet news day. Two things fix that: a
 * requireEnv assertion up front, and a hard error if no source returned a
 * single candidate.
 */

const BUDGET_MS = 50_000; // 50s budget — fetching + gating takes time

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Fail loudly on a misconfigured environment instead of returning an
    // empty, successful-looking response.
    requireEnv(PIPELINE_ENV, "Signal refresh");

    if (!process.env.NEWSAPI_KEY) {
      // Not fatal — the curated RSS sources still work — but it halves the
      // candidate pool, so it should never pass unnoticed.
      console.warn("[refresh] NEWSAPI_KEY is not set — RSS sources only.");
    }

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
    let totalCandidates = 0;
    let profilesProcessed = 0;
    let profilesAttempted = 0;
    const failures: string[] = [];

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
          geography_detail: contextRow?.geography_detail ?? profile.geography ?? null,
          past_decision_regrets: contextRow?.past_decision_regrets ?? [],
          arr_band: contextRow?.arr_band ?? null,
          created_at: contextRow?.created_at ?? new Date().toISOString(),
          updated_at: contextRow?.updated_at ?? new Date().toISOString(),
        };

        const { data: recentDecisions } = await adminSupabase
          .from("decisions").select("*").eq("profile_id", profile.id)
          .order("created_at", { ascending: false }).limit(5);

        console.log(`[refresh] Running pipeline for ${profile.company_name}...`);
        profilesAttempted++;

        // Fetch → five-category gate → insert survivors. Anything that does
        // not map to a category with a non-obvious consequence is discarded
        // before it reaches the database.
        const result = await processSignalsForProfile(
          profile,
          context,
          (recentDecisions ?? []) as Decision[]
        );

        totalCandidates += result.candidatesFetched;
        totalSignalsAdded += result.signalsSurfaced;

        if (result.signalsSurfaced > 0) {
          await logEvent(profile.id, EVENTS.signal_refreshed, {
            signals_added: result.signalsSurfaced,
            candidates_fetched: result.candidatesFetched,
            company: profile.company_name,
          });
        }

        profilesProcessed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[refresh] Error for profile ${profile.id}:`, msg);
        failures.push(msg);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[refresh] Done — ${totalCandidates} candidates → ${totalSignalsAdded} surfaced, ${profilesProcessed} profiles, ${elapsed}ms`
    );

    // Every source returning nothing is a broken pipeline, not a quiet day.
    // Surfacing zero AFTER fetching candidates is a legitimate outcome;
    // fetching zero candidates in the first place never is.
    if (profilesAttempted > 0 && totalCandidates === 0) {
      return NextResponse.json(
        {
          error:
            "No candidates were fetched from any source. Check NEWSAPI_KEY and outbound network access — this is a configuration problem, not an empty news day.",
        },
        { status: 502 }
      );
    }

    // A profile that threw must not be reported as a clean run. Without this,
    // a failed database insert looked exactly like "the gate discarded
    // everything" and the button said "No new signals found".
    if (failures.length > 0 && totalSignalsAdded === 0) {
      return NextResponse.json(
        { error: failures[0], failures: failures.length },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      signalsAdded: totalSignalsAdded,
      candidatesFetched: totalCandidates,
      profilesProcessed,
      ...(failures.length > 0 ? { partialFailures: failures.length } : {}),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[POST /api/signals/refresh]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
