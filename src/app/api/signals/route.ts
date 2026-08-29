import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Consequence, SignalView } from '@/types/database';

/** Map a Consequence DB row → SignalView (camelCase, expected by StrategyCard and signals page) */
function toSignalView(c: Consequence): SignalView {
  return {
    id: c.id,
    signalTitle: c.signal?.title ?? 'Untitled Signal',
    soWhat: c.so_what,
    primaryImpact: c.primary_impact,
    secondaryImpact: c.secondary_impact ?? undefined,
    tertiaryRisk: c.tertiary_risk ?? undefined,
    actionRecommendation: c.action_recommendation,
    urgencyDays: c.urgency_days,
    confidenceScore: c.confidence_score,
    impactMatrix: c.impact_matrix,
    status: c.status,
    sourceType: c.signal?.source ?? 'unknown',
    createdAt: c.created_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    let query = supabase
      .from('consequences')
      .select(`
        *,
        signal:signals (
          id,
          title,
          content,
          source,
          url,
          published_at,
          created_at
        )
      `)
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && ['pending', 'accepted', 'rejected'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[GET /api/signals] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to fetch signals' }, { status: 500 });
    }

    // Map to camelCase SignalView shape expected by the frontend
    const signals: SignalView[] = (data ?? []).map(toSignalView);

    return NextResponse.json(signals);
  } catch (error) {
    console.error('[GET /api/signals]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
