/**
 * POST /api/company/research  { scope: "identity" | "landscape" }
 *
 * Public research for the signed-in account's company. Two short scopes keep each call inside the 60s function limit.
 * Only public identifiers (name, website, markets — and for "landscape" the accepted public summary) are sent.
 * Results are stored as proposals and proposed sources; nothing changes the company context until the founder
 * accepts it through /api/company/intake.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { loadCompanyContext } from '@/lib/company-context/load';
import { researchCompany, RESEARCH_MODEL, type ResearchScope } from '@/lib/company-context/research';
import { saveProposedSources } from '@/lib/company-context/sources';
import { json, sameOrigin, signedIn } from '@/lib/company-context/route-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'This action must come from your VANTAGE workspace.' }, 403);
  const { user } = await signedIn();
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const body = (await request.json().catch(() => ({}))) as { scope?: string };
  const scope: ResearchScope = body.scope === 'landscape' ? 'landscape' : 'identity';
  const admin = await createAdminClient();
  const ctx = await loadCompanyContext(admin, user.id);
  if (!ctx.companyName) return json({ error: 'Add your company name first.' }, 400);

  // Public summary for the second pass: only facts already public (accepted research) or what the company sells.
  const publicSummary = scope === 'landscape' ? [ctx.publicFacts.map((f) => f.text).join(' '), ctx.product].filter(Boolean).join(' ').slice(0, 600) || null : null;
  const inputs = { companyName: ctx.companyName, website: ctx.website, markets: ctx.geography.slice(0, 4), publicSummary };
  const { data: run, error: runError } = await admin.from('company_research_runs').insert({ profile_id: user.id, inputs: { ...inputs, scope }, model: RESEARCH_MODEL }).select('id').single();
  if (runError || !run) return json({ error: 'Research could not start: the account update (migration 040) may not be installed.' }, 503);
  try {
    const r = await researchCompany(inputs, { scope });
    const failed = r.stopReason === 'refusal' || (!r.proposals.length && !r.sources.length);
    await admin.from('company_research_runs').update({
      finished_at: new Date().toISOString(), status: failed ? 'failed' : 'done', queries: r.queries, retrieved: r.retrieved,
      proposals: r.proposals.map((p) => ({ ...p, id: `${scope[0]}${p.id}` })), usage: r.usage,
      error: failed ? (r.stopReason === 'refusal' ? 'The research request was declined.' : 'Nothing could be found from public sources.') : null,
    }).eq('id', run.id);
    const sources = await saveProposedSources(admin, user.id, r.sources, run.id);
    return json({ runId: run.id, scope, proposals: r.proposals.length, sources, dropped: r.dropped, ambiguity: r.ambiguity, queries: r.queries, failed });
  } catch (error) {
    const msg = error instanceof Error ? error.message.slice(0, 200) : 'unknown error';
    await admin.from('company_research_runs').update({ finished_at: new Date().toISOString(), status: 'failed', error: msg }).eq('id', run.id);
    console.error('[company/research]', msg);
    return json({ error: 'Research failed. Nothing was changed. Try again in a moment.' }, 502);
  }
}
