/**
 * POST /api/cron/ingest
 *
 * Scheduled signal ingestion for all active profiles.
 * Runs via Vercel Cron (vercel.json) — every 6 hours.
 * Protected by CRON_SECRET header.
 *
 * Flow:
 *   1. Verify cron secret
 *   2. Fetch all profiles with completed onboarding + ceo_context
 *   3. Run full signal pipeline for each profile in sequence
 *   4. Return summary
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { processSignalsForProfile } from '@/lib/signals/signal-processor';
import { backfillTriagesForProfile } from '@/lib/signal-linking/backfill';
import { orderByLeastRecentlyServed, markProfileIngested } from '@/lib/ingest-queue/order';

// Vercel Hobby caps a function at 60s. Declaring 300 did not buy time — it
// meant the loop was killed mid-flight with nothing written and no report.
// Declare the real ceiling and stop ourselves just under it instead.
export const maxDuration = 60;

// Leave room to finish the in-flight profile and return a response.
const BUDGET_MS = 50_000;

export async function POST(request: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createAdminClient();
  const startedAt = Date.now();

  try {
    // ── Fetch eligible profiles ──────────────────────────────────────────
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .eq('onboarding_completed', true);

    if (profilesError || !profiles?.length) {
      return NextResponse.json({
        processed: 0,
        message: 'No eligible profiles found',
      });
    }

    // ── Fetch CEO contexts for all profiles ──────────────────────────────
    const profileIds = profiles.map((p) => p.id);
    const { data: contexts } = await supabase
      .from('ceo_context')
      .select('*')
      .in('profile_id', profileIds);

    const contextMap = new Map(
      (contexts ?? []).map((c) => [c.profile_id, c])
    );

    // ── Run pipeline per profile ─────────────────────────────────────────
    const results: { profileId: string; signalsProcessed: number; consequencesGenerated: number; error?: string }[] = [];

    // Least-recently-served first, so a profile cut off by the budget leads
    // tomorrow's queue instead of being starved every morning. Never-served
    // profiles (a brand new signup) sort to the very front.
    const queue = await orderByLeastRecentlyServed(profiles);

    let servedCount = 0;
    let deferredCount = 0;

    for (const profile of queue) {
      if (Date.now() - startedAt >= BUDGET_MS) {
        // Not an error: these lead the next run by construction.
        deferredCount = queue.length - servedCount;
        console.log(`[cron/ingest] Budget reached — ${deferredCount} profile(s) deferred to the next run`);
        break;
      }
      servedCount++;

      // Link gated signals this profile is missing, regardless of whether it
      // has a context to ingest FOR. The pipeline's dedupe is global while
      // visibility is per-profile, so without this a profile that was never
      // the active one during an ingest stays empty forever.
      try {
        await backfillTriagesForProfile(profile.id);
      } catch (err) {
        console.error(`[cron/ingest] Backfill failed for ${profile.id}:`, err);
      }

      const context = contextMap.get(profile.id);
      if (!context) {
        results.push({ profileId: profile.id, signalsProcessed: 0, consequencesGenerated: 0, error: 'No CEO context' });
        continue;
      }

      try {
        // Get recent decisions for context-aware processing
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentDecisions } = await supabase
          .from('decisions')
          .select('*')
          .eq('profile_id', profile.id)
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false });

        const result = await processSignalsForProfile(
          profile,
          context,
          recentDecisions ?? []
        );

        // Served — go to the back of the queue.
        await markProfileIngested(profile.id);

        results.push({
          profileId: profile.id,
          signalsProcessed: result.signalsProcessed,
          consequencesGenerated: result.consequencesGenerated,
        });
      } catch (err) {
        console.error(`[cron/ingest] Failed for profile ${profile.id}:`, err);
        results.push({
          profileId: profile.id,
          signalsProcessed: 0,
          consequencesGenerated: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const totalSignals = results.reduce((sum, r) => sum + r.signalsProcessed, 0);
    const totalConsequences = results.reduce((sum, r) => sum + r.consequencesGenerated, 0);
    const elapsedMs = Date.now() - startedAt;

    console.log(
      `[cron/ingest] Done — ${totalSignals} signals, ${totalConsequences} consequences, ` +
        `${servedCount}/${queue.length} profiles served, ${deferredCount} deferred, ${elapsedMs}ms`
    );

    return NextResponse.json({
      profilesEligible: queue.length,
      profilesProcessed: servedCount,
      profilesDeferred: deferredCount,
      totalSignalsProcessed: totalSignals,
      totalConsequencesGenerated: totalConsequences,
      elapsedMs,
      results,
    });
  } catch (error) {
    console.error('[cron/ingest] Fatal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
