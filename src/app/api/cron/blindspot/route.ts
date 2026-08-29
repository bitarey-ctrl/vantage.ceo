/**
 * POST /api/cron/blindspot
 *
 * Scheduled blind spot detection for all active profiles.
 * Runs via Vercel Cron (vercel.json) — daily at midnight UTC.
 * Protected by CRON_SECRET header.
 *
 * Flow:
 *   1. Verify cron secret
 *   2. Fetch all profiles with completed onboarding + ceo_context
 *   3. For each profile: pull all decisions + run blind spot detection
 *   4. Deactivate stale patterns, insert new ones
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { detectBlindSpots } from '@/lib/ai/blind-spot-engine';

export const maxDuration = 300;

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
        profilesProcessed: 0,
        patternsDetected: 0,
        message: 'No eligible profiles found',
      });
    }

    const profileIds = profiles.map((p) => p.id);

    // ── Fetch CEO contexts ───────────────────────────────────────────────
    const { data: contexts } = await supabase
      .from('ceo_context')
      .select('*')
      .in('profile_id', profileIds);

    const contextMap = new Map(
      (contexts ?? []).map((c) => [c.profile_id, c])
    );

    const results: {
      profileId: string;
      patternsDetected: number;
      error?: string;
    }[] = [];

    for (const profile of profiles) {
      const context = contextMap.get(profile.id);
      if (!context) {
        results.push({ profileId: profile.id, patternsDetected: 0, error: 'No CEO context' });
        continue;
      }

      try {
        // Pull all decisions for pattern analysis (no time limit)
        const { data: allDecisions } = await supabase
          .from('decisions')
          .select('*')
          .eq('profile_id', profile.id)
          .order('created_at', { ascending: false });

        if (!allDecisions?.length) {
          results.push({ profileId: profile.id, patternsDetected: 0 });
          continue;
        }

        const detectedPatterns = await detectBlindSpots(
          allDecisions,
          context,
          profile.company_name ?? ''
        );

        if (detectedPatterns.length === 0) {
          results.push({ profileId: profile.id, patternsDetected: 0 });
          continue;
        }

        let inserted = 0;
        for (const pattern of detectedPatterns) {
          // Deactivate existing active patterns of the same type
          await supabase
            .from('blind_spot_patterns')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('profile_id', profile.id)
            .eq('pattern_type', pattern.pattern_type)
            .eq('is_active', true);

          // Insert fresh pattern
          const { error: insertError } = await supabase
            .from('blind_spot_patterns')
            .insert({
              profile_id: profile.id,
              pattern_type: pattern.pattern_type,
              alert_message: pattern.alert_message,
              confidence: pattern.confidence,
              detection_data: pattern.detection_data,
              is_active: true,
              detected_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

          if (!insertError) inserted++;
        }

        results.push({ profileId: profile.id, patternsDetected: inserted });
      } catch (err) {
        console.error(`[cron/blindspot] Failed for profile ${profile.id}:`, err);
        results.push({
          profileId: profile.id,
          patternsDetected: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const totalPatterns = results.reduce((sum, r) => sum + r.patternsDetected, 0);
    const elapsedMs = Date.now() - startedAt;

    console.log(`[cron/blindspot] Done — ${totalPatterns} patterns across ${profiles.length} profiles, ${elapsedMs}ms`);

    return NextResponse.json({
      profilesProcessed: profiles.length,
      patternsDetected: totalPatterns,
      elapsedMs,
      results,
    });
  } catch (error) {
    console.error('[cron/blindspot] Fatal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
