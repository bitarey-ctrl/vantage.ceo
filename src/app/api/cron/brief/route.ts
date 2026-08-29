/**
 * POST /api/cron/brief
 *
 * Scheduled daily brief generation for all active profiles.
 * Runs via Vercel Cron (vercel.json) — every morning at 07:00 UTC.
 * Protected by CRON_SECRET header.
 *
 * Runs AFTER /api/cron/ingest so consequences are fresh.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { generateDailyBrief } from '@/lib/ai/brief-generator';

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
      return NextResponse.json({ profilesProcessed: 0, message: 'No eligible profiles' });
    }

    const profileIds = profiles.map((p) => p.id);

    const { data: contexts } = await supabase
      .from('ceo_context')
      .select('*')
      .in('profile_id', profileIds);

    const contextMap = new Map((contexts ?? []).map((c) => [c.profile_id, c]));

    const results: { profileId: string; briefId?: string; error?: string }[] = [];

    for (const profile of profiles) {
      const context = contextMap.get(profile.id);
      if (!context) {
        results.push({ profileId: profile.id, error: 'No CEO context' });
        continue;
      }

      try {
        const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const [consequencesRes, decisionsRes, blindSpotsRes, prevScoreRes] = await Promise.all([
          supabase
            .from('consequences')
            .select('*')
            .eq('profile_id', profile.id)
            .gte('created_at', fortyEightHoursAgo)
            .is('brief_id', null),
          supabase
            .from('decisions')
            .select('*')
            .eq('profile_id', profile.id)
            .gte('created_at', sevenDaysAgo)
            .order('created_at', { ascending: false }),
          supabase
            .from('blind_spot_patterns')
            .select('*')
            .eq('profile_id', profile.id)
            .eq('is_active', true),
          supabase
            .from('health_scores')
            .select('score')
            .eq('profile_id', profile.id)
            .order('calculated_at', { ascending: false })
            .limit(1)
            .single(),
        ]);

        const pendingConsequences = consequencesRes.data ?? [];
        const recentDecisions = decisionsRes.data ?? [];
        const activeBlindSpots = blindSpotsRes.data ?? [];
        const previousHealthScore = prevScoreRes.data?.score ?? null;

        const briefResult = await generateDailyBrief(
          profile,
          context,
          pendingConsequences,
          recentDecisions,
          activeBlindSpots,
          previousHealthScore
        );

        const { data: createdBrief, error: briefError } = await supabase
          .from('briefs')
          .insert({
            profile_id: profile.id,
            type: 'daily',
            health_score: briefResult.health_score,
            health_score_delta: briefResult.health_score_delta,
            health_score_rationale: briefResult.health_score_rationale,
            top_signals: briefResult.top_signals,
            required_actions: briefResult.required_actions,
            generated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (briefError || !createdBrief) {
          results.push({ profileId: profile.id, error: 'Brief insert failed' });
          continue;
        }

        // Tag consequences as used in this brief
        if (pendingConsequences.length > 0) {
          await supabase
            .from('consequences')
            .update({ brief_id: createdBrief.id })
            .in('id', pendingConsequences.map((c) => c.id));
        }

        // Insert recommendations
        if (briefResult.required_actions?.length > 0) {
          await supabase.from('recommendations').insert(
            briefResult.required_actions.map((action) => ({
              profile_id: profile.id,
              brief_id: createdBrief.id,
              description: action.description,
              time_window: action.time_window,
              category: action.category,
              linked_consequence_id: action.linked_consequence_id ?? null,
              status: 'pending',
              created_at: new Date().toISOString(),
            }))
          );
        }

        results.push({ profileId: profile.id, briefId: createdBrief.id });
      } catch (err) {
        console.error(`[cron/brief] Failed for profile ${profile.id}:`, err);
        results.push({
          profileId: profile.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const elapsedMs = Date.now() - startedAt;
    const successCount = results.filter((r) => r.briefId).length;

    console.log(`[cron/brief] Done — ${successCount}/${profiles.length} briefs generated, ${elapsedMs}ms`);

    return NextResponse.json({
      profilesProcessed: profiles.length,
      briefsGenerated: successCount,
      elapsedMs,
      results,
    });
  } catch (error) {
    console.error('[cron/brief] Fatal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
