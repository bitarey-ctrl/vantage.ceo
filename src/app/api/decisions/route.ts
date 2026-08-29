import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logEvent, EVENTS } from '@/lib/analytics/log-event';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);

    let query = supabase
      .from('decisions')
      .select('*')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch decisions' }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('[GET /api/decisions]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      description,
      rationale,
      confidence,
      knownContext,
      openQuestions,
      deadline,
      source,
      sourceId,
    } = body as {
      title?: string;
      description?: string;
      rationale?: string;
      confidence?: string;
      knownContext?: string | null;
      openQuestions?: string | null;
      deadline?: string | null;
      source?: string;
      sourceId?: string | null;
    };

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (title.trim().length > 120) {
      return NextResponse.json({ error: 'title must be 120 characters or fewer' }, { status: 400 });
    }
    if (!description || typeof description !== 'string' || description.trim().length < 30) {
      return NextResponse.json(
        { error: 'description must be at least 30 characters' },
        { status: 400 }
      );
    }
    if (!rationale || typeof rationale !== 'string' || rationale.trim().length < 20) {
      return NextResponse.json(
        { error: 'rationale must be at least 20 characters' },
        { status: 400 }
      );
    }
    if (!confidence || !['confident', 'torn', 'exploring'].includes(confidence)) {
      return NextResponse.json(
        { error: 'confidence must be confident, torn, or exploring' },
        { status: 400 }
      );
    }

    const resolvedSource =
      source && ['signal', 'strategy', 'manual'].includes(source) ? source : 'manual';

    const { data: decision, error: insertError } = await supabase
      .from('decisions')
      .insert({
        profile_id: user.id,
        title: title.trim(),
        description: description.trim(),
        rationale: rationale.trim(),
        confidence,
        known_context: knownContext?.trim() || null,
        open_questions: openQuestions?.trim() || null,
        source: resolvedSource,
        source_id: sourceId ?? null,
        deadline: deadline || null,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !decision) {
      console.error('[POST /api/decisions] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create decision' }, { status: 500 });
    }

    await logEvent(user.id, EVENTS.decision_logged, { decision_id: decision.id, category: decision.category });

    return NextResponse.json(decision, { status: 201 });
  } catch (error) {
    console.error('[POST /api/decisions]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
