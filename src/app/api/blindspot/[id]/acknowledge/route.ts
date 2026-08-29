import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
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
      .from('blind_spot_patterns')
      .select('id')
      .eq('id', id)
      .eq('profile_id', user.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Blind spot pattern not found' }, { status: 404 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('blind_spot_patterns')
      .update({
        acknowledged_at: new Date().toISOString(),
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('profile_id', user.id)
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: 'Failed to acknowledge blind spot pattern' }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[PATCH /api/blindspot/[id]/acknowledge]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
