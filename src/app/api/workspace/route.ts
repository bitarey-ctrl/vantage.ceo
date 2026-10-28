import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { canAccess, getPlanAccess, type Plan } from '@/lib/plan';
import type { Signal, Decision, Profile, CeoContext, Strategy } from '@/types/database';
import {
  forClient, importDecisionVerdict, importPayload, isRealDate, lifecycleProblem, nextSignalPreference, normaliseSupport,
  signalAction, workspaceSupport, type CoreChange, type CoreState, type WorkspaceSupport,
} from '@/lib/workspace/contract';

/*
 * The main app's account API (also served at /api/test/workspace). Every read and write is scoped to the signed-in
 * account through the user's own Supabase session (row-level security) plus explicit ownership checks here.
 *
 * Durable state beyond the core decision columns lives in migration 039's tables. If they are missing, reads report
 * `durable.ready = false` and every write that needs them answers 503 — the app never falls back to browser-only saving.
 */
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });
const text = z.string().trim().max(12000);
const optionalText = text.nullable().optional();
const option = z.object({
  description: z.string().max(6000), reasonRejected: z.string().max(6000),
  id: z.string().max(100).optional(), title: z.string().max(160).optional(),
  detail: z.string().max(3000).optional(), next: z.string().max(3000).optional(),
  expected: z.string().max(3000).optional(), effort: z.string().max(300).optional(),
  fit: z.string().max(30).optional(), reversibility: z.string().max(30).optional(), needsReview: z.boolean().optional(),
  reversible: z.string().max(300).optional(), feedback: z.string().max(300).optional(),
  comparisonChoice: z.object({ why: text, next: text, condition: text, review: z.string().max(30), saved: z.string().max(40) }).optional(),
}).passthrough();
const date = z.union([z.string().refine(isRealDate, 'Use a real calendar date.'), z.literal('')]).nullable().optional();
const decisionFields = z.object({
  title: z.string().trim().min(1).max(120).optional(), description: optionalText, rationale: text.optional(),
  known_context: optionalText, open_questions: optionalText, deadline: date,
  alternatives_considered: z.array(option).max(20).optional(),
  status: z.enum(['open', 'decided', 'archived']).optional(), actual_outcome: optionalText,
});
const message = z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(40000), incomplete: z.boolean().optional() });
const command = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('create-decision'), input: decisionFields.extend({
    title: z.string().trim().min(1).max(120), source: z.enum(['signal', 'strategy', 'manual']).optional(), source_id: z.string().uuid().nullable().optional(),
    support: z.unknown().optional(), parentId: z.string().uuid().nullable().optional(), allowNew: z.boolean().optional() }) }),
  z.object({ operation: z.literal('update-decision'), id: z.string().uuid(), expectedUpdatedAt: z.string().max(100), input: decisionFields }),
  z.object({ operation: z.literal('save-decision'), id: z.string().uuid(), expectedUpdatedAt: z.string().max(100), expectedVersion: z.number().int().min(0),
    input: decisionFields.default({}), support: z.unknown().nullable().optional() }),
  z.object({ operation: z.literal('save-session'), id: z.string().uuid(), expectedUpdatedAt: z.string().max(100), messages: z.array(message).max(300) }),
  z.object({ operation: z.literal('link-session'), sessionId: z.string().uuid(), kind: z.enum(['decision', 'signal', 'strategy']), contextId: z.string().uuid() }),
  z.object({ operation: z.literal('signal-preference'), signalId: z.string().uuid(), action: signalAction, revision: z.string().trim().min(1).max(200), expectedVersion: z.number().int().min(0) }),
  z.object({ operation: z.literal('import-notes'), notes: importPayload }),
  z.object({ operation: z.literal('company'), input: z.object({ company_name: z.string().trim().min(1).max(120), product_description: text, target_customer: text, additional_context: text }) }),
  z.object({ operation: z.literal('sign-out') }),
]);

type Supabase = Awaited<ReturnType<typeof createClient>>;
type PgError = { code?: string; message?: string } | null;
const SCHEMA_MESSAGE = 'Saving decision notes, conversation links and signal preferences is not available yet: the account update has not been installed. Nothing was saved.';
const missingSchema = (error: PgError) => Boolean(error && (error.code === 'PGRST205' || error.code === 'PGRST202' || error.code === '42P01' || error.code === '42883'));
const historyViolation = (error: PgError) => Boolean(error && error.code === '23514');

async function account() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase, user: null, profile: null, access: null };
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Profile>();
  const access = getPlanAccess((profile?.plan ?? 'trial') as Plan, profile?.trial_ends_at ?? null);
  return { supabase, user, profile, access };
}

function workspaceView(row: { version: number; support: unknown; parent_decision_id: string | null; provenance: string; updated_at: string } | null) {
  return row ? { version: row.version, support: forClient(row.support), parentId: row.parent_decision_id, provenance: row.provenance, updatedAt: row.updated_at } : null;
}

export async function GET() {
  try {
    const { supabase, user, profile, access } = await account();
    if (!user) return json({ error: 'Please sign in again.' }, 401);
    if (!profile) return json({ error: 'Your company profile could not be loaded. Finish setup first.' }, 409);
    const [context, decisions, strategies, sessions, triages, analyses, workspaces, links, preferences] = await Promise.all([
      supabase.from('ceo_context').select('*').eq('profile_id', user.id).maybeSingle<CeoContext>(),
      supabase.from('decisions').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(150),
      supabase.from('strategies').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('advisor_sessions').select('id,title,created_at,updated_at').eq('profile_id', user.id).order('updated_at', { ascending: false }).limit(50),
      // Never fall back to the global signal table when this account's links fail.
      supabase.from('signal_triages').select('signal:signals(id,title,content,source,url,published_at,urgency,category,what_happened,why_it_matters,what_to_consider,created_at)').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('consequences').select('id,signal_id,so_what,primary_impact,secondary_impact,tertiary_risk,action_recommendation,status,created_at').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('decision_workspaces').select('decision_id,version,support,parent_decision_id,provenance,updated_at').eq('profile_id', user.id).limit(300),
      supabase.from('advisor_context_links').select('session_id,context_kind,context_id,updated_at').eq('profile_id', user.id).limit(500),
      supabase.from('signal_preferences').select('signal_id,watching,watch_baseline,acknowledged_revision,dismissed,version,provenance,updated_at').eq('profile_id', user.id).limit(1000),
    ]);
    const signals = new Map<string, Signal>();
    for (const row of triages.data ?? []) {
      const value = row.signal as unknown as Signal | null;
      if (value?.id) signals.set(value.id, value);
    }
    const errors: Record<string, string> = {};
    for (const [key, result] of Object.entries({ context, decisions, strategies, sessions, signals: triages, analysis: analyses })) {
      if (result.error) errors[key] = `Could not load ${key}. Please try again.`;
    }
    const durableMissing = [workspaces, links, preferences].some((r) => missingSchema(r.error));
    const durableFailed = !durableMissing && [workspaces, links, preferences].some((r) => r.error);
    if (durableFailed) errors.durable = 'Could not load your decision notes. Please try again before editing them.';
    const analysis: Record<string, unknown> = {};
    for (const row of analyses.data ?? []) {
      if (row.signal_id && signals.has(row.signal_id) && !analysis[row.signal_id]) analysis[row.signal_id] = { consequenceId: row.id, soWhat: row.so_what || row.primary_impact, ifYouAct: row.secondary_impact, ifYouDont: row.tertiary_risk, immediateAction: row.action_recommendation, status: row.status, createdAt: row.created_at };
    }
    const workspaceMap: Record<string, ReturnType<typeof workspaceView>> = {};
    for (const row of workspaces.data ?? []) workspaceMap[row.decision_id] = workspaceView(row);
    const sessionLinks: Record<string, { kind: string; id: string }> = {};
    for (const row of links.data ?? []) sessionLinks[row.session_id] = { kind: row.context_kind, id: row.context_id };
    const signalPreferences: Record<string, unknown> = {};
    for (const row of preferences.data ?? []) signalPreferences[row.signal_id] = row;
    return json({
      analysis, userId: user.id, profile, context: context.data, decisions: (decisions.data ?? []) as Decision[], strategies: (strategies.data ?? []) as Strategy[],
      sessions: sessions.data ?? [], signals: [...signals.values()], access, errors,
      durable: { ready: !durableMissing && !durableFailed, message: durableMissing ? SCHEMA_MESSAGE : durableFailed ? errors.durable : null },
      workspaces: workspaceMap, sessionLinks, signalPreferences,
    });
  } catch (error) {
    console.error('[workspace GET]', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'Your workspace could not be loaded. Please try again.' }, 500);
  }
}

type DecisionRow = Decision & { updated_at: string };
type WorkspaceRow = { version: number; support: unknown; parent_decision_id: string | null };

async function loadDecisionState(supabase: Supabase, userId: string, id: string) {
  const [decision, workspace] = await Promise.all([
    supabase.from('decisions').select('*').eq('id', id).eq('profile_id', userId).maybeSingle<DecisionRow>(),
    supabase.from('decision_workspaces').select('version,support,parent_decision_id').eq('decision_id', id).eq('profile_id', userId).maybeSingle<WorkspaceRow>(),
  ]);
  return { decision, workspace };
}

/** Core decision fields for the RPC: only keys that were sent; blank deadline means none. */
function corePayload(input: z.infer<typeof decisionFields>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) if (value !== undefined) out[key] = key === 'deadline' ? value || null : value;
  return out;
}

async function saveWorkspace(supabase: Supabase, args: { id: string; expectedUpdatedAt: string; expectedVersion: number; core: Record<string, unknown>; support: WorkspaceSupport | null; parentId?: string | null; provenance?: string }) {
  const { data, error } = await supabase.rpc('save_decision_workspace', {
    p_decision_id: args.id, p_expected_decision_updated_at: args.expectedUpdatedAt, p_expected_workspace_version: args.expectedVersion,
    p_core: args.core, p_support: args.support, p_parent_decision_id: args.parentId ?? null, p_provenance: args.provenance ?? 'account',
  });
  if (missingSchema(error)) return { status: 503, body: { error: SCHEMA_MESSAGE, code: 'schema_missing' } };
  if (historyViolation(error)) return { status: 409, body: { error: 'This keeps your recorded history intact: earlier choices and reviews cannot be changed. Refresh to see the saved version.', code: 'history' } };
  if (error || !data) return { status: 500, body: { error: 'Could not save your decision. Nothing was changed.' } };
  const result = data as { ok: boolean; code?: string; decision?: DecisionRow; workspace?: WorkspaceRow & { provenance: string; updated_at: string } };
  if (!result.ok) {
    if (result.code === 'not_found') return { status: 404, body: { error: 'Decision not found.' } };
    if (result.code === 'conflict') return { status: 409, body: { error: 'This decision changed in another window or device. Your entry is still here: refresh to see the newer version before saving again.', code: 'conflict' } };
    return { status: 401, body: { error: 'Please sign in again.' } };
  }
  return { status: 200, body: { decision: result.decision, workspace: workspaceView(result.workspace ?? null) } };
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    let originHost = '';
    try { originHost = origin ? new URL(origin).host : ''; } catch { /* Reject malformed origins. */ }
    const requestHost = request.headers.get('host') || new URL(request.url).host;
    if (!originHost || originHost !== requestHost) return json({ error: 'This action must come from your VANTAGE workspace.' }, 403);
    if (Number(request.headers.get('content-length') ?? 0) > 600000) return json({ error: 'That update is too large.' }, 413);
    const { supabase, user, profile, access } = await account();
    if (!user) return json({ error: 'Please sign in again.' }, 401);
    if (!profile || !access) return json({ error: 'Finish your company setup first.' }, 409);
    const body = await request.text();
    if (body.length > 600000) return json({ error: 'That update is too large.' }, 413);
    let input: unknown;
    try { input = JSON.parse(body); } catch { return json({ error: 'That update could not be read.' }, 400); }
    const parsed = command.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return json({ error: issue?.message && !/^(Invalid|Expected|Required)/.test(issue.message) ? issue.message : 'Check the fields and try again.', field: issue?.path.join('.') }, 400);
    }
    const cmd = parsed.data;
    if (cmd.operation === 'sign-out') {
      const { error } = await supabase.auth.signOut();
      return error ? json({ error: 'Could not sign out. Please try again.' }, 500) : json({ ok: true });
    }
    const feature = cmd.operation === 'save-session' || cmd.operation === 'link-session' ? 'ai_chat' : cmd.operation === 'company' ? 'profile' : cmd.operation === 'signal-preference' ? 'signals' : 'decisions';
    if (!canAccess(feature, access)) return json({ error: 'Your current plan does not include this feature.' }, 403);

    if (cmd.operation === 'create-decision') {
      const { source = 'manual', source_id = null, support: rawSupport, parentId = null, allowNew = false, ...fields } = cmd.input;
      if (source !== 'manual') {
        if (!source_id) return json({ error: 'Select the originating item again.' }, 400);
        const result = source === 'signal'
          ? await supabase.from('signal_triages').select('signal_id').eq('profile_id', user.id).eq('signal_id', source_id).limit(1)
          : await supabase.from('strategies').select('id').eq('profile_id', user.id).eq('id', source_id).limit(1);
        if (result.error || !result.data?.length) return json({ error: 'That item is unavailable in your workspace.' }, 404);
        // Offer existing connected work first; a different question from the same source is an explicit choice.
        if (!allowNew) {
          const { data: existing } = await supabase.from('decisions').select('id,title').eq('profile_id', user.id).eq('source', source).eq('source_id', source_id).neq('status', 'archived').order('created_at', { ascending: false }).limit(1);
          if (existing?.length) return json({ error: 'You already have a decision connected to this item. It is open for you instead.', code: 'existing', decisionId: existing[0].id }, 409);
        }
      }
      if (parentId) {
        const { data: parent } = await supabase.from('decisions').select('id').eq('id', parentId).eq('profile_id', user.id).maybeSingle();
        if (!parent) return json({ error: 'The decision you are reconsidering is unavailable.' }, 404);
      }
      let support: WorkspaceSupport | null = null;
      if (rawSupport !== undefined || parentId) {
        const normalised = normaliseSupport({ ...(rawSupport && typeof rawSupport === 'object' ? rawSupport : {}), parentId, snapshot: null, reviews: [] });
        if (!normalised.ok) return json({ error: normalised.error, field: normalised.field }, 400);
        support = normalised.value;
      }
      // Double submission: the same question from the same origin within two minutes returns the first record.
      const since = new Date(Date.now() - 120_000).toISOString();
      const dupe = supabase.from('decisions').select('*').eq('profile_id', user.id).eq('title', fields.title).eq('source', source).gte('created_at', since).order('created_at', { ascending: false }).limit(1);
      const { data: recent } = source === 'manual' ? await dupe.is('source_id', null) : await dupe.eq('source_id', source_id as string);
      if (recent?.length) return json({ ...recent[0], duplicate: true }, 200);
      const { data, error } = await supabase.from('decisions').insert({
        title: fields.title, description: fields.description || null, rationale: '',
        known_context: fields.known_context || null, open_questions: fields.open_questions || null,
        deadline: fields.deadline || null, profile_id: user.id, source, source_id: source === 'manual' ? null : source_id,
        status: 'open', confidence: 'exploring',
      }).select().single<DecisionRow>();
      if (error || !data) return json({ error: 'Could not create your open decision. Nothing was saved.' }, 500);
      if (!support) return json(data, 201);
      const saved = await saveWorkspace(supabase, { id: data.id, expectedUpdatedAt: data.updated_at, expectedVersion: 0, core: {}, support, parentId });
      if (saved.status !== 200) return json({ ...data, workspace: null, workspaceError: (saved.body as { error: string }).error }, 201);
      return json({ ...data, workspace: (saved.body as { workspace: unknown }).workspace }, 201);
    }

    if (cmd.operation === 'save-decision') {
      const { decision, workspace } = await loadDecisionState(supabase, user.id, cmd.id);
      if (missingSchema(workspace.error)) return json({ error: SCHEMA_MESSAGE, code: 'schema_missing' }, 503);
      if (decision.error || workspace.error) return json({ error: 'Could not load this decision. Nothing was saved.' }, 500);
      if (!decision.data) return json({ error: 'Decision not found.' }, 404);
      if (decision.data.updated_at !== cmd.expectedUpdatedAt || (workspace.data?.version ?? 0) !== cmd.expectedVersion) {
        return json({ error: 'This decision changed in another window or device. Your entry is still here: refresh to see the newer version before saving again.', code: 'conflict' }, 409);
      }
      let support: WorkspaceSupport | null = null;
      if (cmd.support !== undefined && cmd.support !== null) {
        const normalised = normaliseSupport({ ...(cmd.support as object), parentId: workspace.data?.parent_decision_id ?? null });
        if (!normalised.ok) return json({ error: normalised.error, field: normalised.field }, 400);
        support = normalised.value;
      }
      const stored = workspace.data ? workspaceSupport.safeParse(workspace.data.support) : null;
      const before = { core: { status: decision.data.status as CoreState['status'], rationale: decision.data.rationale, alternatives_considered: decision.data.alternatives_considered, actual_outcome: decision.data.actual_outcome }, support: stored?.success ? stored.data : null };
      const problem = lifecycleProblem(before, cmd.input as CoreChange, support ?? before.support);
      if (problem) return json({ error: problem }, 400);
      const saved = await saveWorkspace(supabase, { id: cmd.id, expectedUpdatedAt: cmd.expectedUpdatedAt, expectedVersion: cmd.expectedVersion, core: corePayload(cmd.input), support });
      return json(saved.body, saved.status);
    }

    if (cmd.operation === 'update-decision') {
      // Older clients: core fields only, same rules as before. Recorded choices stay intact.
      const { data: existing } = await supabase.from('decisions').select('id,status,updated_at,rationale,alternatives_considered').eq('id', cmd.id).eq('profile_id', user.id).maybeSingle();
      if (!existing) return json({ error: 'Decision not found.' }, 404);
      if (existing.updated_at !== cmd.expectedUpdatedAt) return json({ error: 'This decision changed in another view. Refresh before editing again.' }, 409);
      const problem = lifecycleProblem({ core: existing as CoreState, support: null }, cmd.input as CoreChange, null);
      if (problem) return json({ error: problem }, 400);
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

    if (cmd.operation === 'link-session') {
      const [{ data: session }, { data: existing, error: linkError }] = await Promise.all([
        supabase.from('advisor_sessions').select('id').eq('id', cmd.sessionId).eq('profile_id', user.id).maybeSingle(),
        supabase.from('advisor_context_links').select('context_kind,context_id').eq('session_id', cmd.sessionId).eq('profile_id', user.id).maybeSingle(),
      ]);
      if (missingSchema(linkError)) return json({ error: SCHEMA_MESSAGE, code: 'schema_missing' }, 503);
      if (!session) return json({ error: 'That conversation is unavailable.' }, 404);
      if (existing) {
        return existing.context_kind === cmd.kind && existing.context_id === cmd.contextId
          ? json({ sessionId: cmd.sessionId, kind: cmd.kind, id: cmd.contextId })
          : json({ error: 'This conversation already belongs to another item. Start a new conversation for this one.' }, 409);
      }
      const { error } = await supabase.from('advisor_context_links').insert({ session_id: cmd.sessionId, profile_id: user.id, context_kind: cmd.kind, context_id: cmd.contextId });
      if (error?.code === '23503') return json({ error: 'That item is unavailable in your workspace.' }, 404);
      if (error?.code === '23505') return json({ error: 'This conversation was just linked elsewhere. Refresh and try again.' }, 409);
      return error ? json({ error: 'Could not keep this conversation with its item. The conversation itself is saved.' }, 500) : json({ sessionId: cmd.sessionId, kind: cmd.kind, id: cmd.contextId }, 201);
    }

    if (cmd.operation === 'signal-preference') {
      const [{ data: link }, { data: current, error: prefError }] = await Promise.all([
        supabase.from('signal_triages').select('signal_id').eq('profile_id', user.id).eq('signal_id', cmd.signalId).maybeSingle(),
        supabase.from('signal_preferences').select('*').eq('profile_id', user.id).eq('signal_id', cmd.signalId).maybeSingle(),
      ]);
      if (missingSchema(prefError)) return json({ error: SCHEMA_MESSAGE, code: 'schema_missing' }, 503);
      if (!link) return json({ error: 'That signal is unavailable in your workspace.' }, 404);
      if ((current?.version ?? 0) !== cmd.expectedVersion) return json({ error: 'This signal changed in another window or device. Refresh to see its current state.', code: 'conflict', current }, 409);
      const next = nextSignalPreference(current, cmd.action, cmd.revision);
      const write = current
        ? supabase.from('signal_preferences').update({ ...next, version: current.version + 1 }).eq('profile_id', user.id).eq('signal_id', cmd.signalId).eq('version', current.version).select().maybeSingle()
        : supabase.from('signal_preferences').insert({ ...next, profile_id: user.id, signal_id: cmd.signalId }).select().maybeSingle();
      const { data, error } = await write;
      if (error?.code === '23505' || (!error && !data)) return json({ error: 'This signal changed in another window or device. Refresh to see its current state.', code: 'conflict' }, 409);
      return error ? json({ error: 'Could not save that. Nothing changed.' }, 500) : json(data);
    }

    if (cmd.operation === 'import-notes') return json(await importNotes(supabase, user.id, cmd.notes));

    const { error: profileError } = await supabase.from('profiles').update({ company_name: cmd.input.company_name, updated_at: new Date().toISOString() }).eq('id', user.id);
    if (profileError) return json({ error: 'Could not save your company name.' }, 500);
    const { error: contextError } = await supabase.from('ceo_context').upsert({ profile_id: user.id, product_description: cmd.input.product_description, target_customer: cmd.input.target_customer, additional_context: cmd.input.additional_context, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' });
    return contextError ? json({ error: 'Company name saved, but the other context could not be saved. Please try again.' }, 500) : json({ ok: true });
  } catch (error) {
    console.error('[workspace POST]', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'Could not complete that action. Please try again.' }, 500);
  }
}

/**
 * Reviewed import of notes kept by the earlier test version in one browser. Idempotent: only empty server records are
 * filled, only for owned items, only when the notes were taken of the current decision version. Imported records are
 * labelled. A recorded-choice snapshot is kept only if the decision actually records that choice; otherwise it is
 * dropped rather than presented as history.
 */
async function importNotes(supabase: Supabase, userId: string, notes: z.infer<typeof importPayload>) {
  const at = new Date().toISOString();
  const report = { decisions: [] as { id: string; result: string }[], sessions: [] as { id: string; result: string }[], signals: [] as { id: string; result: string }[] };
  const ids = Object.keys(notes.decisions);
  if (ids.length) {
    const [{ data: owned }, { data: existing, error }] = await Promise.all([
      supabase.from('decisions').select('id,updated_at,status,alternatives_considered').eq('profile_id', userId).in('id', ids),
      supabase.from('decision_workspaces').select('decision_id').eq('profile_id', userId).in('decision_id', ids),
    ]);
    if (missingSchema(error)) return { error: SCHEMA_MESSAGE, code: 'schema_missing', report };
    const ownedMap = new Map((owned ?? []).map((d) => [d.id, d]));
    const has = new Set((existing ?? []).map((w) => w.decision_id));
    for (const id of ids) {
      const d = ownedMap.get(id);
      if (!d) { report.decisions.push({ id, result: 'not-in-this-account' }); continue; }
      const verdict = importDecisionVerdict({ stamp: notes.decisions[id].stamp, serverUpdatedAt: d.updated_at, hasWorkspace: has.has(id), support: notes.decisions[id].support, at });
      if (!verdict.import) { report.decisions.push({ id, result: verdict.reason }); continue; }
      const support = { ...verdict.support };
      const recorded = Array.isArray(d.alternatives_considered) && d.alternatives_considered.some((o: Record<string, unknown>) => o?.comparisonChoice && o?.id === support.snapshot?.optionId);
      if (support.snapshot && !(d.status !== 'open' && recorded)) support.snapshot = null;
      if (d.status === 'open') support.reviews = [];
      if (support.parentId && !ownedMap.has(support.parentId)) {
        const { data: parent } = await supabase.from('decisions').select('id').eq('id', support.parentId).eq('profile_id', userId).maybeSingle();
        if (!parent) support.parentId = null;
      }
      const saved = await saveWorkspace(supabase, { id, expectedUpdatedAt: d.updated_at, expectedVersion: 0, core: {}, support, parentId: support.parentId, provenance: 'imported_browser_notes' });
      report.decisions.push({ id, result: saved.status === 200 ? 'imported' : (saved.body as { code?: string }).code ?? 'failed' });
    }
  }
  for (const [sessionId, link] of Object.entries(notes.sessionLinks)) {
    const { data: session } = await supabase.from('advisor_sessions').select('id').eq('id', sessionId).eq('profile_id', userId).maybeSingle();
    if (!session) { report.sessions.push({ id: sessionId, result: 'not-in-this-account' }); continue; }
    const { error } = await supabase.from('advisor_context_links').insert({ session_id: sessionId, profile_id: userId, context_kind: link.kind, context_id: link.id });
    report.sessions.push({ id: sessionId, result: !error ? 'imported' : error.code === '23505' ? 'already-in-account' : error.code === '23503' ? 'item-not-in-this-account' : 'failed' });
  }
  const prefs = notes.preferences;
  const signalIds = [...new Set([...prefs.watch, ...prefs.dismiss, ...Object.keys(prefs.ack)])];
  if (signalIds.length) {
    const [{ data: linked }, { data: existing }] = await Promise.all([
      supabase.from('signal_triages').select('signal_id').eq('profile_id', userId).in('signal_id', signalIds),
      supabase.from('signal_preferences').select('signal_id').eq('profile_id', userId).in('signal_id', signalIds),
    ]);
    const ok = new Set((linked ?? []).map((r) => r.signal_id)), has = new Set((existing ?? []).map((r) => r.signal_id));
    for (const id of signalIds) {
      if (!ok.has(id)) { report.signals.push({ id, result: 'not-in-this-account' }); continue; }
      if (has.has(id)) { report.signals.push({ id, result: 'already-in-account' }); continue; }
      const watching = prefs.watch.includes(id);
      const { error } = await supabase.from('signal_preferences').insert({ profile_id: userId, signal_id: id, watching, watch_baseline: watching ? prefs.watchBaseline[id] ?? null : null,
        acknowledged_revision: prefs.ack[id] ?? null, dismissed: prefs.dismiss.includes(id), provenance: 'imported_browser_notes' });
      report.signals.push({ id, result: error ? (error.code === '23505' ? 'already-in-account' : 'failed') : 'imported' });
    }
  }
  return { report };
}
