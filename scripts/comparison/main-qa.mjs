// Main-app QA against PRODUCTION data with task-created synthetic accounts only. Never touches customer records.
//   COMPARISON_AUTHORIZE_QA=true QA_FILE=<private path> node scripts/comparison/main-qa.mjs setup
//   QA_FILE=<private path> node scripts/comparison/main-qa.mjs api <baseUrl>
//   QA_FILE=<private path> node scripts/comparison/main-qa.mjs cleanup
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in the environment.
// Credentials are written only to QA_FILE (mode 600) and never printed.
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
const { createServerClient } = createRequire(import.meta.url)('@supabase/ssr');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url?.includes('odahuetnflsqkligzwpm')) throw new Error('Unexpected backend');
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const file = process.env.QA_FILE;
if (!file) throw new Error('Set QA_FILE to a private path.');
const save = (v) => writeFileSync(file, JSON.stringify(v), { mode: 0o600 });
const load = () => JSON.parse(readFileSync(file, 'utf8'));

async function signIn(row) {
  let jar = [];
  const sb = createServerClient(url, anon, { cookies: { getAll: () => jar, setAll: (items) => { for (const i of items) { jar = jar.filter((x) => x.name !== i.name); jar.push(i); } } } });
  const { data, error } = await sb.auth.signInWithPassword({ email: row.email, password: row.password });
  if (error) throw error;
  return { cookie: jar.map((x) => `${x.name}=${encodeURIComponent(x.value)}`).join('; '), token: data.session.access_token };
}

const mode = process.argv[2];
if (mode === 'setup') {
  if (process.env.COMPARISON_AUTHORIZE_QA !== 'true') throw new Error('Set COMPARISON_AUTHORIZE_QA=true only for an authorized QA run.');
  const rows = [];
  for (const label of ['A', 'B']) {
    const email = `main-qa-${label.toLowerCase()}-${Date.now()}@vantage.invalid`, password = randomBytes(28).toString('base64url');
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    const row = { id: data.user.id, email, password, label };
    rows.push(row); save(rows);
    const p = await admin.from('profiles').upsert({ id: row.id, email, full_name: 'Main QA ' + label, company_name: 'Main QA ' + label + ' (synthetic)', industry: 'SaaS', onboarding_completed: true, plan: 'pro' });
    if (p.error) throw p.error;
    const c = await admin.from('ceo_context').upsert({ profile_id: row.id, product_description: 'Synthetic workspace for verifying the main app. Not a real company.', target_customer: 'Synthetic evaluation', additional_context: 'Temporary QA account; no customer records.' }, { onConflict: 'profile_id' });
    if (c.error) throw c.error;
  }
  const a = rows[0];
  const sig = await admin.from('signals').insert({ source: 'manual', title: 'QA fixture: synthetic supplier price notice (not real news)', content: 'QA fixture only. A fictional supplier says prices rise 5% next quarter.', urgency: 'watch', category: 'cost_base', what_happened: 'QA fixture: a fictional supplier announced a 5% price rise.', why_it_matters: 'QA fixture: tests the signal-to-decision flow. Not a business claim.', what_to_consider: 'QA fixture: check the synthetic contract.' }).select('id').single();
  if (sig.error) throw sig.error;
  a.signalId = sig.data.id;
  const tri = await admin.from('signal_triages').insert({ signal_id: a.signalId, profile_id: a.id, relevant: true, relevance_score: 50, relevance_reason: 'QA fixture' });
  if (tri.error) throw tri.error;
  const st = await admin.from('strategies').insert({ profile_id: a.id, signal_id: a.signalId, title: 'QA fixture strategy: ask a second supplier', description: 'Synthetic strategy for verifying strategy-origin decisions.', timeline_30d: 'QA 30-day step', timeline_90d: 'QA 90-day step', timeline_6m: 'QA longer-term step', cost_of_inaction: 'QA fixture: no real cost.', status: 'considering' }).select('id').single();
  if (st.error) throw st.error;
  a.strategyId = st.data.id;
  save(rows);
  console.log('Created two synthetic QA accounts, one QA signal link and one QA strategy for account A.');
} else if (mode === 'api') {
  const base = (process.argv[3] || 'http://localhost:3200').replace(/\/$/, ''), origin = new URL(base).origin;
  const [a, b] = load();
  const A = { ...a, ...(await signIn(a)) }, B = { ...b, ...(await signIn(b)) };
  const results = []; let failures = 0;
  const check = (ok, name, detail = '') => { results.push({ ok: Boolean(ok), name, detail: ok ? '' : String(detail).slice(0, 300) }); if (!ok) failures++; };
  const api = async (who, path, method = 'GET', body, extra = {}) => {
    const r = await fetch(base + path, { method, redirect: 'manual', headers: { cookie: who.cookie, origin, 'content-type': 'application/json', ...extra }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let data; try { data = JSON.parse(t); } catch { data = { raw: t.slice(0, 120) }; }
    return { status: r.status, data };
  };
  const cmd = (who, body) => api(who, '/api/workspace', 'POST', body);
  const ws = async (who) => (await api(who, '/api/workspace')).data;
  // Entry points
  check((await api(A, '/app')).status === 200, 'signed-in /app renders');
  check((await api(A, '/test')).status === 200, 'signed-in /test alias renders');
  const r0 = await ws(A); check(r0.durable?.ready === true, 'durable storage ready', JSON.stringify(r0.durable));
  check(r0.signals.some((s) => s.id === a.signalId) && !(await ws(B)).signals.some((s) => s.id === a.signalId), 'signal visible only to its account');
  // Create with notes; duplicate prevention from a signal
  const notes = { goal: 'QA goal: learn the real price impact', limit: 'QA limit: no contract change this month', evidence: [{ id: 'e1', kind: 'external', claim: 'QA claim from the synthetic signal', source: 'QA fixture', url: 'https://example.org/qa', date: '2026-10-27', limit: 'Not business proof', decisive: true }], signalLink: { eventId: a.signalId, developmentId: 'original:' + a.signalId } };
  let c = await cmd(A, { operation: 'create-decision', input: { title: 'QA decision from a signal', description: 'Synthetic verification only.', source: 'signal', source_id: a.signalId, support: notes } });
  check(c.status === 201 && c.data.workspace?.version === 1 && c.data.workspace.support.evidence.length === 1, 'create from signal saves notes atomically', JSON.stringify(c.data).slice(0, 300));
  const d = c.data; A.decisionId = d.id;
  const dup = await cmd(A, { operation: 'create-decision', input: { title: 'Another QA question', source: 'signal', source_id: a.signalId } });
  check(dup.status === 409 && dup.data.code === 'existing' && dup.data.decisionId === d.id, 'existing connected decision offered first', JSON.stringify(dup.data));
  const twice = await cmd(A, { operation: 'create-decision', input: { title: 'QA decision from a signal', source: 'signal', source_id: a.signalId, allowNew: true } });
  check(twice.status === 200 && twice.data.duplicate && twice.data.id === d.id, 'double submission returns the first record', JSON.stringify(twice.data).slice(0, 200));
  const badUrl = await cmd(A, { operation: 'create-decision', input: { title: 'QA bad link', support: { evidence: [{ id: 'x', kind: 'external', claim: 'c', url: 'javascript:alert(1)' }] } } });
  check(badUrl.status === 400, 'unsafe evidence link rejected', badUrl.status);
  const badDate = await cmd(A, { operation: 'create-decision', input: { title: 'QA bad date', deadline: '2026-02-30' } });
  check(badDate.status === 400, 'impossible date rejected', badDate.status);
  // Frame, learning, options, choice
  let cur = c.data, ver = 1;
  const saveD = async (input, support, who = A, id = d.id, upd = cur.updated_at, v = ver) => cmd(who, { operation: 'save-decision', id, expectedUpdatedAt: upd, expectedVersion: v, input, support });
  let r = await saveD({ deadline: '2026-11-30' }, { ...notes, learning: { question: 'Does the price rise apply to us?', check: 'Read the synthetic contract', trigger: 'Clause found', date: '2026-11-10' }, inaction: 'QA: we pay 5% more', scenario: { currentPrice: '10', currentCustomers: '100', newPrice: '12', newCustomers: '90' } });
  check(r.status === 200 && r.data.workspace.version === 2 && r.data.workspace.support.scenario.result.delta === 80, 'frame, learning, inaction and scenario saved; arithmetic server-side', JSON.stringify(r.data).slice(0, 300));
  const stale = await saveD({ title: 'Stale overwrite' }, null, A, d.id, cur.updated_at, 1);
  check(stale.status === 409, 'stale workspace version rejected', stale.status);
  cur = r.data.decision; ver = 2;
  const option = { id: randomUUID(), title: 'QA: ask a second supplier', description: 'QA: ask a second supplier', detail: 'Synthetic', expected: 'Learn the market price', reasonRejected: 'Takes a week', effort: 'Low', fit: 'within', reversibility: 'easy', next: 'Email one supplier' };
  r = await saveD({ alternatives_considered: [option] }, null); check(r.status === 200, 'option saved'); cur = r.data.decision;
  const snapshot = { at: new Date().toISOString(), optionId: option.id, optionTitle: option.title, why: 'Bounded test', expected: 'A comparable quote', uncertainty: '', next: 'Email supplier', review: '2026-11-20', condition: '', exception: '', context: { question: d.title } };
  const ws2 = (await ws(A)).workspaces[d.id].support;
  const noChoice = await saveD({ status: 'decided', rationale: 'Bounded test' }, { ...ws2, snapshot });
  check(noChoice.status === 400, 'snapshot without explicit chosen option rejected', noChoice.status);
  const chosen = { ...option, comparisonChoice: { why: 'Bounded test', next: 'Email supplier', condition: '', review: '2026-11-20', saved: snapshot.at } };
  r = await saveD({ status: 'decided', rationale: 'Bounded test', alternatives_considered: [chosen] }, { ...ws2, snapshot });
  check(r.status === 200 && r.data.decision.status === 'decided' && r.data.workspace.support.snapshot?.why === 'Bounded test', 'choice and snapshot recorded atomically', JSON.stringify(r.data).slice(0, 300));
  cur = r.data.decision; ver = r.data.workspace.version; const recorded = r.data.workspace.support;
  const rewrite = await saveD({}, { ...recorded, snapshot: { ...recorded.snapshot, why: 'Rewritten' } });
  check(rewrite.status === 400, 'snapshot rewrite rejected by API', rewrite.status);
  const reopen = await saveD({ status: 'open' }, null); check(reopen.status === 400, 'recorded choice cannot be reopened', reopen.status);
  // Database guard even when the API is bypassed with the user's own token
  const direct = await fetch(`${url}/rest/v1/decision_workspaces?decision_id=eq.${d.id}`, { method: 'PATCH', headers: { apikey: anon, Authorization: `Bearer ${A.token}`, 'content-type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ support: { ...recorded, snapshot: null }, version: ver + 1 }) });
  check(direct.status >= 400, 'database trigger blocks snapshot removal via direct API', direct.status);
  // Review: too early then observed; append-only
  r = await saveD({}, { ...recorded, reviews: [{ at: new Date().toISOString(), status: 'too-early', observed: 'QA: no reply yet', executed: 'yes', learned: '', nextReview: '2026-12-01' }] });
  check(r.status === 200 && r.data.workspace.support.reviews.length === 1, 'too-early review appended with new date'); cur = r.data.decision; ver = r.data.workspace.version;
  const withReview = r.data.workspace.support;
  r = await saveD({ actual_outcome: 'QA: quote received (synthetic)' }, { ...withReview, reviews: [...withReview.reviews, { at: new Date().toISOString(), status: 'observed', observed: 'QA: quote received', executed: 'yes', learned: 'QA: ask earlier', nextReview: '' }] });
  check(r.status === 200 && r.data.decision.actual_outcome && r.data.workspace.support.reviews.length === 2, 'observed outcome appended; original review kept'); cur = r.data.decision; ver = r.data.workspace.version;
  const erase = await saveD({}, { ...r.data.workspace.support, reviews: [] }); check(erase.status === 400, 'review deletion rejected', erase.status);
  // Reconsider; archive/restore
  const child = await cmd(A, { operation: 'create-decision', input: { title: 'Revisit: QA decision from a signal', source: 'manual', parentId: d.id, allowNew: true, support: { goal: 'QA goal: learn the real price impact' } } });
  check(child.status === 201 && child.data.workspace?.parentId === d.id, 'reconsideration linked to the original', JSON.stringify(child.data).slice(0, 200));
  r = await saveD({ status: 'archived' }, null); check(r.status === 200, 'archive'); cur = r.data.decision;
  r = await saveD({ status: 'decided' }, null); check(r.status === 200 && r.data.decision.rationale === 'Bounded test' && r.data.decision.actual_outcome, 'restore keeps choice and outcome'); cur = r.data.decision;
  // Strategy-origin decision
  const fromStrategy = await cmd(A, { operation: 'create-decision', input: { title: 'QA decision from a strategy', source: 'strategy', source_id: a.strategyId } });
  check(fromStrategy.status === 201 && fromStrategy.data.source === 'strategy' && fromStrategy.data.source_id === a.strategyId, 'strategy-origin decision keeps its strategy', JSON.stringify(fromStrategy.data).slice(0, 200));
  // Signal preferences
  const pref = (action, v, revision = 'original:' + a.signalId, who = A, signalId = a.signalId) => cmd(who, { operation: 'signal-preference', signalId, action, revision, expectedVersion: v });
  r = await pref('watch', 0); check(r.status === 200 && r.data.watching && r.data.version === 1, 'watch saved');
  r = await pref('ack', 1); check(r.status === 200 && r.data.watching && r.data.acknowledged_revision, 'done for now keeps watching');
  r = await pref('dismiss', 1); check(r.status === 409, 'stale signal preference rejected', r.status);
  r = await pref('dismiss', 2); check(r.status === 200 && r.data.dismissed, 'dismiss saved');
  r = await pref('restore', 3); check(r.status === 200 && !r.data.dismissed, 'restore saved');
  // Advisor session + link
  const sess = await api(A, '/api/advisor/sessions', 'POST', { title: 'QA conversation (synthetic)' });
  check(sess.status === 201, 'session created'); A.sessionId = sess.data.id;
  r = await cmd(A, { operation: 'link-session', sessionId: A.sessionId, kind: 'decision', contextId: d.id }); check(r.status === 201, 'conversation linked to decision', JSON.stringify(r.data));
  r = await cmd(A, { operation: 'link-session', sessionId: A.sessionId, kind: 'strategy', contextId: a.strategyId }); check(r.status === 409, 'a conversation keeps one context', r.status);
  const saved = await cmd(A, { operation: 'save-session', id: A.sessionId, expectedUpdatedAt: sess.data.updated_at, messages: [{ role: 'user', content: 'QA question' }, { role: 'assistant', content: 'QA partial', incomplete: true }] });
  check(saved.status === 200 && saved.data.messages[1].incomplete === true, 'stopped reply stored and labelled');
  // Account B: isolation on every object
  const bws = await ws(B);
  check(!bws.decisions.some((x) => x.id === d.id) && !bws.workspaces[d.id] && !Object.keys(bws.sessionLinks).length && !Object.keys(bws.signalPreferences).length, 'account B sees none of A’s decisions, notes, links or signal choices');
  check((await cmd(B, { operation: 'save-decision', id: d.id, expectedUpdatedAt: cur.updated_at, expectedVersion: ver, input: { title: 'Steal' }, support: null })).status === 404, 'B cannot save A’s decision');
  check((await cmd(B, { operation: 'signal-preference', signalId: a.signalId, action: 'watch', revision: 'x', expectedVersion: 0 })).status === 404, 'B cannot set A’s signal preference');
  check((await cmd(B, { operation: 'link-session', sessionId: A.sessionId, kind: 'decision', contextId: d.id })).status === 404, 'B cannot link A’s conversation');
  check((await cmd(B, { operation: 'create-decision', input: { title: 'x', source: 'strategy', source_id: a.strategyId } })).status === 404, 'B cannot use A’s strategy as a source');
  check((await cmd(B, { operation: 'create-decision', input: { title: 'x', parentId: d.id } })).status === 404, 'B cannot reconsider A’s decision');
  check((await api(B, '/api/advisor/sessions/' + A.sessionId)).status === 404, 'B cannot read A’s conversation');
  const bDirect = await fetch(`${url}/rest/v1/decision_workspaces?select=decision_id`, { headers: { apikey: anon, Authorization: `Bearer ${B.token}` } });
  check(bDirect.status === 200 && (await bDirect.json()).length === 0, 'B direct database read returns none of A’s rows');
  check((await api(A, '/api/workspace', 'POST', { operation: 'sign-out' }, { origin: 'https://unrelated.invalid' })).status === 403, 'cross-origin write rejected');
  // Import: idempotent, never overwrites
  const blank = await cmd(A, { operation: 'create-decision', input: { title: 'QA import target' } });
  const imp = { decisions: { [blank.data.id]: { stamp: blank.data.updated_at, support: { goal: 'QA imported goal', thread: [{ role: 'user', content: 'x' }] } }, [d.id]: { stamp: 'old', support: { goal: 'Should not overwrite' } } }, sessionLinks: {}, preferences: { watch: [a.signalId], dismiss: [], ack: {}, watchBaseline: {} } };
  r = await cmd(A, { operation: 'import-notes', notes: imp });
  const res = Object.fromEntries(r.data.report.decisions.map((x) => [x.id, x.result]));
  check(res[blank.data.id] === 'imported' && res[d.id] === 'already-in-account' && r.data.report.signals[0].result === 'already-in-account', 'import fills only empty records and never overwrites', JSON.stringify(r.data.report));
  r = await cmd(A, { operation: 'import-notes', notes: imp });
  check(r.data.report.decisions.every((x) => x.result !== 'imported'), 'import is idempotent');
  // Fresh load (no browser storage involved): everything is back from the account
  const fresh = await ws(A);
  const fw = fresh.workspaces[d.id];
  check(fw?.support.snapshot?.why === 'Bounded test' && fw.support.reviews.length === 2 && fw.support.evidence[0].decisive && fw.support.learning.date === '2026-11-10', 'fresh load returns snapshot, reviews, evidence and learning');
  check(fresh.sessionLinks[A.sessionId]?.id === d.id && fresh.signalPreferences[a.signalId]?.watching === true, 'fresh load returns conversation link and Watch');
  check(fresh.workspaces[child.data.id]?.parentId === d.id && fresh.workspaces[blank.data.id]?.provenance === 'imported_browser_notes', 'fresh load returns reconsideration link and import label');
  A.decisionIds = [d.id, child.data.id, fromStrategy.data.id, blank.data.id];
  const rows = load(); rows[0].sessionIds = [...new Set([...(rows[0].sessionIds || []), A.sessionId])]; save(rows);
  for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'} ${x.name}${x.ok ? '' : ' :: ' + x.detail}`);
  console.log(`\n${results.length - failures}/${results.length} passed against ${base}`);
  process.exit(failures ? 1 : 0);
} else if (mode === 'cleanup') {
  const rows = load();
  for (const row of rows) {
    if (row.signalId) { const s = await admin.from('signals').delete().eq('id', row.signalId).like('title', 'QA fixture:%'); if (s.error) throw s.error; }
    const { error } = await admin.auth.admin.deleteUser(row.id); if (error) throw error;
  }
  console.log(`Removed ${rows.length} synthetic QA accounts and their QA records.`);
} else {
  console.log('Usage: setup | api <baseUrl> | cleanup');
}
