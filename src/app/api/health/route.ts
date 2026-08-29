import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { calculateHealthScore } from '@/lib/ai/health-scorer';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await createAdminClient();
    const latest = request.nextUrl.searchParams.get('latest') === 'true';

    if (latest) {
      // Try to get the most recent saved score
      const { data: latestScore } = await admin
        .from('health_scores')
        .select('*')
        .eq('profile_id', user.id)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .single();

      if (latestScore) {
        return NextResponse.json({
          score: latestScore.score,
          delta: latestScore.delta,
          rationale: latestScore.rationale,
        });
      }

      // No score yet — return a sensible default, never 404
      return NextResponse.json({
        score: 50,
        delta: 0,
        rationale: 'Generating your first health assessment. Click Generate Brief to begin.',
      });
    }

    // Full recalculation path
    const [profileResult, contextResult] = await Promise.all([
      admin.from('profiles').select('*').eq('id', user.id).single(),
      admin.from('ceo_context').select('*').eq('profile_id', user.id).single(),
    ]);

    if (profileResult.error || !profileResult.data) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profile = profileResult.data;
    const context = contextResult.data ?? null;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentDecisions } = await admin
      .from('decisions')
      .select('*')
      .eq('profile_id', user.id)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false });

    const { data: activeBlindSpots } = await admin
      .from('blind_spot_patterns')
      .select('*')
      .eq('profile_id', user.id)
      .eq('is_active', true);

    const { count: pendingRecommendationsCount } = await admin
      .from('recommendations')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', user.id)
      .eq('status', 'pending');

    const result = await calculateHealthScore(
      profile,
      context,
      recentDecisions ?? [],
      activeBlindSpots ?? [],
      pendingRecommendationsCount ?? 0,
      0
    );

    const { data: previousScore } = await admin
      .from('health_scores')
      .select('score')
      .eq('profile_id', user.id)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();

    const delta = previousScore ? result.score - previousScore.score : 0;

    await admin.from('health_scores').insert({
      profile_id: user.id,
      score: result.score,
      delta,
      rationale: result.rationale,
      components: result.components,
      calculated_at: new Date().toISOString(),
    });

    return NextResponse.json({ score: result.score, delta, rationale: result.rationale });
  } catch (error) {
    console.error('[GET /api/health]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
