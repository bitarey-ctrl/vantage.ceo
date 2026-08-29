import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await createAdminClient();

    const [profileResult, contextResult] = await Promise.all([
      admin.from('profiles').select('*').eq('id', user.id).single(),
      admin.from('ceo_context').select('*').eq('profile_id', user.id).single(),
    ]);

    if (profileResult.error || !profileResult.data) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({
      profile: profileResult.data,
      context: contextResult.data ?? null,
    });
  } catch (error) {
    console.error('[GET /api/profile]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await createAdminClient();
    const body = await request.json() as { profile?: Record<string, unknown>; context?: Record<string, unknown> };
    const { profile: profileUpdates, context: contextUpdates } = body;

    let updatedProfile = null;
    let updatedContext = null;

    // Update profiles table
    if (profileUpdates && Object.keys(profileUpdates).length > 0) {
      const { data, error } = await admin
        .from('profiles')
        .update({ ...profileUpdates, updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .select()
        .single();

      if (error) {
        console.error('[PATCH /api/profile] profiles update failed:', error.code, error.message);
        return NextResponse.json({ error: 'Failed to update profile', detail: error.message }, { status: 500 });
      }
      updatedProfile = data;
    } else {
      const { data } = await admin.from('profiles').select('*').eq('id', user.id).single();
      updatedProfile = data;
    }

    // Upsert ceo_context table
    if (contextUpdates && Object.keys(contextUpdates).length > 0) {
      const { data, error } = await admin
        .from('ceo_context')
        .upsert(
          { ...contextUpdates, profile_id: user.id, updated_at: new Date().toISOString() },
          { onConflict: 'profile_id' }
        )
        .select()
        .single();

      if (error) {
        console.error('[PATCH /api/profile] ceo_context upsert failed:', error.code, error.message);
        return NextResponse.json({ error: 'Failed to update context', detail: error.message }, { status: 500 });
      }
      updatedContext = data;
    } else {
      const { data } = await admin.from('ceo_context').select('*').eq('profile_id', user.id).single();
      updatedContext = data ?? null;
    }

    return NextResponse.json({ profile: updatedProfile, context: updatedContext });
  } catch (error) {
    console.error('[PATCH /api/profile]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
