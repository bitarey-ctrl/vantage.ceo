// SCRIPTED-PROVIDER run of the REAL scheduled handler (src/app/api/cron/ingest/route.ts) against the ISOLATED
// database. The model SDK and every non-Supabase host are scripted, so no provider is called and nothing is spent;
// run it through a wrapper with a dummy model key so an unmocked call would fail rather than bill. Writes go to the
// isolated project only (scripted items are titled "[SCRIPTED TEST]"). Run:
// ENV_DIR=<main checkout> node <with-isolated-nokey.mjs> node --experimental-test-module-mocks \
//   --import ./scripts/company-context/ts-resolve.mjs scripts/isolated/cron-scripted.mjs
import { mock } from 'node:test';
import { writeFileSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('acqhieylvcemgcevrxvc')) { console.error('Refusing: not the isolated project.'); process.exit(2); }
if (process.env.ANTHROPIC_API_KEY !== 'sk-ant-invalid-no-spend') { console.error('Refusing: run with the no-spend wrapper (dummy model key).'); process.exit(2); }
const LEDGER = process.env.PROVIDER_BUDGET_FILE;
if (!LEDGER) { console.error('Set PROVIDER_BUDGET_FILE (a fresh test ledger).'); process.exit(2); }

const T0 = new Date().toISOString();
const calls = []; let delayMs = 0; let gateCallsThisRun = 0;
mock.module('@anthropic-ai/sdk', { defaultExport: class Anthropic {
  static APIError = class extends Error {};
  constructor() { this.messages = { create: async (params) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const p = params.messages[0].content;
    const kind = p.includes('You are the relevance gate') ? 'gate' : 'assessment';
    calls.push({ kind, structured: Boolean(params.output_config?.format), model: params.model });
    const reply = (text, stop = 'end_turn') => ({ _request_id: `req_scripted_${calls.length}`, model: 'claude-sonnet-5-5', stop_reason: stop, usage: { input_tokens: 1000, output_tokens: 50 }, content: [{ type: 'text', text }] });
    if (kind === 'gate') {
      gateCallsThisRun++;
      // Every second gate call is cut off: a partial failure inside one profile's run.
      if (gateCallsThisRun % 2 === 0) return reply('{"signals":[{"index":0,', 'max_tokens');
      const items = [...p.matchAll(/\[(\d+)\][^\n]*?(\[SCRIPTED TEST\] Supplier raises prices[^\n]*)/g)].map((m) => Number(m[1]));
      return reply(JSON.stringify({ signals: items.map((index) => ({ index, category: 'cost_base', what_happened: 'A packaging supplier raised prices.', why_it_matters: 'Businesses that buy this packaging pay more from next month.', what_to_consider: 'Check your next packaging invoice.' })) }));
    }
    const items = [...p.matchAll(/^\[(\d+)\] (.*)$/gm)].map((m) => ({ i: Number(m[1]), title: m[2] }));
    const company = p.slice(p.indexOf('COMPANY (founder-reported):'), p.indexOf('Founder estimates'));
    const basis = company.split('\n').map((l) => l.trim()).find((l) => /^(What they sell|Product|Depends on)[^:]*:/i.test(l)) ?? null;
    const relevantHere = company.includes('Control account');
    return reply(JSON.stringify(items.map((x) => relevantHere && /Supplier raises prices/.test(x.title) && basis
      ? { i: x.i, decision: 'relevant', exposure: 'direct', reject_reason: null, same_event_as: null, what_changed: 'A packaging supplier raised prices.', connection: `This touches what you stated: ${basis}`, basis_fact: basis, effect: 'If you buy from them, your costs rise.', unknowns: 'Your contract terms.', next_step: 'Check your next invoice.', watch_for: null, quantified: null }
      : { i: x.i, decision: 'reject', exposure: 'none', reject_reason: 'no_plausible_effect', same_event_as: null, what_changed: null, connection: null, basis_fact: null, effect: null, unknowns: null, next_step: null, watch_for: null, quantified: null })));
  } }; }
} });

// Network: Supabase passes through to the isolated project; everything else is scripted.
const realFetch = globalThis.fetch; const scriptedHosts = new Map();
const NOW = new Date().toUTCString();
const rss = (n) => `<rss><channel>${[`[SCRIPTED TEST] Supplier raises prices on coffee packaging ${T0}`, ...Array.from({ length: n }, (_, i) => `[SCRIPTED TEST] Unrelated item ${i} ${T0}`)].map((t, i) => `<item><title>${t}</title><link>https://scripted.invalid/${i}-${encodeURIComponent(T0)}</link><pubDate>${NOW}</pubDate><description>${t}.</description></item>`).join('')}</channel></rss>`;
globalThis.fetch = async (input, init) => {
  const u = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (u.hostname.endsWith('.supabase.co')) return realFetch(input, init);
  scriptedHosts.set(u.hostname, (scriptedHosts.get(u.hostname) ?? 0) + 1);
  if (u.hostname === 'newsapi.org') return new Response(JSON.stringify({ status: 'ok', articles: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  if (/rss|feed|news\.google|\.xml/i.test(u.href)) return new Response(rss(14), { status: 200, headers: { 'content-type': 'application/rss+xml' } });
  return new Response('not found (scripted)', { status: 404, headers: { 'content-type': 'text/plain' } });
};

const route = await import('../../src/app/api/cron/ingest/route.ts');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const post = (auth) => route.POST(new Request('http://localhost/api/cron/ingest', { method: 'POST', headers: auth ? { authorization: auth } : {} }));
const ledger = () => JSON.parse(readFileSync(LEDGER, 'utf8'));
const report = { startedAt: T0, checks: {} };

// 1. Authorization (and the method Vercel Cron uses).
report.checks.auth = { noHeader: (await post(null)).status, wrongSecret: (await post('Bearer wrong')).status, exportsGET: typeof route.GET === 'function' };

// 2. Run 1: all three accounts, cost ceiling active (8 calls / $0.50 worst case reserved per call).
writeFileSync(LEDGER, JSON.stringify({ limit: 8, calls: [], dollarLimit: 0.5, prices: { 'claude-sonnet-5-5': [2, 10] } }), { mode: 0o600 });
gateCallsThisRun = 0;
let res = await post(`Bearer ${process.env.CRON_SECRET}`);
report.run1 = { http: res.status, body: await res.json(), ledgerCalls: ledger().calls.length, ledgerFailures: ledger().calls.filter((c) => c.failure).length, scriptedCalls: calls.length };

// 3. Persistence after run 1.
const { data: runs } = await db.from('source_collection_runs').select('profile_id,status,trigger,report,started_at').gte('started_at', T0).order('started_at');
const { data: marks } = await db.from('feature_events').select('profile_id,created_at').eq('event', 'profile_ingested').gte('created_at', T0).order('created_at');
const { data: sigs } = await db.from('signals').select('id,title,category').like('title', `%${T0}%`);
const sigIds = (sigs ?? []).map((s) => s.id);
const { data: links } = sigIds.length ? await db.from('signal_triages').select('profile_id,signal_id').in('signal_id', sigIds) : { data: [] };
report.persistence = {
  runs: (runs ?? []).map((r) => ({ profile: r.profile_id.slice(0, 8), status: r.status, trigger: r.trigger ?? r.report?.trigger ?? null, pipeline: r.report?.pipeline ? { status: r.report.pipeline.status, affected: r.report.pipeline.affected, diagnostics: (r.report.pipeline.diagnostics ?? []).map((d) => `${d.stage}:${d.ok ? 'ok' : d.failure}`) } : null })),
  servedMarks: (marks ?? []).map((m) => m.profile_id.slice(0, 8)),
  scriptedSignalsStored: (sigs ?? []).map((s) => s.title.slice(0, 60)),
  links: (links ?? []).map((l) => l.profile_id.slice(0, 8)),
};

// 4. Run 2: rotation and the time budget. Slow scripted provider (22 s per call) so the 50 s budget defers someone.
writeFileSync(LEDGER, JSON.stringify({ limit: 20, calls: [], dollarLimit: 5, prices: { 'claude-sonnet-5-5': [2, 10] } }), { mode: 0o600 });
delayMs = 22_000; gateCallsThisRun = 0;
const t2 = Date.now();
res = await post(`Bearer ${process.env.CRON_SECRET}`);
const body2 = await res.json();
report.run2 = { http: res.status, seconds: Math.round((Date.now() - t2) / 1000), eligible: body2.profilesEligible, processed: body2.profilesProcessed, deferred: body2.profilesDeferred, order: (body2.results ?? []).map((r) => r.profileId.slice(0, 8)), statuses: (body2.results ?? []).map((r) => r.status ?? r.error) };
// 5. Run 3: cost ceiling. A ledger with room for one call: later calls are refused before anything is sent.
writeFileSync(LEDGER, JSON.stringify({ limit: 1, calls: [], dollarLimit: 5, prices: { 'claude-sonnet-5-5': [2, 10] } }), { mode: 0o600 });
delayMs = 0; gateCallsThisRun = 0; const sentBefore = calls.length;
res = await post(`Bearer ${process.env.CRON_SECRET}`);
const body3 = await res.json();
report.run3 = { http: res.status, providerRequestsSent: calls.length - sentBefore, ledgerCalls: ledger().calls.length, results: (body3.results ?? []).map((r) => ({ profile: r.profileId.slice(0, 8), status: r.status ?? null, error: r.error ? r.error.slice(0, 120) : null, message: r.statusMessage ? r.statusMessage.slice(0, 200) : null })) };
const { data: runsAll } = await db.from('source_collection_runs').select('profile_id,status,started_at,report').gte('started_at', T0).order('started_at');
report.storedRunsAllRuns = (runsAll ?? []).map((r) => `${r.profile_id.slice(0, 8)} ${r.status} ${r.report?.pipeline ? r.report.pipeline.status + ' [' + r.report.pipeline.affected.join(',') + ']' : 'no pipeline'}`);
report.network = Object.fromEntries(scriptedHosts);
report.modelCalls = { total: calls.length, gate: calls.filter((c) => c.kind === 'gate').length, structuredGate: calls.filter((c) => c.kind === 'gate' && c.structured).length, assessment: calls.filter((c) => c.kind === 'assessment').length, models: [...new Set(calls.map((c) => c.model))] };
console.log(JSON.stringify(report, null, 1));
