/**
 * GET  /api/company/intake  → current context, research proposals with evidence, up to four questions, sources
 * POST /api/company/intake  { answers: IntakeAnswer[], accept: string[] } → saves to ceo_context (all features read it)
 */
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { companyContextForClient, normaliseCompanyContext } from '@/lib/company-context/context';
import { intakeQuestions, intakeUpdate } from '@/lib/company-context/intake';
import type { Proposal } from '@/lib/company-context/research';
import { json, sameOrigin, signedIn } from '@/lib/company-context/route-guard';

export const dynamic = 'force-dynamic';

async function latestProposals(supabase: Awaited<ReturnType<typeof signedIn>>['supabase'], profileId: string) {
  const { data } = await supabase.from('company_research_runs').select('id,inputs,status,started_at,finished_at,proposals,queries,error').eq('profile_id', profileId).order('started_at', { ascending: false }).limit(6);
  const runs = (data ?? []) as { id: string; inputs: { scope?: string }; status: string; started_at: string; finished_at: string | null; proposals: Proposal[]; queries: string[]; error: string | null }[];
  // The newest finished run of each scope.
  const pick = (scope: string) => runs.find((r) => (r.inputs?.scope ?? 'identity') === scope && r.status !== 'running');
  const chosen = [pick('identity'), pick('landscape')].filter((r): r is NonNullable<typeof r> => Boolean(r));
  return { runs: chosen.map(({ proposals, ...rest }) => ({ ...rest, proposalCount: proposals?.length ?? 0 })), proposals: chosen.flatMap((r) => r.proposals ?? []) };
}

export async function GET() {
  const { supabase, user } = await signedIn();
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const [{ data: profile }, { data: ctx }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('ceo_context').select('*').eq('profile_id', user.id).maybeSingle(),
  ]);
  const company = normaliseCompanyContext(user.id, profile, ctx);
  const { runs, proposals } = await latestProposals(supabase, user.id);
  const { data: sources } = await supabase.from('company_sources').select('id,url,final_url,title,kind,why,claims,jurisdiction,status,last_ok_at,last_error').eq('profile_id', user.id).neq('status', 'retired').limit(60);
  return json({ companyContext: companyContextForClient(company), research: runs, proposals, questions: intakeQuestions(company, proposals), sources: sources ?? [] });
}

const answer = z.object({
  id: z.enum(['product', 'buyers', 'revenue_model', 'geography', 'competitors', 'dependencies', 'constraints', 'estimate']),
  value: z.string().max(600).nullable(), acceptProposalId: z.string().max(40).nullable().optional(), estimateFor: z.string().max(200).optional(), unknown: z.boolean().optional(),
});
const body = z.object({ answers: z.array(answer).max(12).default([]), accept: z.array(z.string().max(40)).max(30).default([]) });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'This action must come from your VANTAGE workspace.' }, 403);
  const { supabase, user } = await signedIn();
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Those answers could not be read.' }, 400);
  const { data: current } = await supabase.from('ceo_context').select('*').eq('profile_id', user.id).maybeSingle();
  const { proposals } = await latestProposals(supabase, user.id);
  const update = intakeUpdate(current, parsed.data.answers, proposals, parsed.data.accept);
  const admin = await createAdminClient();
  // Written with the service role after the ownership check above (ceo_context policies differ across environments).
  const { error } = await admin.from('ceo_context').upsert({ profile_id: user.id, ...update.columns, business_facts: update.businessFacts, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' });
  if (error) return json({ error: error.message.includes('business_facts') ? 'Saving needs the account update (migration 040). Nothing was saved.' : 'Your answers could not be saved. Nothing changed.' }, 503);
  const [{ data: profile }, { data: ctx }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('ceo_context').select('*').eq('profile_id', user.id).maybeSingle(),
  ]);
  const company = normaliseCompanyContext(user.id, profile, ctx);
  return json({ saved: update.saved, unknown: update.unknown, companyContext: companyContextForClient(company), questions: intakeQuestions(company, proposals) });
}
