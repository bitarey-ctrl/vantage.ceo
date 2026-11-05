/**
 * Short business-context intake: a few well-chosen questions, research proposals the founder accepts or corrects,
 * and one write path that saves the result where every feature reads it (ceo_context, via the canonical context).
 *
 * Questions are chosen deterministically from what is missing AND would change advice. Private numbers are asked
 * for only when a dependency they relate to is known, and "Don't know" is always a valid answer: unknowns stay
 * unknown.
 */
import type { CompanyContext, BusinessFact, Estimate, ResearchBasis } from './context';
import type { Proposal } from './research';

export interface IntakeQuestion {
  id: 'product' | 'buyers' | 'revenue_model' | 'geography' | 'competitors' | 'dependencies' | 'constraints' | 'estimate';
  question: string; why: string; placeholder: string;
  /** Present when research proposed an answer the founder can confirm instead of typing. */
  proposalId: string | null; proposed: string | null;
  estimateFor?: string;
}

const FIELD_OF: Record<IntakeQuestion['id'], Proposal['field'] | null> = {
  product: 'product', buyers: 'buyers', revenue_model: 'revenue_model', geography: 'geography', competitors: 'competitors',
  dependencies: 'dependencies', constraints: null, estimate: null,
};

/** At most four questions, most consequential first. */
export function intakeQuestions(c: CompanyContext, proposals: Proposal[] = []): IntakeQuestion[] {
  const proposal = (id: IntakeQuestion['id']) => { const f = FIELD_OF[id]; return f ? proposals.find((p) => p.field === f) ?? null : null; };
  const ask = (id: IntakeQuestion['id'], question: string, why: string, placeholder: string, extra: Partial<IntakeQuestion> = {}): IntakeQuestion => {
    const p = proposal(id);
    return { id, question, why, placeholder, proposalId: p?.id ?? null, proposed: p?.value ?? null, ...extra };
  };
  const out: IntakeQuestion[] = [];
  if (!c.product) out.push(ask('product', 'What do you sell, in one sentence?', 'Every signal is judged against what you sell.', 'e.g. Payroll software for restaurants'));
  if (!c.buyers) out.push(ask('buyers', 'Who pays you?', 'Changes that hit your buyers matter even when they never mention you.', 'e.g. Restaurant owners with 2–20 sites'));
  if (!c.geography.length) out.push(ask('geography', 'Where do you sell, and where do you operate from?', 'Rules, tariffs and demand differ by market.', 'e.g. UK and Ireland; team in Poland'));
  if (!c.competitors.length) out.push(ask('competitors', 'Which competitors do buyers compare you with?', 'Competitor moves are watched by name.', 'e.g. Gusto, Toast'));
  if (!c.revenueModel) out.push(ask('revenue_model', 'How do you make money?', 'Price and cost changes reach subscription, commission and wholesale businesses differently.', 'e.g. Monthly subscription per site'));
  if (!c.dependencies.length) out.push(ask('dependencies', 'What do you depend on that you do not control?', 'Supplier, platform and channel changes are often the indirect hits.', 'e.g. AWS, Stripe, one freight forwarder, Amazon marketplace'));
  if (!c.constraints.length) out.push(ask('constraints', 'What limits what you can do in the next 3 months?', 'Advice has to fit your cash, team and time.', 'e.g. No new hires; 9 months of runway; one engineer'));
  // A private number only when it changes the advice: the share of costs tied to a dependency already known.
  const dep = c.dependencies[0];
  if (dep && !c.estimates.some((e) => e.label.toLowerCase().includes(dep.text.toLowerCase().slice(0, 20)))) {
    out.push(ask('estimate', `Roughly what share of your costs goes to ${dep.text}?`, 'Lets VANTAGE size a price change for you instead of saying "it depends". An estimate is fine.', 'e.g. 30 (percent), or leave blank', { estimateFor: dep.text }));
  }
  return out.slice(0, 4);
}

export interface IntakeAnswer { id: IntakeQuestion['id']; value: string | null; acceptProposalId?: string | null; estimateFor?: string; unknown?: boolean }

/** A matched quote shows the page says it — not that it is true or still applies. Anything else is unverified. */
export const researchBasis = (p: Proposal): ResearchBasis => (p.basis === 'inferred' ? 'inferred' : p.evidence.some((e) => e.quoteFound) ? 'quote_matched' : 'unverified');

const listOf = (v: string) => v.split(/[\n;,]+/).map((x) => x.trim()).filter((x) => x.length > 1);

/**
 * Turn answers and accepted proposals into an update for ceo_context. Pure: the route writes it. Accepted research
 * is saved as founder-confirmed with its evidence URL; a typed answer always wins over a proposal.
 */
export function intakeUpdate(current: Record<string, unknown> | null, answers: IntakeAnswer[], proposals: Proposal[], acceptIds: string[] = []): { columns: Record<string, unknown>; businessFacts: Record<string, unknown>; saved: string[]; unknown: string[] } {
  const columns: Record<string, unknown> = {};
  const bf = { ...((current?.business_facts as Record<string, unknown>) ?? {}) };
  const deps = [...((bf.dependencies as BusinessFact[]) ?? [])];
  const cons = [...((bf.constraints as BusinessFact[]) ?? [])];
  const ests = [...((bf.estimates as Estimate[]) ?? [])];
  const saved: string[] = [], unknown: string[] = [];
  const stamp = Date.now().toString(36);
  // Which core columns were filled from research, so the value stays labelled as research (with its verification
  // status) until the founder edits it. Kept in business_facts: no schema change.
  const fromResearch = { ...((bf.column_sources as Record<string, unknown>) ?? {}) };
  const COLUMN_OF: Record<string, string> = { product: 'product_description', buyers: 'target_customer', revenue_model: 'revenue_model', geography: 'geography_detail' };
  // Superseded research records are kept, never deleted: accepting or correcting a value does not erase where an
  // earlier proposal came from or how uncertain it was.
  const history = [...((bf.column_history as unknown[]) ?? [])];
  const markColumn = (col: string, p: Proposal, value: unknown) => {
    if (fromResearch[col]) history.push({ column: col, ...(fromResearch[col] as object), replacedAt: new Date().toISOString(), replacedBy: 'research' });
    fromResearch[col] = { value, basis: researchBasis(p), evidence: p.evidence[0]?.url ?? null, proposal: p.value, acceptedAt: new Date().toISOString() };
  };
  for (const a of answers) {
    if (a.unknown) { unknown.push(a.id); continue; }
    const p = a.acceptProposalId ? proposals.find((x) => x.id === a.acceptProposalId) : null;
    const typed = a.value?.trim() ? a.value.trim().slice(0, 600) : null;
    const value = typed ?? p?.value ?? null;
    if (!value) continue;
    const origin = typed ? 'founder' : 'research_accepted';
    const evidence = typed ? null : p?.evidence[0]?.url ?? null;
    const basis = !typed && p ? { basis: researchBasis(p) } : {};
    // A typed answer becomes the founder-reported value; the research record stays (context.ts then shows the value
    // as a founder correction of that proposal).
    if (COLUMN_OF[a.id] && !typed && p) markColumn(COLUMN_OF[a.id], p, value);
    switch (a.id) {
      case 'product': columns.product_description = value; break;
      case 'buyers': columns.target_customer = value; break;
      case 'revenue_model': columns.revenue_model = value; break;
      case 'geography': columns.geography_detail = value; break;
      case 'competitors': columns.competitors = listOf(value); if (!typed && p) markColumn('competitors', p, columns.competitors); break;
      // An accepted research sentence stays whole (splitting it on commas produced fragments as "dependencies").
      case 'dependencies': for (const [i, t] of (typed ? listOf(value) : [value]).entries()) deps.push({ id: `d${stamp}${i}`, text: t, origin, evidence, ...basis }); break;
      case 'constraints': for (const [i, t] of listOf(value).entries()) cons.push({ id: `c${stamp}${i}`, text: t, origin, evidence: null }); break;
      case 'estimate': {
        const n = Number(value.replace(/[^\d.]/g, ''));
        if (Number.isFinite(n) && n >= 0 && n <= 100 && a.estimateFor) ests.push({ id: `e${stamp}`, label: `Share of costs: ${a.estimateFor}`, value: n, unit: '%', basis: 'estimate', origin: 'founder' });
        else continue;
        break;
      }
    }
    saved.push(a.id);
  }
  // Other accepted proposals (identity, history, or a field not asked about): saved as confirmed public facts, and
  // used for an empty column only — never overwriting what the founder typed.
  const pub = [...((bf.public_facts as BusinessFact[]) ?? [])];
  for (const id of acceptIds) {
    const p = proposals.find((x) => x.id === id);
    if (!p || answers.some((a) => a.acceptProposalId === id)) continue;
    const col = COLUMN_OF[p.field as string];
    if (col && !current?.[col] && !(col in columns)) { columns[col] = p.value; markColumn(col, p, p.value); saved.push(p.field); continue; }
    if (p.field === 'competitors' && !(current?.competitors as unknown[] | undefined)?.length && !columns.competitors) { columns.competitors = listOf(p.value); markColumn('competitors', p, columns.competitors); saved.push('competitors'); continue; }
    if (p.field === 'dependencies') { deps.push({ id: `d${stamp}${id}`, text: p.value, origin: 'research_accepted', evidence: p.evidence[0]?.url ?? null, basis: researchBasis(p) }); saved.push('dependencies'); continue; }
    pub.push({ id: `p${stamp}${id}`, text: p.value, origin: 'research_accepted', evidence: p.evidence[0]?.url ?? null, basis: researchBasis(p) }); saved.push(p.field);
  }
  return { columns, businessFacts: { ...bf, dependencies: deps, constraints: cons, estimates: ests, public_facts: pub, column_sources: fromResearch, column_history: history }, saved, unknown };
}
