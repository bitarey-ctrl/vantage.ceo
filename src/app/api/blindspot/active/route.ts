import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectBlindSpots } from '@/lib/ai/blind-spot-engine';
import { logEvent, EVENTS } from '@/lib/analytics/log-event';

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: patterns, error } = await supabase
      .from('blind_spot_patterns')
      .select('*')
      .eq('profile_id', user.id)
      .eq('is_active', true)
      .order('confidence', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch blind spot patterns' }, { status: 500 });
    }

    return NextResponse.json(patterns ?? []);
  } catch (error) {
    console.error('[GET /api/blindspot/active]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(_request: NextRequest) {
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
    const context = contextResult.data ?? null;

    if (!context) {
      return NextResponse.json(
        { error: 'CEO context not configured. Please complete your profile setup.' },
        { status: 400 }
      );
    }

    // Get all decisions (no time limit) for pattern analysis
    const { data: allDecisions } = await supabase
      .from('decisions')
      .select('*')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false });

    // Run blind spot detection
    const detectedPatterns = await detectBlindSpots(
      allDecisions ?? [],
      context,
      profile.company_name ?? ''
    );

    if (detectedPatterns.length === 0) {
      await logEvent(user.id, EVENTS.blind_spot_scan, { patterns_detected: 0 });
      return NextResponse.json({
        patternsDetected: 0,
        patterns: [],
      });
    }

    // For each detected pattern: deactivate old ones of same type, insert new
    const upsertedPatterns = [];
    for (const pattern of detectedPatterns) {
      // Deactivate existing active patterns of the same type
      await supabase
        .from('blind_spot_patterns')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('profile_id', user.id)
        .eq('pattern_type', pattern.pattern_type)
        .eq('is_active', true);

      // Insert new pattern
      const { data: inserted, error: insertError } = await supabase
        .from('blind_spot_patterns')
        .insert({
          profile_id: user.id,
          pattern_type: pattern.pattern_type,
          alert_message: pattern.alert_message,
          confidence: pattern.confidence,
          detection_data: pattern.detection_data,
          is_active: true,
          detected_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!insertError && inserted) {
        upsertedPatterns.push(inserted);
      }
    }

    await logEvent(user.id, EVENTS.blind_spot_scan, { patterns_detected: upsertedPatterns.length });

    return NextResponse.json({
      patternsDetected: upsertedPatterns.length,
      patterns: upsertedPatterns,
    });
  } catch (error) {
    console.error('[POST /api/blindspot/active]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
