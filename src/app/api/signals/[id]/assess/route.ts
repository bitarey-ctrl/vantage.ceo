/**
 * POST /api/signals/[id]/assess  { force?: boolean }
 *
 * Impact analysis made with the canonical company context and this account's stored relevance assessment.
 * A saved analysis is returned only while it is current: same company context version and the same assessment.
 * Otherwise a new analysis is written and the earlier one is kept as history (superseded_at), never overwritten.
 * Numbers come only from the deterministic calculation in the assessment; unknown exposure stays unknown.
 *
 * (The older /api/signals/[id]/analyse route is unchanged and still serves the previous screens.)
 */
import { createAdminClient } from '@/lib/supabase/server';
import { runConsequencePipeline } from '@/lib/ai/consequence-mapper';
import type { Profile, CeoContext, Decision } from '@/types/database';
import { companyContextBlock, normaliseCompanyContext } from '@/lib/company-context/context';
import { parseStoredConnection } from '@/lib/company-context/verify';
import { analysisQuality } from '@/lib/company-context/quality';
import { json, sameOrigin, signedIn } from '@/lib/company-context/route-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Row = Record<string, unknown> & { id: string; created_at: string; context_version?: string | null; evidence?: { assessment?: string } | null };
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const view = (r: Row, quality: unknown, stale = false) => ({
  consequenceId: r.id, soWhat: str(r.so_what) ?? str(r.primary_impact), ifYouAct: str(r.secondary_impact), ifYouDont: str(r.tertiary_risk),
  immediateAction: str(r.action_recommendation), status: r.status, createdAt: r.created_at, contextVersion: r.context_version ?? null,
  calculation: r.calculation ?? null, evidence: r.evidence ?? null, quality, stale,
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return json({ error: 'This action must come from your VANTAGE workspace.' }, 403);
  const { id: signalId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(signalId)) return json({ error: 'Signal not found.' }, 404);
  const { supabase, user } = await signedIn();
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const force = Boolean(((await request.json().catch(() => ({}))) as { force?: boolean }).force);

  // Ownership: the signal must be linked to this account.
  const { data: link } = await supabase.from('signal_triages').select('relevance_reason,signal:signals(id,title,content,url,what_happened)').eq('profile_id', user.id).eq('signal_id', signalId).maybeSingle();
  const signal = (link as { signal?: { id: string; title: string; content: string; url: string | null; what_happened: string | null } } | null)?.signal;
  if (!signal) return json({ error: 'Signal not found.' }, 404);

  const admin = await createAdminClient();
  const [{ data: profile }, { data: ctxRow }, { data: decisions }, { data: previous }] = await Promise.all([
    admin.from('profiles').select('*').eq('id', user.id).single(),
    admin.from('ceo_context').select('*').eq('profile_id', user.id).maybeSingle(),
    admin.from('decisions').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(5),
    admin.from('consequences').select('*').eq('profile_id', user.id).eq('signal_id', signalId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!profile) return json({ error: 'Finish your company profile first.' }, 409);
  const company = normaliseCompanyContext(user.id, profile, ctxRow);
  const assessment = parseStoredConnection((link as { relevance_reason?: string | null }).relevance_reason);
  const sourceText = `${signal.title}. ${signal.content}`;

  const prev = previous as Row | null;
  const current = prev && prev.context_version === company.version && (prev.evidence?.assessment ?? null) === (assessment?.text ?? null);
  if (prev && current && !force) {
    const a = view(prev, null);
    return json({ ...a, quality: analysisQuality(a, company, sourceText, (prev.calculation as { text?: string } | null)?.text ?? null), reused: true });
  }

  // Evidence the analysis may use: the item, this account's assessment, and the deterministic calculation.
  const evidenceText = [
    sourceText,
    assessment && assessment.checked ? `Assessment for this company — what changed: ${assessment.whatChanged ?? 'n/a'}; connection: ${assessment.connection ?? 'n/a'}; possible effect: ${assessment.effect ?? 'n/a'}; unknown: ${assessment.unknowns ?? 'n/a'}.` : 'No relevance assessment is stored for this item; say so if the link is weak.',
    assessment?.calculation ? `Deterministic calculation (use these numbers only): ${assessment.calculation.text}` : 'No calculation is possible from the details given: do not state any size of effect as a number.',
    `Source evidence level: ${assessment?.evidence.level ?? 'unknown'}; the item's claims are not independently verified.`,
  ].join('\n');
  const legacyContext = { ...(ctxRow ?? {}), profile_id: user.id } as unknown as CeoContext;
  let result;
  try {
    result = await runConsequencePipeline(signal.id, signal.title, evidenceText, profile as Profile, legacyContext, (decisions ?? []) as Decision[], companyContextBlock(company));
  } catch {
    return json({ error: 'The analysis could not run. Nothing was changed. Try again in a moment.' }, 502);
  }
  const c = result.consequenceResult;
  if (!c) return json({ error: 'The analysis could not run. Nothing was changed. Try again in a moment.' }, 502);

  const evidence = { assessment: assessment?.text ?? null, level: assessment?.evidence.level ?? null, url: signal.url, assessedAt: assessment?.assessedAt ?? null };
  const row = {
    signal_id: signal.id, profile_id: user.id, so_what: c.primary_impact, primary_impact: c.primary_impact, secondary_impact: c.secondary_impact ?? null,
    tertiary_risk: c.tertiary_risk ?? null, action_recommendation: c.action_recommendation, urgency_window: c.urgency_window, urgency_days: c.urgency_days,
    confidence_score: c.confidence_score, impact_matrix: c.impact_matrix, consequence_horizons: c.consequence_horizons ?? [], status: 'pending' as const,
  };
  let { data: saved, error } = await admin.from('consequences').insert({ ...row, context_version: company.version, evidence, calculation: assessment?.calculation ?? null }).select('*').single();
  let versioned = true;
  if (error && /context_version|evidence|calculation|column/i.test(error.message)) {
    // Migration 040 not installed: save without version columns and say so.
    ({ data: saved, error } = await admin.from('consequences').insert(row).select('*').single());
    versioned = false;
  }
  if (error || !saved) return json({ error: 'The analysis ran but could not be saved. Nothing was changed.' }, 500);
  if (prev && versioned) await admin.from('consequences').update({ superseded_at: new Date().toISOString() }).eq('id', prev.id).eq('profile_id', user.id);
  const a = view(saved as Row, null);
  return json({ ...a, quality: analysisQuality(a, company, sourceText, assessment?.calculation?.text ?? null), reused: false, versioned, replaced: prev?.id ?? null });
}
