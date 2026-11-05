// Stage C — full-candidate verification on the ISOLATED Supabase project, through the real local app.
//   node scripts/isolated/with-isolated-env.mjs node --import ./scripts/company-context/ts-resolve.mjs \
//        scripts/isolated/stage-c.mjs <plan|setup|advisor|candidate|reasoning|report|cleanup> [baseUrl]
// Env: QA_FILE (private, mode 600), PROVIDER_BUDGET_FILE (the SAME ledger the local server uses), REPORT_FILE.
// Every billable request is reserved in the ledger before it is sent (src/lib/ai/provider-budget.ts); the phase
// ceilings below are written into the ledger, so the server refuses anything beyond them. No automatic retries.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const Attention = require('../../public/comparison/attention-engine.js');

const ISOLATED = 'acqhieylvcemgcevrxvc', PRODUCTION = 'odahuetnflsqkligzwpm';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const mode = process.argv[2], base = (process.argv[3] || 'http://localhost:3300').replace(/\/$/, ''), origin = new URL(base).origin;
// Approved hard ceilings (founder, option A): advisor 7 calls/$0.50; Stage C (C1–C7) 26 calls/$2.00;
// combined 33 calls/$2.50. Nothing runs past any of them.
const CEILING = { advisor: 7, candidate: 26 };
const DOLLARS = { advisor: 0.5, candidate: 2.0, combined: 2.5 };
// Conservative maximum cost of ONE request of each kind, used to refuse a step that could cross a dollar ceiling.
const MAX_COST = { advisor: 0.06, research: 0.7, gate: 0.12, assessment: 0.18, analysis: 0.1 };
const NEED = { candidateBeforeReasoning: 14, reasoning: 12 };
// $ per million input/output tokens. Opus is priced conservatively ($5/$25): the earlier $4/$20 assumption understated
// the 2026-11-05 total ($1.317 vs $1.508 on the same usage).
const PRICES = { 'claude-sonnet-4-5': [3, 15], 'claude-opus-5-5': [5, 25] };
const SEARCH_PRICE = 0.01; // $ per web search request

const PLAN = [
  ['advisor', 'A1 complete answer that may propose a profile update (applied at most once)', 1],
  ['advisor', 'A2 length limit (test-only low cap) → stored as incomplete, survives reload', 1],
  ['advisor', 'A3 explicit retry of A2 (same question id) → complete, earlier attempt kept', 1],
  ['advisor', 'A4 Stop mid-answer → cancelled, partial kept, no memory write', 1],
  ['advisor', 'A5 two simultaneous retries of one question → memory written once', 2],
  ['advisor', 'A6 field corrected while the answer is generated → stale proposal kept as conflict', 1],
  ['candidate', 'C1 research: identity (Opus 5.5 + web search/fetch)', 1],
  ['candidate', 'C2 research: market and rules', 1],
  ['candidate', 'C3 refresh via real route: existing gate (144 candidates at last count → 6 batches) + 2 assessments', 8],
  ['candidate', 'C4 second collection: de-duplication + verified-source (incl. regulator) collection', 2],
  ['candidate', 'C5 impact analysis + re-analysis after a context correction (evidence change = free stale check)', 2],
  ['candidate', 'C6 decision draft carrying the evidence', 0],
  ['candidate', 'C7 six frozen reasoning pairs (2 answers each)', 12],
];

if (mode === 'plan') {
  for (const phase of ['advisor', 'candidate']) {
    const rows = PLAN.filter((p) => p[0] === phase), n = rows.reduce((a, r) => a + r[2], 0);
    console.log(`\n${phase}: ${n} calls planned, ceiling ${CEILING[phase]} → ${n <= CEILING[phase] ? 'fits' : `SHORTFALL ${n - CEILING[phase]} calls`}`);
    for (const r of rows) console.log(`  ${String(r[2]).padStart(2)}  ${r[1]}`);
  }
  const total = PLAN.reduce((a, r) => a + r[2], 0);
  console.log(`\ncombined: ${total} planned vs 33 → ${total <= 33 ? 'fits' : `SHORTFALL ${total - 33}`}`);
  process.exit(0);
}

if (!url.includes(ISOLATED) || url.includes(PRODUCTION) || process.env.ISOLATED_TEST !== '1') { console.error('Refusing: not the isolated project.'); process.exit(2); }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const QA = process.env.QA_FILE, LEDGER = process.env.PROVIDER_BUDGET_FILE, REPORT = process.env.REPORT_FILE ?? (QA + '.report.json');
if (!QA || !LEDGER) throw new Error('Set QA_FILE and PROVIDER_BUDGET_FILE.');
const saveQA = (v) => writeFileSync(QA, JSON.stringify(v), { mode: 0o600 });
const loadQA = () => JSON.parse(readFileSync(QA, 'utf8'));
const ledger = () => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { limit: 0, calls: [] });
const setCeiling = (n) => { const l = ledger(); l.limit = n; writeFileSync(LEDGER, JSON.stringify(l, null, 1), { mode: 0o600 }); };
const report = existsSync(REPORT) ? JSON.parse(readFileSync(REPORT, 'utf8')) : { results: [], steps: [], reasoning: [] };
const saveReport = () => writeFileSync(REPORT, JSON.stringify(report, null, 1), { mode: 0o600 });
function check(ok, name, detail = '') { report.results.push({ ok: Boolean(ok), name, detail: ok ? '' : String(detail).slice(0, 600) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + String(detail).slice(0, 300)}`); return ok; }
function note(name, detail) { report.results.push({ ok: null, name, detail: String(detail).slice(0, 600) }); console.log(`NOTE ${name}: ${String(detail).slice(0, 300)}`); }
function spent(from = 0) { return ledger().calls.slice(from).reduce((a, c) => { const pr = PRICES[c.model] ?? [0, 0], u = c.usage ?? {}; return a + ((u.input_tokens ?? 0) * pr[0] + (u.output_tokens ?? 0) * pr[1]) / 1e6 + (u.server_tool_use?.web_search_requests ?? 0) * SEARCH_PRICE; }, 0); }
let phaseStart = 0, phaseDollars = 0;
// Refuses a step whose worst case would cross the phase or combined dollar ceiling (usage is known only afterwards).
async function step(name, fn, worst = 0) {
  if (spent(phaseStart) + worst > phaseDollars || spent() + worst > DOLLARS.combined) { note(`${name} NOT RUN`, `worst case $${worst.toFixed(2)} would cross a dollar ceiling (phase spent $${spent(phaseStart).toFixed(3)}, total $${spent().toFixed(3)})`); saveReport(); console.error('Stopping this phase: dollar ceiling.'); process.exit(4); }
  const t0 = Date.now(), c0 = ledger().calls.length; try { return await fn(); } finally { report.steps.push({ name, ms: Date.now() - t0, calls: ledger().calls.length - c0, cost: Math.round(spent(c0) * 10000) / 10000 }); saveReport(); } }

async function signIn(row) {
  let jar = [];
  const sb = createServerClient(url, anon, { cookies: { getAll: () => jar, setAll: (items) => { for (const i of items) { jar = jar.filter((x) => x.name !== i.name); jar.push(i); } } } });
  const { data, error } = await sb.auth.signInWithPassword({ email: row.email, password: row.password }); if (error) throw error;
  return { cookie: jar.map((x) => `${x.name}=${encodeURIComponent(x.value)}`).join('; '), token: data.session.access_token };
}
let S = {};
// A 401 means the test account's session expired (e.g. a long pause): sign in again once. Never repeats paid calls
// (the Advisor and research requests do not go through this helper's retry).
const api = async (who, path, method = 'GET', body, headers = {}, again = true) => { const r = await fetch(base + path, { method, headers: { cookie: S[who].cookie, origin, 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); if (r.status === 401 && again && !/\/api\/(advisor\/chat|company\/research|signals\/refresh|signals\/[^/]+\/analyse)/.test(path)) { S[who] = await signIn(rows.find((x) => x.label === who)); return api(who, path, method, body, headers, false); } const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = { raw: t.slice(0, 300) }; } return { status: r.status, data: d }; };
const freshAuth = async () => { for (const r of rows) S[r.label] = await signIn(r); };
const ws = async (who) => (await api(who, '/api/workspace')).data;
const cmd = (who, body) => api(who, '/api/workspace', 'POST', body);

// ── Advisor helpers: the same requests the browser client makes ─────────────────────────────────────────────
async function newSession(who, title) { return (await api(who, '/api/advisor/sessions', 'POST', { title })).data; }
async function addQuestion(who, session, text) {
  const turnId = randomUUID();
  const r = await cmd(who, { operation: 'save-session', id: session.id, expectedUpdatedAt: session.updated_at, messages: [...(session.messages ?? []), { role: 'user', content: text, turnId }] });
  if (r.status !== 200) throw new Error('question save failed ' + r.status);
  return { session: r.data, turnId };
}
async function ask(who, session, turnId, { maxTokens, onFirstDelta, abortAfterFirstDelta } = {}) {
  const messages = (session.messages ?? []).filter((m) => !(m.role === 'assistant' && m.incomplete) && m.content).map(({ role, content }) => ({ role, content }));
  const ctl = new AbortController(); let text = '', end = null, error = null, memory = null, first = true, aborted = false;
  try {
    const res = await fetch(base + '/api/advisor/chat', { method: 'POST', signal: ctl.signal, headers: { cookie: S[who].cookie, origin, 'content-type': 'application/json', ...(maxTokens ? { 'x-test-max-tokens': String(maxTokens) } : {}) }, body: JSON.stringify({ messages, turnId, sessionId: session.id }) });
    if (!res.ok) return { text, end, error: { status: res.status, body: await res.text() }, memory };
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
    while (true) {
      const { done, value } = await reader.read(); buf += done ? dec.decode() : dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) !== -1) { const line = buf.slice(0, i); buf = buf.slice(i + 2); if (!line.startsWith('data: ')) continue; const e = JSON.parse(line.slice(6));
        if (e.delta) { text += e.delta; if (first) { first = false; if (onFirstDelta) await onFirstDelta(); if (abortAfterFirstDelta) { aborted = true; ctl.abort(); } } }
        if (e.end) end = e.end; if (e.error) error = e.error; if (e.memory) memory = e.memory; }
      if (done) break;
    }
  } catch (err) { if (err.name !== 'AbortError') error = { message: err.message }; }
  return { text, end, error, memory, aborted };
}
const statusOf = (r) => (r.aborted ? 'cancelled' : r.error ? 'error' : r.end?.status ?? 'transport');
async function saveAnswer(who, sessionId, turnId, r, prior = null) {
  const s = (await api(who, '/api/advisor/sessions/' + sessionId)).data;
  const status = statusOf(r);
  const msg = { role: 'assistant', content: r.text.split('[[VANTAGE_MEMORY]]')[0].trim(), status, turnId, ...(status !== 'complete' ? { incomplete: true } : {}), ...(prior ? { attempts: [{ content: prior.content, status: prior.status, at: null }] } : {}) };
  const messages = prior ? [...s.messages.filter((m) => !(m.role === 'assistant' && m.turnId === turnId)), msg] : [...s.messages, msg];
  return cmd(who, { operation: 'save-session', id: sessionId, expectedUpdatedAt: s.updated_at, messages });
}

// ── Phases ───────────────────────────────────────────────────────────────────────────────────────────────────
// A realistic, public business; research uses only its name, website and markets.
const COMPANY = { name: 'Pact Coffee', website: 'https://www.pactcoffee.com', geography: 'United Kingdom' };

if (mode === 'setup') {
  const { data: pre } = await admin.from('company_sources').select('id', { head: true, count: 'exact' });
  for (const t of ['decision_workspaces', 'company_sources', 'company_research_runs', 'source_collection_runs', 'advisor_memory_ops', 'company_fact_versions']) {
    const { error } = await admin.from(t).select('*', { head: true, count: 'exact' }).limit(1); if (error) throw new Error(`schema missing ${t}: ${error.message}`);
  }
  const rows = [];
  for (const [label, company] of [['A', COMPANY.name], ['B', 'Control account (synthetic)'], ['R', 'Reasoning test account (synthetic)']]) {
    const email = `stagec-${label.toLowerCase()}-${Date.now()}@vantage.invalid`, password = randomBytes(28).toString('base64url');
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (error) throw error;
    rows.push({ id: data.user.id, email, password, label }); saveQA(rows);
    const p = await admin.from('profiles').upsert({ id: data.user.id, email, full_name: 'Stage C ' + label, company_name: company, onboarding_completed: true, plan: 'pro' }); if (p.error) throw p.error;
    const c = await admin.from('ceo_context').upsert({ profile_id: data.user.id, geography_detail: label === 'A' ? COMPANY.geography : null, additional_context: label === 'A' ? COMPANY.website : null }, { onConflict: 'profile_id' }); if (c.error) throw c.error;
  }
  void pre; setCeiling(0);
  console.log('Created 3 accounts on the isolated project (A: name + website + market only).');
  process.exit(0);
}

const rows = loadQA(); const [A, B, R] = rows;
for (const r of rows) S[r.label] = await signIn(r);

if (mode === 'advisor') {
  phaseStart = ledger().calls.length; phaseDollars = DOLLARS.advisor;
  const resume = process.env.ADVISOR_FROM === 'A4';
  setCeiling(resume ? Number(process.env.ADVISOR_PHASE_START ?? 0) + CEILING.advisor : ledger().calls.length + CEILING.advisor);
  if (resume) phaseStart = Number(process.env.ADVISOR_PHASE_START ?? 0);
  let s = resume ? (await api('A', '/api/advisor/sessions')).data.find?.((x) => x.title === 'Stage C advisor') ?? null : await newSession('A', 'Stage C advisor');
  let q, reload;
  if (!resume) {
  // A1
  q = await addQuestion('A', s, 'We now also compete with Brio Coffee Club. What should I keep an eye on?');
  let r1 = await step('A1', () => ask('A', q.session, q.turnId), MAX_COST.advisor);
  check(statusOf(r1) === 'complete', 'A1 answer completes', JSON.stringify({ end: r1.end, error: r1.error }));
  check(!r1.text.includes('[[VANTAGE_MEMORY'), 'A1 memory marker never reaches the reader');
  await saveAnswer('A', q.session.id, q.turnId, r1);
  const ops1 = (await admin.from('advisor_memory_ops').select('status,field,value').eq('profile_id', A.id)).data;
  note('A1 memory outcome', JSON.stringify({ event: r1.memory, ops: ops1 }));
  // A2
  s = (await api('A', '/api/advisor/sessions/' + s.id)).data;
  q = await addQuestion('A', s, 'Walk me through how I should think about raising our subscription price.');
  const r2 = await step('A2', () => ask('A', q.session, q.turnId, { maxTokens: 40 }), MAX_COST.advisor);
  check(statusOf(r2) === 'max_tokens' && r2.end?.stopReason === 'max_tokens', 'A2 provider stop reason max_tokens reported as such', JSON.stringify(r2.end));
  await saveAnswer('A', q.session.id, q.turnId, r2);
  reload = (await api('A', '/api/advisor/sessions/' + s.id)).data;
  check(reload.messages.at(-1).status === 'max_tokens' && reload.messages.at(-1).incomplete === true, 'A2 incomplete status survives reload');
  // A3
  const prior = reload.messages.at(-1);
  const r3 = await step('A3', () => ask('A', { ...reload, messages: reload.messages.slice(0, -1) }, q.turnId), MAX_COST.advisor);
  check(statusOf(r3) === 'complete', 'A3 retry completes', JSON.stringify(r3.end));
  await saveAnswer('A', s.id, q.turnId, r3, prior);
  reload = (await api('A', '/api/advisor/sessions/' + s.id)).data;
  check(reload.messages.filter((m) => m.turnId === q.turnId && m.role === 'user').length === 1 && reload.messages.at(-1).attempts?.[0]?.content === prior.content, 'A3 no duplicate turns; earlier attempt kept');
  }
  await freshAuth();
  reload = (await api('A', '/api/advisor/sessions/' + s.id)).data;
  // A4
  q = await addQuestion('A', reload, 'Give me a detailed plan for our next three months, step by step.');
  const r4 = await step('A4', () => ask('A', q.session, q.turnId, { abortAfterFirstDelta: true }), MAX_COST.advisor);
  check(r4.aborted && !r4.end, 'A4 Stop: no completion claimed');
  await saveAnswer('A', q.session.id, q.turnId, r4);
  reload = (await api('A', '/api/advisor/sessions/' + s.id)).data;
  check(reload.messages.at(-1).status === 'cancelled', 'A4 cancelled status persisted');
  check(!((await admin.from('advisor_memory_ops').select('turn_id').eq('turn_id', q.turnId)).data ?? []).length, 'A4 no memory claim from a stopped answer');
  // A5
  const s5 = await newSession('A', 'Stage C concurrency');
  q = await addQuestion('A', s5, 'Please note: we also compete with Kiko Roasters now.');
  const [r5a, r5b] = await step('A5', () => Promise.all([ask('A', q.session, q.turnId), ask('A', q.session, q.turnId)]), 2 * MAX_COST.advisor);
  const ops5 = (await admin.from('advisor_memory_ops').select('status,field,value').eq('profile_id', A.id).eq('turn_id', q.turnId)).data;
  const comps = (await admin.from('ceo_context').select('competitors').eq('profile_id', A.id).single()).data.competitors;
  const kiko = JSON.stringify(comps).match(/kiko/gi)?.length ?? 0;
  check(ops5.length <= 1 && kiko <= 1, 'A5 at most one memory write for one question', JSON.stringify({ ops5, comps }));
  note('A5 memory events', JSON.stringify([r5a.memory, r5b.memory]));
  // A6
  const s6 = await newSession('A', 'Stage C stale');
  q = await addQuestion('A', s6, 'Update my profile: we now sell mainly to offices and workplaces, not home drinkers.');
  const r6 = await step('A6', () => ask('A', q.session, q.turnId, { onFirstDelta: async () => { await admin.from('ceo_context').update({ target_customer: 'Founder correction (other tab): home coffee drinkers and gift buyers' }).eq('profile_id', A.id); } }), MAX_COST.advisor);
  const ctx6 = (await admin.from('ceo_context').select('target_customer').eq('profile_id', A.id).single()).data;
  check(ctx6.target_customer.startsWith('Founder correction'), 'A6 a correction made during generation is not overwritten by the older answer', JSON.stringify({ memory: r6.memory, ctx6 }));
  note('A6 memory outcome', JSON.stringify(r6.memory));
  saveReport(); process.exit(0);
}

if (mode === 'candidate') {
  report.candidateStart = ledger().calls.length;
  if (NEED.candidateBeforeReasoning + NEED.reasoning > CEILING.candidate) { console.error(`Refusing to start: C1–C7 need ${NEED.candidateBeforeReasoning + NEED.reasoning} calls, approved ${CEILING.candidate}. Shortfall ${NEED.candidateBeforeReasoning + NEED.reasoning - CEILING.candidate}.`); process.exit(3); }
  phaseStart = ledger().calls.length; phaseDollars = DOLLARS.candidate;
  setCeiling(ledger().calls.length + NEED.candidateBeforeReasoning);
  // Intake starts from name + website + market only.
  let intake = (await api('A', '/api/company/intake')).data;
  check(intake.questions?.length >= 1, `intake opens with ${intake.questions?.length} questions`);
  const r1 = await step('C1', () => api('A', '/api/company/research', 'POST', { scope: 'identity' }), MAX_COST.research);
  const r2 = await step('C2', () => api('A', '/api/company/research', 'POST', { scope: 'landscape' }), MAX_COST.research);
  check(r1.status === 200 && !r1.data.failed, 'C1 identity research', JSON.stringify(r1.data));
  check(r2.status === 200 && !r2.data.failed, 'C2 market/rules research', JSON.stringify(r2.data));
  const runs = (await admin.from('company_research_runs').select('inputs,queries,retrieved,proposals,status').eq('profile_id', A.id)).data;
  check(runs.every((r) => Object.keys(r.inputs).every((k) => ['companyName', 'website', 'markets', 'publicSummary', 'scope'].includes(k))), 'research inputs held only public identifiers');
  const allProps = runs.flatMap((r) => r.proposals ?? []);
  const quotes = allProps.flatMap((p) => p.evidence ?? []).filter((e) => e.quote);
  report.quotes = { company: COMPANY.name, withQuote: quotes.length, confirmed: quotes.filter((e) => e.quoteFound).length, proposals: allProps.length, unconfirmed: allProps.filter((p) => p.basis === 'unconfirmed').length };
  note('research quotes confirmed in fetched pages', JSON.stringify(report.quotes));
  intake = (await api('A', '/api/company/intake')).data;
  report.proposals = intake.proposals; report.queries = runs.flatMap((r) => r.queries);
  // Founder answers: accept identity proposals, type dependencies/constraints, one "don't know", one estimate.
  const answers = intake.questions.map((x) => x.id === 'buyers' ? { id: x.id, value: null, unknown: true }
    : x.proposalId ? { id: x.id, value: null, acceptProposalId: x.proposalId }
    : x.id === 'dependencies' ? { id: x.id, value: 'Green coffee importers; Royal Mail for delivery' }
    : x.id === 'constraints' ? { id: x.id, value: 'No new hires this quarter' }
    : x.id === 'competitors' ? { id: x.id, value: 'Grind, Origin Coffee' }
    : x.id === 'product' ? { id: x.id, value: 'Speciality coffee subscriptions delivered by post' } : { id: x.id, value: null, unknown: true });
  let saved = await api('A', '/api/company/intake', 'POST', { answers, accept: allProps.filter((p) => p.field === 'identity').map((p) => p.id).slice(0, 1) });
  const est = saved.data.questions?.find((x) => x.id === 'estimate');
  if (est) saved = await api('A', '/api/company/intake', 'POST', { answers: [{ id: 'estimate', value: '35', estimateFor: est.estimateFor }], accept: [] });
  const cc = saved.data.companyContext;
  check(cc?.product && cc.dependencies?.length && cc.constraints?.length, 'context saved (product, dependencies, constraints)', JSON.stringify(cc).slice(0, 400));
  report.context = cc;
  const srcs0 = (await admin.from('company_sources').select('url,kind,status,jurisdiction').eq('profile_id', A.id)).data;
  check(srcs0.length > 0, `source records stored (${srcs0.length} proposed)`);
  // C3 refresh through the real route (also runs the existing gate pipeline and its built-in "B2B SaaS" defaults).
  const f1 = await step('C3', () => api('A', '/api/signals/refresh', 'POST', {}), 6 * MAX_COST.gate + 2 * MAX_COST.assessment);
  check(f1.status === 200, `C3 refresh: ${f1.data.message ?? ''}`, JSON.stringify(f1.data).slice(0, 400));
  report.refresh1 = f1.data.sourcePlan;
  const runRows = (await admin.from('source_collection_runs').select('id,status,report').eq('profile_id', A.id)).data;
  check(runRows.length >= 1, 'collection run persisted');
  const srcs1 = (await admin.from('company_sources').select('url,kind,status,last_error').eq('profile_id', A.id)).data;
  report.sources = srcs1;
  note('source verification', JSON.stringify(srcs1.map((x) => `${x.status} ${x.kind} ${x.url}`)));
  // C4 second collection (route is limited to 1/hour, so the same function is called directly with the same rules).
  const { runSourcePlan } = await import('../../src/lib/company-context/ingest.ts');
  const { loadCompanyContext } = await import('../../src/lib/company-context/load.ts');
  const ctxA = await loadCompanyContext(admin, A.id);
  const before = (await admin.from('signal_triages').select('signal_id').eq('profile_id', A.id)).data.length;
  const f2 = await step('C4', () => runSourcePlan(admin, ctxA, { maxNew: 12, trigger: 'test' }), 2 * MAX_COST.assessment);
  const after = (await admin.from('signal_triages').select('signal_id').eq('profile_id', A.id)).data;
  const sigs = (await admin.from('signals').select('id,url').in('id', after.map((t) => t.signal_id))).data;
  const urls = sigs.map((x) => x.url).filter(Boolean);
  check(new Set(urls).size === urls.length, `no duplicate URLs among ${urls.length} linked signals (before ${before}, inserted ${f2.inserted}, already linked ${f2.alreadyLinked})`);
  report.refresh2 = f2;
  note('verified-source collection (incl. regulators)', JSON.stringify({ verifiedSources: f2.verifiedSources, originalItems: f2.verifiedSources?.originalItems }));
  // What the founder sees.
  let w = await ws('A');
  const shown = w.signals.filter((x) => ['relevant', 'watch'].includes(x.connection.status));
  report.feed = w.signals.slice(0, 10).map((x) => ({ status: x.connection.status, title: x.title, connection: x.connection.connection, effect: x.connection.effect, unknowns: x.connection.unknowns, next: x.connection.nextStep, level: x.connection.evidence?.level, url: x.url }));
  check(w.signals.every((x) => x.connection.status !== 'rejected'), 'no rejected items shown');
  check(shown.every((x) => x.connection.whatChanged && x.connection.connection && x.connection.effect), 'shown signals state change, connection and effect');
  // C5 analysis, invalidation, history.
  const target = shown[0];
  if (target) {
    const a1 = await step('C5a', () => api('A', `/api/signals/${target.id}/analyse`, 'POST', {}), MAX_COST.analysis);
    check(a1.status === 200 && a1.data.contextVersion === w.companyContext.version, 'C5 analysis saved with context version', JSON.stringify(a1.data).slice(0, 300));
    report.analysis = a1.data;
    const again = await api('A', `/api/signals/${target.id}/analyse`, 'POST', {});
    check(again.data.reused === true, 'repeat click reuses the current analysis (no paid call)');
    // Evidence change → stale flag (free).
    const tri = (await admin.from('signal_triages').select('relevance_reason').eq('profile_id', A.id).eq('signal_id', target.id).single()).data;
    const st = JSON.parse(tri.relevance_reason); st.text = st.text + ' (reassessed)'; st.assessedAt = new Date().toISOString();
    await admin.from('signal_triages').update({ relevance_reason: JSON.stringify(st) }).eq('profile_id', A.id).eq('signal_id', target.id);
    w = await ws('A');
    check(w.analysis[target.id]?.stale === true, `evidence change marks the analysis stale: ${w.analysis[target.id]?.staleReason}`);
    // Context correction → re-analysis writes a new version and keeps history.
    await api('A', '/api/company/intake', 'POST', { answers: [{ id: 'constraints', value: 'Cash runway is six months' }], accept: [] });
    const a2 = await step('C5b', () => api('A', `/api/signals/${target.id}/analyse`, 'POST', {}), MAX_COST.analysis);
    const hist = (await admin.from('consequences').select('id,superseded_at').eq('profile_id', A.id).eq('signal_id', target.id)).data;
    check(a2.data.reused === false && hist.length === 2 && hist.find((h) => h.id === a1.data.consequenceId)?.superseded_at, 'context correction → new analysis, old kept as history');
    report.analysis2 = a2.data;
    // C6 decision draft with the same evidence (built as the client does).
    const fresh = await ws('A'); const sig = fresh.signals.find((x) => x.id === target.id), an = fresh.analysis[target.id];
    const packet = Attention.decisionContext({ ...sig, reports: [{ id: sig.id, source: sig.url ? new URL(sig.url).hostname : 'source', url: sig.url ?? '', publishedAt: sig.published_at, claim: sig.content, limit: 'External reporting.' }], implication: an.soWhat, interpretedAt: an.createdAt, nextCheck: an.immediateAction });
    const dec = await cmd('A', { operation: 'create-decision', input: { title: 'Respond to: ' + sig.title.slice(0, 90), description: packet.description, source: 'signal', source_id: sig.id, support: { evidence: packet.evidence, signalLink: packet.signalLink } } });
    const dw = (await admin.from('decision_workspaces').select('support').eq('decision_id', dec.data.id).single()).data;
    check(dec.status === 201 && dw.support.evidence.some((e) => e.url === (sig.url ?? '')) && dw.support.evidence.some((e) => e.id.startsWith('assessment:')) && dw.support.evidence.some((e) => e.claim === an.soWhat), 'C6 decision draft carries source, assessment and analysis');
  } else note('C5/C6', 'no relevant or watch signal was found for this company in the checked scope — analysis and draft not exercised');
  // Isolation.
  const bIntake = (await api('B', '/api/company/intake')).data;
  check(!bIntake.sources?.length && !bIntake.proposals?.length, "B sees none of A's research or sources");
  const bRead = await fetch(`${url}/rest/v1/company_sources?select=id`, { headers: { apikey: anon, Authorization: `Bearer ${S.B.token}` } });
  check(bRead.status === 200 && (await bRead.json()).length === 0, "B direct database read returns none of A's sources (RLS)");
  if (target) check((await api('B', `/api/signals/${target.id}/analyse`, 'POST', {})).status === 404, "B cannot analyse A's signal");
  saveReport(); process.exit(0);
}

if (mode === 'reasoning') {
  // Stage C continues: its dollar ceiling covers C1–C7 together (spend from the candidate phase is carried in).
  phaseStart = Number(process.env.CANDIDATE_PHASE_START ?? report.candidateStart ?? 0); phaseDollars = DOLLARS.candidate;
  setCeiling(ledger().calls.length + NEED.reasoning);
  const { pairs } = JSON.parse(readFileSync(new URL('../advisor/reasoning-pairs.json', import.meta.url), 'utf8'));
  for (const p of pairs.slice(0, Number(process.env.REASONING_PAIRS ?? 6))) {
    const out = { id: p.id, rubric: p.rubric, answers: {} };
    for (const side of ['a', 'b']) {
      const ctx = { product_description: null, target_customer: null, revenue_model: null, additional_context: null, business_facts: {}, ...p.base };
      if (p.differ.field.startsWith('business_facts.')) ctx.business_facts = { [p.differ.field.split('.')[1]]: p.differ[side] }; else ctx[p.differ.field] = p.differ[side] || null;
      await admin.from('ceo_context').update(ctx).eq('profile_id', R.id);
      const s = await newSession('R', `pair ${p.id} ${side}`);
      const q = await addQuestion('R', s, p.question);
      const r = await step(`C7 ${p.id}:${side}`, () => ask('R', q.session, q.turnId), MAX_COST.advisor);
      out.answers[side] = { status: statusOf(r), text: r.text.split('[[VANTAGE_MEMORY]]')[0].trim(), error: r.error };
    }
    report.reasoning.push(out); saveReport();
    console.log(`\n=== ${p.id}\nRubric: ${p.rubric}\n--- A: ${out.answers.a.text}\n--- B: ${out.answers.b.text}`);
  }
  process.exit(0);
}

if (mode === 'regression') {
  // Correction pass: the corrected B sides of the failed pairs, the tone check, and pre-registered fresh cases.
  // Exact call ceiling and a hard dollar stop (REGRESSION_DOLLARS). Results go to report.regression; the original
  // reasoning outputs (report.reasoning, reasoning-baseline-2026-11-05.json) are never overwritten.
  const { checkAnswer } = await import('../../src/lib/company-context/constraints.ts');
  const { normaliseCompanyContext, companyContextBlock } = await import('../../src/lib/company-context/context.ts');
  const { pairs } = JSON.parse(readFileSync(new URL('../advisor/reasoning-pairs.json', import.meta.url), 'utf8'));
  const { cases } = JSON.parse(readFileSync(new URL('../advisor/reasoning-fresh-cases.json', import.meta.url), 'utf8'));
  const IDS = ['subscription-vs-commission', 'contribution-vs-cash', 'future-vs-feasible', 'bypass-vs-churn'];
  const runs = [
    ...IDS.map((id) => pairs.find((p) => p.id === id)).map((p) => { const ctx = { business_facts: {}, ...p.base }; if (p.differ.field.startsWith('business_facts.')) ctx.business_facts = { [p.differ.field.split('.')[1]]: p.differ.b }; else ctx[p.differ.field] = p.differ.b; return { id: `${p.id}:b`, kind: 'regression', question: p.question, ctx, rubric: p.rubric }; }),
    ...cases.map((c) => ({ id: c.id, kind: 'fresh', question: c.question, ctx: { business_facts: {}, ...c.context }, rubric: c.rubric })),
  ];
  const dollars = Number(process.env.REGRESSION_DOLLARS ?? 0);
  if (!dollars) { console.error('Set REGRESSION_DOLLARS (the approved hard ceiling).'); process.exit(3); }
  phaseStart = ledger().calls.length; phaseDollars = dollars;
  setCeiling(ledger().calls.length + runs.length);
  report.regression = report.regression ?? [];
  for (const r of runs) {
    const ctx = { product_description: null, target_customer: null, revenue_model: null, additional_context: null, ...r.ctx };
    await admin.from('ceo_context').update(ctx).eq('profile_id', R.id);
    const s = await newSession('R', `regression ${r.id}`);
    const q = await addQuestion('R', s, r.question);
    const a = await step(`R ${r.id}`, () => ask('R', q.session, q.turnId), MAX_COST.advisor);
    const text = a.text.split('[[VANTAGE_MEMORY]]')[0].trim();
    const company = normaliseCompanyContext(R.id, {}, ctx);
    const out = { id: r.id, kind: r.kind, rubric: r.rubric, status: statusOf(a), text, error: a.error, check: checkAnswer(text, company, `${companyContextBlock(company)}\n${r.question}`) };
    report.regression.push(out); saveReport();
    console.log(`\n=== ${r.id} (${r.kind})\nRubric: ${r.rubric}\nCheck: ${JSON.stringify(out.check)}\n--- ${text}`);
  }
  process.exit(0);
}

if (mode === 'report') {
  const l = ledger();
  const cost = (c) => { const pr = PRICES[c.model] ?? [0, 0], u = c.usage ?? {}; return ((u.input_tokens ?? 0) * pr[0] + (u.output_tokens ?? 0) * pr[1]) / 1e6 + (u.server_tool_use?.web_search_requests ?? 0) * SEARCH_PRICE; };
  const byKind = {}; let total = 0;
  for (const c of l.calls) { const k = c.kind.split(':')[0]; byKind[k] = byKind[k] ?? { calls: 0, cost: 0, missingUsage: 0 }; byKind[k].calls++; const v = cost(c); byKind[k].cost += v; total += v; if (!c.usage) byKind[k].missingUsage++; }
  console.log(JSON.stringify({ calls: l.calls.length, ceiling: l.limit, estimatedCost: Math.round(total * 10000) / 10000, byKind, steps: report.steps, quotes: report.quotes, passed: report.results.filter((r) => r.ok === true).length, failed: report.results.filter((r) => r.ok === false).map((r) => r.name) }, null, 1));
  process.exit(0);
}

if (mode === 'cleanup') {
  const ids = rows.map((r) => r.id);
  const { data: tri } = await admin.from('signal_triages').select('signal_id').in('profile_id', ids);
  for (const r of rows) { const { error } = await admin.auth.admin.deleteUser(r.id); if (error) throw error; }
  const sids = [...new Set((tri ?? []).map((t) => t.signal_id))];
  if (sids.length) { const { data: still } = await admin.from('signal_triages').select('signal_id').in('signal_id', sids); const keep = new Set((still ?? []).map((t) => t.signal_id)); const del = sids.filter((x) => !keep.has(x)); if (del.length) await admin.from('signals').delete().in('id', del); }
  console.log(`Removed ${rows.length} accounts from the isolated project.`);
}
