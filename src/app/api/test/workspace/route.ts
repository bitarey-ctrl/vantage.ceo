import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { canAccess, getPlanAccess, type Plan } from '@/lib/plan';
import type { Signal, Decision, Profile, CeoContext, Strategy } from '@/types/database';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });
const text = z.string().trim().max(12000);
const optionalText = text.nullable().optional();
const option = z.object({
  description: z.string().max(6000), reasonRejected: z.string().max(6000),
  id: z.string().max(100).optional(), title: z.string().max(160).optional(),
  detail: z.string().max(3000).optional(), next: z.string().max(3000).optional(),
  reversible: z.string().max(300).optional(), feedback: z.string().max(300).optional(),
  comparisonChoice: z.object({ why: text, next: text, condition: text, review: z.string().max(30), saved: z.string().max(40) }).optional(),
}).passthrough();
const date = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).nullable().optional();
const decisionFields = z.object({
  title: z.string().trim().min(1).max(120).optional(), description: optionalText, rationale: text.optional(),
  known_context: optionalText, open_questions: optionalText, deadline: date,
  alternatives_considered: z.array(option).max(20).optional(),
  status: z.enum(['open', 'decided', 'archived']).optional(), actual_outcome: optionalText,
});
const command = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('create-decision'), input: decisionFields.extend({ title: z.string().trim().min(1).max(120), source: z.enum(['signal', 'strategy', 'manual']).optional(), source_id: z.string().uuid().nullable().optional() }) }),
  z.object({ operation: z.literal('update-decision'), id: z.string().uuid(), expectedUpdatedAt: z.string().max(100), input: decisionFields }),
  z.object({ operation: z.literal('save-session'), id: z.string().uuid(), expectedUpdatedAt: z.string().max(100), messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(40000) })).max(300) }),
  z.object({ operation: z.literal('company'), input: z.object({ company_name: z.string().trim().min(1).max(120), product_description: text, target_customer: text, additional_context: text }) }),
  z.object({ operation: z.literal('sign-out') }),
]);

async function account() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase, user: null, profile: null, access: null };
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Profile>();
  const access = getPlanAccess((profile?.plan ?? 'trial') as Plan, profile?.trial_ends_at ?? null);
  return { supabase, user, profile, access };
}

export async function GET() {
  try {
    const { supabase, user, profile, access } = await account();
    if (!user) return json({ error: 'Please sign in again.' }, 401);
    if (!profile) return json({ error: 'Your company profile could not be loaded. Open the current design to finish setup.' }, 409);
    const [context, decisions, strategies, sessions, triages] = await Promise.all([
      supabase.from('ceo_context').select('*').eq('profile_id', user.id).maybeSingle<CeoContext>(),
      supabase.from('decisions').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(150),
      supabase.from('strategies').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('advisor_sessions').select('id,title,created_at,updated_at').eq('profile_id', user.id).order('updated_at', { ascending: false }).limit(50),
      // Never fall back to the global signal table when this account's links fail.
      supabase.from('signal_triages').select('signal:signals(id,title,content,source,url,published_at,urgency,category,what_happened,why_it_matters,what_to_consider,created_at)').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(100),
    ]);
    const signals = new Map<string, Signal>();
    for (const row of triages.data ?? []) {
      const value = row.signal as unknown as Signal | null;
      if (value?.id) signals.set(value.id, value);
    }
    const errors: Record<string, string> = {};
    for (const [key, result] of Object.entries({ context, decisions, strategies, sessions, signals: triages })) {
      if (result.error) errors[key] = `Could not load ${key}. Please try again.`;
    }
    return json({ userId: user.id, profile, context: context.data, decisions: (decisions.data ?? []) as Decision[], strategies: (strategies.data ?? []) as Strategy[], sessions: sessions.data ?? [], signals: [...signals.values()], access, errors });
  } catch (error) {
    console.error('[comparison GET]', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'Your workspace could not be loaded. Please try again.' }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    let originHost = '';
    try { originHost = origin ? new URL(origin).host : ''; } catch { /* Reject malformed origins. */ }
    const requestHost = request.headers.get('host') || new URL(request.url).host;
    if (!originHost || originHost !== requestHost) return json({ error: 'This action must come from your VANTAGE workspace.' }, 403);
    if (Number(request.headers.get('content-length') ?? 0) > 300000) return json({ error: 'That update is too large.' }, 413);
    const { supabase, user, profile, access } = await account();
    if (!user) return json({ error: 'Please sign in again.' }, 401);
    if (!profile || !access) return json({ error: 'Finish your company setup first.' }, 409);
    const body = await request.text();
    if (body.length > 300000) return json({ error: 'That update is too large.' }, 413);
    let input: unknown;
    try { input = JSON.parse(body); } catch { return json({ error: 'That update could not be read.' }, 400); }
    const parsed = command.safeParse(input);
    if (!parsed.success) return json({ error: 'Check the fields and try again.', field: parsed.error.issues[0]?.path.join('.') }, 400);
    const cmd = parsed.data;
    if (cmd.operation === 'sign-out') {
      const { error } = await supabase.auth.signOut();
      return error ? json({ error: 'Could not sign out. Please try again.' }, 500) : json({ ok: true });
    }
    const feature = cmd.operation === 'save-session' ? 'ai_chat' : cmd.operation === 'company' ? 'profile' : 'decisions';
    if (!canAccess(feature, access)) return json({ error: 'Your current plan does not include this feature.' }, 403);
    if (cmd.operation === 'create-decision') {
      const { source = 'manual', source_id = null, ...fields } = cmd.input;
      if (source !== 'manual') {
        if (!source_id) return json({ error: 'Select the originating item again.' }, 400);
        const result = source === 'signal'
          ? await supabase.from('signal_triages').select('signal_id').eq('profile_id', user.id).eq('signal_id', source_id).limit(1)
          : await supabase.from('strategies').select('id').eq('profile_id', user.id).eq('id', source_id).limit(1);
        if (result.error || !result.data?.length) return json({ error: 'That item is unavailable in your workspace.' }, 404);
      }
      const { data, error } = await supabase.from('decisions').insert({
        title: fields.title, description: fields.description || null, rationale: '',
        known_context: fields.known_context || null, open_questions: fields.open_questions || null,
        deadline: fields.deadline || null, profile_id: user.id, source, source_id: source === 'manual' ? null : source_id,
        status: 'open', confidence: 'exploring',
      }).select().single<Decision>();
      return error || !data ? json({ error: 'Could not create your open decision. Your conversation is still saved.' }, 500) : json(data, 201);
    }
    if (cmd.operation === 'update-decision') {
      const { data: existing } = await supabase.from('decisions').select('id,status,updated_at,rationale,alternatives_considered').eq('id', cmd.id).eq('profile_id', user.id).maybeSingle();
      if (!existing) return json({ error: 'Decision not found.' }, 404);
      if (existing.updated_at !== cmd.expectedUpdatedAt) return json({ error: 'This decision changed in another view. Refresh before editing again.' }, 409);
      // Keep recorded history intact: this comparison can archive, but does not erase a choice to reopen it.
      if (existing.status === 'decided' && cmd.input.status === 'open') return json({ error: 'Keep this recorded choice and create a new decision to reconsider it.' }, 400);
      if (cmd.input.actual_outcome !== undefined && existing.status !== 'decided') return json({ error: 'Record a choice before reviewing its outcome.' }, 400);
      if (existing.status === 'decided' && (cmd.input.rationale !== undefined || cmd.input.alternatives_considered !== undefined)) return json({ error: 'Keep the recorded choice intact. Reconsider it in a new decision.' }, 400);
      if (cmd.input.status === 'decided' && !(cmd.input.rationale ?? existing.rationale ?? '').trim()) return json({ error: 'Record your reason for this choice.' }, 400);
      const recorded = Array.isArray(existing.alternatives_considered) && existing.alternatives_considered.some((item: Record<string, unknown>) => item.comparisonChoice);
      if (existing.status === 'archived' && recorded && cmd.input.status === 'open') return json({ error: 'Restore this recorded choice to Decided.' }, 400);
      const updates: Record<string, unknown> = { ...cmd.input, updated_at: new Date().toISOString() };
      if (cmd.input.deadline !== undefined) updates.deadline = cmd.input.deadline || null;
      if (cmd.input.actual_outcome !== undefined) updates.outcome_reviewed_at = new Date().toISOString();
      const { data, error } = await supabase.from('decisions').update(updates).eq('id', cmd.id).eq('profile_id', user.id).eq('updated_at', cmd.expectedUpdatedAt).select().maybeSingle<Decision>();
      return error ? json({ error: 'Could not save your decision.' }, 500) : !data ? json({ error: 'This decision changed. Refresh before editing again.' }, 409) : json(data);
    }
    if (cmd.operation === 'save-session') {
      const { data, error } = await supabase.from('advisor_sessions').update({ messages: cmd.messages, updated_at: new Date().toISOString() }).eq('id', cmd.id).eq('profile_id', user.id).eq('updated_at', cmd.expectedUpdatedAt).select().maybeSingle();
      return error ? json({ error: 'Could not save this conversation. Keep this page open and copy any unsaved reply.' }, 500) : !data ? json({ error: 'This conversation is unavailable or changed in another view. Refresh before continuing.' }, 409) : json(data);
    }
    const { error: profileError } = await supabase.from('profiles').update({ company_name: cmd.input.company_name, updated_at: new Date().toISOString() }).eq('id', user.id);
    if (profileError) return json({ error: 'Could not save your company name.' }, 500);
    const { error: contextError } = await supabase.from('ceo_context').upsert({ profile_id: user.id, product_description: cmd.input.product_description, target_customer: cmd.input.target_customer, additional_context: cmd.input.additional_context, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' });
    return contextError ? json({ error: 'Company name saved, but the other context could not be saved. Please try again.' }, 500) : json({ ok: true });
  } catch (error) {
    console.error('[comparison POST]', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'Could not complete that action. Please try again.' }, 500);
  }
}
