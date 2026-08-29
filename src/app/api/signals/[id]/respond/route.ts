import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    const { status } = body;

    if (!status || !['accepted', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "accepted" or "rejected"' },
        { status: 400 }
      );
    }

    // Verify this consequence belongs to the user
    const { data: consequence, error: fetchError } = await supabase
      .from('consequences')
      .select('*')
      .eq('id', id)
      .eq('profile_id', user.id)
      .single();

    if (fetchError || !consequence) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
    }

    // Update consequence status
    const { data: updatedConsequence, error: updateError } = await supabase
      .from('consequences')
      .update({
        status,
        responded_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('profile_id', user.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update signal' }, { status: 500 });
    }

    // If accepted, create a recommendation record
    if (status === 'accepted') {
      await supabase.from('recommendations').insert({
        profile_id: user.id,
        consequence_id: id,
        description: consequence.action_recommendation,
        time_window: consequence.urgency_window,
        category: null,
        linked_consequence_id: id,
        status: 'accepted',
        created_at: new Date().toISOString(),
      });
    }

    return NextResponse.json(updatedConsequence);
  } catch (error) {
    console.error('[PATCH /api/signals/[id]/respond]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
