import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateDailyBrief } from '@/lib/ai/brief-generator';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch profile + ceo_context
    const [profileResult, contextResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('ceo_context').select('*').eq('profile_id', user.id).single(),
    ]);

    if (profileResult.error || !profileResult.data) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profile = profileResult.data;

    // If the user hasn't completed onboarding yet, build a minimal context
    // from profile fields so the brief generator never crashes on null.
    const context = contextResult.data ?? {
      id: '',
      profile_id: user.id,
      strategic_priorities: [],
      revenue_model: profile.business_model ?? '',
      monthly_revenue_range: profile.revenue_range ?? '',
      competitors: [],
      avoided_decision: null,
      avoided_decision_stated_reason: null,
      sector: profile.industry ?? '',
      sector_tags: [] as string[],
      geography_detail: profile.geography ?? '',
      past_decision_regrets: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Get pending consequences (last 48h, not yet in a brief)
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: pendingConsequences } = await supabase
      .from('consequences')
      .select('*')
      .eq('profile_id', user.id)
      .gte('created_at', fortyEightHoursAgo)
      .is('brief_id', null);

    // Get recent decisions (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentDecisions } = await supabase
      .from('decisions')
      .select('*')
      .eq('profile_id', user.id)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false });

    // Get active blind spots
    const { data: activeBlindSpots } = await supabase
      .from('blind_spot_patterns')
      .select('*')
      .eq('profile_id', user.id)
      .eq('is_active', true);

    // Get previous health score
    const { data: previousHealthScore } = await supabase
      .from('health_scores')
      .select('score')
      .eq('profile_id', user.id)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();

    // Generate the brief
    const briefResult = await generateDailyBrief(
      profile,
      context,
      pendingConsequences ?? [],
      recentDecisions ?? [],
      activeBlindSpots ?? [],
      previousHealthScore?.score ?? null
    );

    // Insert into briefs table
    const { data: createdBrief, error: briefError } = await supabase
      .from('briefs')
      .insert({
        profile_id: user.id,
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
      console.error('[POST /api/brief/generate] Brief insert error:', briefError);
      return NextResponse.json({ error: 'Failed to save brief' }, { status: 500 });
    }

    // Mark consequences as included in this brief
    if (pendingConsequences && pendingConsequences.length > 0) {
      const consequenceIds = pendingConsequences.map((c) => c.id);
      await supabase
        .from('consequences')
        .update({ brief_id: createdBrief.id })
        .in('id', consequenceIds);
    }

    // Insert recommendations for each required action
    if (briefResult.required_actions && briefResult.required_actions.length > 0) {
      const recommendations = briefResult.required_actions.map((action) => ({
        profile_id: user.id,
        brief_id: createdBrief.id,
        description: action.description,
        time_window: action.time_window,
        category: action.category,
        linked_consequence_id: action.linked_consequence_id ?? null,
        status: 'pending',
        created_at: new Date().toISOString(),
      }));

      await supabase.from('recommendations').insert(recommendations);
    }

    return NextResponse.json(createdBrief, { status: 201 });
  } catch (error) {
    console.error('[POST /api/brief/generate]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
