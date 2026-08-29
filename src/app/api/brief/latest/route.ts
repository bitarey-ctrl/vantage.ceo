import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import type { Consequence, SignalView } from '@/types/database';

function toSignalView(c: Consequence): SignalView {
  return {
    id: c.id,
    signalTitle: (c.signal as { title?: string } | null)?.title ?? 'Untitled Signal',
    soWhat: c.so_what,
    primaryImpact: c.primary_impact,
    secondaryImpact: c.secondary_impact ?? undefined,
    tertiaryRisk: c.tertiary_risk ?? undefined,
    actionRecommendation: c.action_recommendation,
    urgencyDays: c.urgency_days,
    confidenceScore: c.confidence_score,
    impactMatrix: c.impact_matrix,
    status: c.status,
    sourceType: (c.signal as { source?: string } | null)?.source ?? 'unknown',
    createdAt: c.created_at,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Get most recent brief
    const { data: brief } = await admin
      .from('briefs')
      .select('*')
      .eq('profile_id', user.id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    if (!brief) {
      return NextResponse.json({ topSignals: [], requiredActions: [], healthScore: null });
    }

    // Get consequences linked to this brief OR unlinked ones for this user (last 48h)
    // This handles the case where brief_id was not set during generation
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: consequences } = await admin
      .from('consequences')
      .select(`*, signal:signals(id, title, content, source, url, published_at, created_at)`)
      .eq('profile_id', user.id)
      .or(`brief_id.eq.${brief.id},and(brief_id.is.null,created_at.gte.${fortyEightHoursAgo})`)
      .order('confidence_score', { ascending: false })
      .limit(5);

    // Link any unlinked consequences to this brief
    const unlinked = (consequences ?? []).filter((c) => !c.brief_id);
    if (unlinked.length > 0) {
      await admin
        .from('consequences')
        .update({ brief_id: brief.id })
        .in('id', unlinked.map((c) => c.id));
    }

    // Get required actions for this brief
    const { data: requiredActions } = await admin
      .from('recommendations')
      .select('*')
      .eq('brief_id', brief.id)
      .eq('profile_id', user.id)
      .order('created_at', { ascending: true });

    const topSignals: SignalView[] = (consequences ?? []).map(toSignalView);

    return NextResponse.json({
      topSignals,
      requiredActions: (requiredActions ?? []).map((r) => ({
        description: r.description,
        time_window: r.time_window,
        category: r.category ?? '',
      })),
      healthScore: brief.health_score ?? undefined,
    });
  } catch (error) {
    console.error('[GET /api/brief/latest]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
