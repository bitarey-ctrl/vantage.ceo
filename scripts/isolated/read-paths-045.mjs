// After 045 on the isolated project: browser-facing reads through the real API and direct database reads with a
// user's token. No provider calls. Run: node scripts/isolated/with-isolated-env.mjs node scripts/isolated/read-paths-045.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { createServerClient } = require('@supabase/ssr');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url.includes('acqhieylvcemgcevrxvc')) throw new Error('Isolated project only.');
const base = process.env.BASE ?? 'http://localhost:3301';
const rows = JSON.parse(readFileSync(process.env.QA_FILE, 'utf8'));
async function signIn(r) {
  let jar = []; const sb = createServerClient(url, anon, { cookies: { getAll: () => jar, setAll: (i) => { for (const x of i) { jar = jar.filter((y) => y.name !== x.name); jar.push(x); } } } });
  const { data, error } = await sb.auth.signInWithPassword({ email: r.email, password: r.password }); if (error) throw error;
  return { cookie: jar.map((x) => `${x.name}=${encodeURIComponent(x.value)}`).join('; '), token: data.session.access_token };
}
const out = {};
const S = {}; for (const r of rows.filter((r) => r.label !== 'R')) S[r.label] = await signIn(r);
for (const who of ['A', 'B']) {
  const ws = await fetch(`${base}/api/workspace`, { headers: { cookie: S[who].cookie } });
  const w = await ws.json().catch(() => ({}));
  const raw = await fetch(`${base}/api/signals/raw`, { headers: { cookie: S[who].cookie } });
  const rj = await raw.json().catch(() => ({}));
  const rest = await fetch(`${url}/rest/v1/signals?select=id,title`, { headers: { apikey: anon, Authorization: `Bearer ${S[who].token}` } });
  const restRows = await rest.json().catch(() => []);
  out[who] = { workspace: ws.status, workspaceSignals: (w.signals ?? w.data?.signals ?? []).length, workspaceErrors: w.errors ?? null, raw: raw.status, rawCount: Array.isArray(rj) ? rj.length : rj, directSignalsRead: rest.status, directSignals: Array.isArray(restRows) ? restRows.map((s) => s.title.slice(0, 60)) : restRows };
}
const forge = await fetch(`${url}/rest/v1/signal_triages`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${S.B.token}`, 'content-type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ signal_id: '00000000-0000-4000-8000-000000000000', profile_id: rows.find((r) => r.label === 'B').id, relevance_score: 1 }) });
out.B.forgeTriage = forge.status;
const anonRead = await fetch(`${url}/rest/v1/signals?select=id`, { headers: { apikey: anon } });
out.anonDirectRead = anonRead.status;
console.log(JSON.stringify(out, null, 1));
