import { NextResponse, after } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { backfillTriagesForProfile } from "@/lib/signal-linking/backfill";
import { ensureProfileExists } from "@/lib/auth/ensure-profile";
import { processSignalsForProfile } from "@/lib/signals/signal-processor";
import { markProfileIngested } from "@/lib/ingest-queue/order";
import type { Profile, CeoContext, Decision } from "@/types/database";

// The response returns immediately; the work below it runs in `after`, so give
// the function room to finish the ingest once the user has already moved on.
export const maxDuration = 60;

/**
 * POST /api/onboarding/complete
 *
 * Marks onboarding done and then, WITHOUT blocking the response, fills the
 * account so the first screen the user ever sees has something on it.
 *
 * Why this exists: signals only ever appeared after a manual refresh or the
 * next 05:00 cron. A CEO finishing onboarding therefore landed on an empty
 * Signals page — the worst possible first impression, and unrecoverable in a
 * first-run demo.
 *
 * Two stages, cheapest first:
 *   1. backfill — links signals that already passed the gate. Pure joins, no
 *      model calls, typically sub-second. This is what makes the page
 *      populated by the time they navigate there.
 *   2. full ingest — fetch + gate for this profile's own context. Slower
 *      (fan-out plus a Claude call) and it may add nothing on a quiet day,
 *      which is fine: stage 1 already delivered.
 *
 * `after` is the right primitive here rather than a floating promise: on
 * serverless, work not awaited and not registered can be killed the moment
 * the response is flushed. `after` keeps the invocation alive for it.
 */
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

    try {
      await ensureProfileExists(user.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[POST /api/onboarding/complete] ensureProfileExists failed:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // .select() so a zero-row update is detectable — it is not an error.
    const { data: updated, error } = await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", user.id)
      .select("id");

    if (error) {
      console.error("[POST /api/onboarding/complete]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      console.error(`[POST /api/onboarding/complete] Updated 0 rows for ${user.id}`);
      return NextResponse.json(
        { error: "Your profile could not be found. Please sign out and back in." },
        { status: 500 }
      );
    }

    const profileId = user.id;

    after(async () => {
      const startedAt = Date.now();

      // Stage 1 — instant. Never let this stage's failure stop stage 2.
      try {
        const linked = await backfillTriagesForProfile(profileId);
        console.log(
          `[onboarding] Linked ${linked.linked} existing signal(s) to ${profileId} ` +
            `in ${Date.now() - startedAt}ms`
        );
      } catch (err) {
        console.error("[onboarding] Backfill failed:", err);
      }

      // Stage 2 — this profile's own ingest, so the feed is not just the
      // shared pool. Admin client: the request's user session is gone by now.
      try {
        const admin = await createAdminClient();

        const { data: profileRow } = await admin
          .from("profiles")
          .select("*")
          .eq("id", profileId)
          .maybeSingle();

        if (!profileRow?.company_name) {
          console.log("[onboarding] No company_name — link-only, skipping ingest.");
          return;
        }

        const { data: contextRow } = await admin
          .from("ceo_context")
          .select("*")
          .eq("profile_id", profileId)
          .maybeSingle();

        const profile = profileRow as Profile;
        const context: CeoContext = {
          id: contextRow?.id ?? "",
          profile_id: profileId,
          strategic_priorities: contextRow?.strategic_priorities ?? [],
          revenue_model:
            contextRow?.revenue_model ?? profile.business_model ?? "B2B SaaS",
          monthly_revenue_range:
            contextRow?.monthly_revenue_range ?? profile.revenue_range ?? "undisclosed",
          competitors: contextRow?.competitors ?? [],
          avoided_decision: contextRow?.avoided_decision ?? null,
          avoided_decision_stated_reason:
            contextRow?.avoided_decision_stated_reason ?? null,
          sector: contextRow?.sector ?? profile.industry ?? "B2B SaaS",
          sector_tags: contextRow?.sector_tags ?? [],
          geography_detail: contextRow?.geography_detail ?? profile.geography ?? null,
          past_decision_regrets: contextRow?.past_decision_regrets ?? [],
          arr_band: contextRow?.arr_band ?? null,
          created_at: contextRow?.created_at ?? new Date().toISOString(),
          updated_at: contextRow?.updated_at ?? new Date().toISOString(),
        };

        const result = await processSignalsForProfile(profile, context, [] as Decision[]);
        await markProfileIngested(profileId);

        console.log(
          `[onboarding] Ingest for ${profileId}: ${result.candidatesFetched} candidates → ` +
            `${result.signalsSurfaced} surfaced, ${Date.now() - startedAt}ms total`
        );
      } catch (err) {
        // The account is already usable from stage 1, and the cron will pick
        // this profile up first tomorrow — it sorts as never-served.
        console.error("[onboarding] First ingest failed:", err);
      }
    });

    return NextResponse.json({ success: true, preparingSignals: true });
  } catch (error) {
    console.error("[POST /api/onboarding/complete]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
