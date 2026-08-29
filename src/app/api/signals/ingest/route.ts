import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { mapConsequences } from '@/lib/ai/consequence-mapper';

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get('X-VANTAGE-SECRET');
    const isSecretAuth = secret === (process.env.VANTAGE_INGEST_SECRET ?? 'vantage-secret-2026');

    const adminSupabase = await createAdminClient();
    let profileId: string | null = null;

    if (!isSecretAuth) {
      const userSupabase = await createClient();
      const { data: { user }, error: authError } = await userSupabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      profileId = user.id;
    }

    const body = await request.json() as {
      title: string;
      content: string;
      source?: string;
      url?: string;
    };

    if (!body.title || !body.content) {
      return NextResponse.json({ error: 'title and content are required' }, { status: 400 });
    }

    // Insert signal using admin client (bypasses RLS)
    const { data: signal, error: signalError } = await adminSupabase
      .from('signals')
      .insert({
        source: (body.source ?? 'manual') as 'perplexity' | 'rss' | 'manual',
        title: body.title,
        content: body.content,
        url: body.url ?? null,
        published_at: new Date().toISOString(),
      })
      .select('id, title, content')
      .single();

    if (signalError || !signal) {
      console.error('[ingest] signal insert failed:', signalError);
      return NextResponse.json({ error: 'Failed to insert signal' }, { status: 500 });
    }

    // Get profiles to process
    let profileQuery = adminSupabase.from('profiles').select('*');
    if (profileId) {
      profileQuery = profileQuery.eq('id', profileId);
    }
    const { data: profiles } = await profileQuery;

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({
        success: true,
        signalId: signal.id,
        message: 'Signal stored. No profiles found.',
        consequencesGenerated: 0,
      });
    }

    let consequencesGenerated = 0;

    for (const profile of profiles) {
      const { data: context } = await adminSupabase
        .from('ceo_context')
        .select('*')
        .eq('profile_id', profile.id)
        .single();

      const { data: recentDecisions } = await adminSupabase
        .from('decisions')
        .select('*')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(5);

      // Build a safe context — fill missing fields with defaults
      // so the prompt never crashes on empty onboarding data
      const safeContext = {
        strategic_priorities: [],
        revenue_model: profile.business_model ?? 'B2B SaaS',
        monthly_revenue_range: profile.revenue_range ?? 'undisclosed',
        competitors: [],
        sector: profile.industry ?? 'technology',
        geography_detail: profile.geography ?? '',
        avoided_decision: null,
        avoided_decision_stated_reason: null,
        past_decision_regrets: [],
        ...(context ?? {}),
      };

      try {
        // Skip triage for manual signals — go straight to consequence mapping
        const consequenceResult = await mapConsequences(
          signal.title,
          signal.content,
          profile,
          safeContext,
          recentDecisions ?? []
        );

        if (consequenceResult) {
          const { error: consError } = await adminSupabase.from('consequences').insert({
            signal_id: signal.id,
            profile_id: profile.id,
            so_what: consequenceResult.primary_impact,
            primary_impact: consequenceResult.primary_impact,
            secondary_impact: consequenceResult.secondary_impact ?? null,
            tertiary_risk: consequenceResult.tertiary_risk ?? null,
            action_recommendation: consequenceResult.action_recommendation,
            urgency_window: consequenceResult.urgency_window,
            urgency_days: consequenceResult.urgency_days,
            confidence_score: consequenceResult.confidence_score,
            impact_matrix: consequenceResult.impact_matrix,
            consequence_horizons: consequenceResult.consequence_horizons ?? [],
            status: 'pending',
          });

          if (consError) {
            console.error('[ingest] consequence insert failed:', consError);
          } else {
            consequencesGenerated++;
          }
        }
      } catch (err) {
        console.error(`[ingest] pipeline failed for profile ${profile.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      signalId: signal.id,
      processed: profiles.length,
      consequencesGenerated,
    });

  } catch (error) {
    console.error('[POST /api/signals/ingest]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
