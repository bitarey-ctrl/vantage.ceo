import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logEvent, EVENTS } from '@/lib/analytics/log-event';
import { ensureProfileExists } from '@/lib/auth/ensure-profile';

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

/*
 * Validation rejections return 400 BEFORE the insert, so they never reach the
 * decision_create_failed branch — the previous build would have recorded
 * nothing at all for them. Record the reason and the payload shape (lengths
 * and flags, never the typed content) so a rejection is as visible as a
 * database error.
 */
async function rejectCreate(
  profileId: string,
  reason: string,
  shape: Record<string, unknown>
) {
  console.error(`[POST /api/decisions] Rejected for ${profileId}: ${reason}`, shape);
  await logEvent(profileId, 'decision_create_rejected', { reason, payload_shape: shape });
  return NextResponse.json({ error: reason, reason }, { status: 400 });
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

    // Shape of what actually arrived — the single most useful thing to have
    // when a report says "all the fields were filled in".
    const shape = {
      title_type: typeof title,
      title_len: typeof title === 'string' ? title.trim().length : null,
      description_type: typeof description,
      description_len: typeof description === 'string' ? description.trim().length : null,
      rationale_type: typeof rationale,
      rationale_len: typeof rationale === 'string' ? rationale.trim().length : null,
      confidence_value: confidence ?? null,
      has_deadline: Boolean(deadline),
      source: source ?? null,
    };

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return rejectCreate(user.id, 'title is required', shape);
    }
    if (title.trim().length > 120) {
      return rejectCreate(user.id, 'title must be 120 characters or fewer', shape);
    }
    if (!description || typeof description !== 'string' || description.trim().length < 30) {
      return rejectCreate(user.id, 'description must be at least 30 characters', shape);
    }
    if (!rationale || typeof rationale !== 'string' || rationale.trim().length < 20) {
      return rejectCreate(user.id, 'rationale must be at least 20 characters', shape);
    }
    if (!confidence || !['confident', 'torn', 'exploring'].includes(confidence)) {
      return rejectCreate(user.id, 'confidence must be confident, torn, or exploring', shape);
    }

    const resolvedSource =
      source && ['signal', 'strategy', 'manual'].includes(source) ? source : 'manual';

    // decisions.profile_id is a FK to profiles.id, and a profiles row is not
    // guaranteed: the creating trigger is AFTER INSERT ON auth.users, so it
    // never fired for accounts that predate it or that were repaired via
    // signup's update path. Without this the insert fails 23503.
    try {
      const repaired = await ensureProfileExists(user.id);
      if (repaired) {
        await logEvent(user.id, 'profile_row_repaired', { at: 'decisions.create' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[POST /api/decisions] ensureProfileExists failed:', msg);
      return NextResponse.json(
        { error: `Could not prepare your account: ${msg}` },
        { status: 500 }
      );
    }

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
      /*
       * DIAGNOSTIC, not decoration. This branch used to log the error server
       * side and return the bare string 'Failed to create decision' — which
       * is exactly the message reported from the field, and it carries zero
       * information. Four faithful reproductions (fresh auth user, all nine
       * real onboarding steps, real modal, localhost AND production) all
       * returned 201, so the failing input is something we have not
       * constructed. Three changes so the NEXT occurrence is self-explaining:
       *
       *   1. the real Postgres code/message/details/hint go back to the
       *      client, so the browser console and the modal both show it;
       *   2. the same detail plus the SHAPE of the payload (types and
       *      lengths, never the content) is written to feature_events, so a
       *      failure can be read out of the database afterwards even if
       *      nobody thinks to copy the console;
       *   3. it is logged as one structured line rather than an object that
       *      serialises to "{}".
       *
       * Returning driver errors to the client is a deliberate trade for a
       * pre-launch product with a handful of users. Reduce it to a code
       * before opening signup more widely.
       */
      const detail = {
        code: insertError?.code ?? null,
        message: insertError?.message ?? 'insert returned no row',
        details: insertError?.details ?? null,
        hint: insertError?.hint ?? null,
      };

      console.error(
        `[POST /api/decisions] Insert failed for profile ${user.id}: ` +
          `${detail.message} (code ${detail.code ?? 'none'}; details ${detail.details ?? 'none'}; hint ${detail.hint ?? 'none'})`
      );

      // Shape only — never the text the user typed.
      await logEvent(user.id, 'decision_create_failed', {
        ...detail,
        payload_shape: {
          title_len: title.trim().length,
          description_len: description.trim().length,
          rationale_len: rationale.trim().length,
          confidence,
          source: resolvedSource,
          has_deadline: Boolean(deadline),
          has_known_context: Boolean(knownContext && knownContext.trim()),
          has_open_questions: Boolean(openQuestions && openQuestions.trim()),
          source_id_present: sourceId !== undefined && sourceId !== null,
        },
      });

      return NextResponse.json(
        {
          error: `Could not create the decision: ${detail.message}`,
          code: detail.code,
          details: detail.details,
          hint: detail.hint,
        },
        { status: 500 }
      );
    }

    await logEvent(user.id, EVENTS.decision_logged, { decision_id: decision.id, category: decision.category });

    return NextResponse.json(decision, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[POST /api/decisions] Unhandled:', msg);
    return NextResponse.json(
      { error: `Could not create the decision: ${msg}` },
      { status: 500 }
    );
  }
}
