// The REAL refresh endpoint on a local server whose provider ledger has no calls left (PROVIDER_BUDGET_FILE with
// limit = calls already used). Collection (RSS, NewsAPI, company sources) runs for real; every paid step is refused
// before anything is sent. Checks persistence and failure reporting, and that no provider call was made.
// Run (isolated project only):
//   node scripts/isolated/with-isolated-env.mjs node scripts/isolated/refresh-zero-budget.mjs
// Env: QA_FILE (test accounts, mode 600), PROVIDER_BUDGET_FILE (the server's ledger), BASE (default :3301).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url.includes('acqhieylvcemgcevrxvc')) throw new Error('Isolated project only.');
const base = process.env.BASE ?? 'http://localhost:3301';
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ledgerCalls = () => JSON.parse(readFileSync(process.env.PROVIDER_BUDGET_FILE, 'utf8')).calls.length;
const who = JSON.parse(readFileSync(process.env.QA_FILE, 'utf8')).find((r) => r.label === (process.env.ACCOUNT ?? 'A'));

let jar = [];
const sb = createServerClient(url, anon, { cookies: { getAll: () => jar, setAll: (items) => { for (const i of items) { jar = jar.filter((x) => x.name !== i.name); jar.push(i); } } } });
const { error } = await sb.auth.signInWithPassword({ email: who.email, password: who.password });
if (error) throw error;
const cookie = jar.map((x) => `${x.name}=${encodeURIComponent(x.value)}`).join('; ');

async function snapshot() {
  const [{ data: tr }, { count: runs }, { data: lastRun }] = await Promise.all([
    admin.from('signal_triages').select('signal_id,relevance_reason').eq('profile_id', who.id),
    admin.from('source_collection_runs').select('id', { count: 'exact', head: true }).eq('profile_id', who.id),
    admin.from('source_collection_runs').select('status,trigger,report,started_at,finished_at,error').eq('profile_id', who.id).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const links = (tr ?? []).map((t) => { let s = {}; try { s = JSON.parse(t.relevance_reason); } catch { /* */ } return { id: t.signal_id, status: s.status, checked: s.checked, contextVersion: s.contextVersion }; });
  return { links, runs, lastRun };
}

const before = await snapshot(), calls0 = ledgerCalls();
const t0 = Date.now();
const res = await fetch(`${base}/api/signals/refresh`, { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: '{}' });
const body = await res.json().catch(() => ({}));
const ms = Date.now() - t0;
const after = await snapshot(), calls1 = ledgerCalls();

const out = {
  status: res.status, ms, body: { ...body, sourcePlan: body.sourcePlan ? { ...body.sourcePlan, sources: body.sourcePlan.sources?.map((s) => ({ label: s.label, ok: s.ok, items: s.items, error: s.error })) } : undefined },
  providerCalls: calls1 - calls0,
  before: { links: before.links, runs: before.runs },
  after: { links: after.links, runs: after.runs, lastRun: after.lastRun ? { ...after.lastRun, report: undefined, reportKeys: Object.keys(after.lastRun.report ?? {}) } : null },
  linksUnchanged: JSON.stringify(before.links.filter((l) => after.links.some((a) => a.id === l.id))) === JSON.stringify(after.links.filter((a) => before.links.some((l) => l.id === a.id))),
  newLinks: after.links.filter((a) => !before.links.some((l) => l.id === a.id)),
};
console.log(JSON.stringify(out, null, 1));
