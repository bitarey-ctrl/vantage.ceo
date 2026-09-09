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

export const maxDuration = 300; // 5 min — allow time for all profiles

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

    for (const profile of profiles) {
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

    console.log(`[cron/ingest] Done — ${totalSignals} signals, ${totalConsequences} consequences, ${elapsedMs}ms`);

    return NextResponse.json({
      profilesProcessed: profiles.length,
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
