import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const latest = request.nextUrl.searchParams.get('latest') === 'true';

    if (latest) {
      const { data: brief, error } = await supabase
        .from('briefs')
        .select('*')
        .eq('profile_id', user.id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !brief) {
        return NextResponse.json({ error: 'No brief found' }, { status: 404 });
      }

      return NextResponse.json(brief);
    }

    const { data: briefs, error } = await supabase
      .from('briefs')
      .select('*')
      .eq('profile_id', user.id)
      .order('generated_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch briefs' }, { status: 500 });
    }

    return NextResponse.json(briefs ?? []);
  } catch (error) {
    console.error('[GET /api/brief]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
