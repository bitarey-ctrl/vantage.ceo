import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data: decision, error } = await supabase
      .from('decisions')
      .select('*')
      .eq('id', id)
      .eq('profile_id', user.id)
      .single();

    if (error || !decision) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    }

    return NextResponse.json(decision);
  } catch (error) {
    console.error('[GET /api/decisions/[id]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      title,
      description,
      rationale,
      confidence,
      knownContext,
      openQuestions,
      deadline,
      status,
      blind_spots,
    } = body as {
      title?: string;
      description?: string | null;
      rationale?: string;
      confidence?: string;
      knownContext?: string | null;
      openQuestions?: string | null;
      deadline?: string | null;
      status?: string;
      blind_spots?: unknown;
    };

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('decisions')
      .select('id, status')
      .eq('id', id)
      .eq('profile_id', user.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    }

    if (status !== undefined && !['open', 'decided', 'archived'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be open, decided, or archived' },
        { status: 400 }
      );
    }

    if (confidence !== undefined && !['confident', 'torn', 'exploring'].includes(confidence)) {
      return NextResponse.json(
        { error: 'confidence must be confident, torn, or exploring' },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description;
    if (rationale !== undefined) updates.rationale = rationale.trim();
    if (confidence !== undefined) updates.confidence = confidence;
    if (knownContext !== undefined) updates.known_context = knownContext?.trim() || null;
    if (openQuestions !== undefined) updates.open_questions = openQuestions?.trim() || null;
    if (deadline !== undefined) updates.deadline = deadline || null;
    if (blind_spots !== undefined) updates.blind_spots = blind_spots;
    if (status !== undefined) {
      updates.status = status;
      if (status === 'decided' && existing.status !== 'decided') {
        updates.outcome_reviewed_at = new Date().toISOString();
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('decisions')
      .update(updates)
      .eq('id', id)
      .eq('profile_id', user.id)
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: 'Failed to update decision' }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[PATCH /api/decisions/[id]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('decisions')
      .select('id')
      .eq('id', id)
      .eq('profile_id', user.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    }

    // Soft delete: set status to archived
    const { data: archived, error: updateError } = await supabase
      .from('decisions')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('profile_id', user.id)
      .select()
      .single();

    if (updateError || !archived) {
      return NextResponse.json({ error: 'Failed to archive decision' }, { status: 500 });
    }

    return NextResponse.json(archived);
  } catch (error) {
    console.error('[DELETE /api/decisions/[id]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
