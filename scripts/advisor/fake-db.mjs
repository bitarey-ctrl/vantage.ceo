// A small in-memory stand-in for the Supabase/PostgREST client, for handler-level tests.
// Each statement runs atomically (as one SQL statement would) but statements from concurrent requests interleave,
// so races between requests are exercised. Primary keys / unique keys are enforced like the database does.
// It simulates Postgres semantics; it is NOT a substitute for running the SQL on a real database.
const KEYS = {
  advisor_memory_ops: ['profile_id', 'session_id', 'turn_id'],
  ceo_context: ['profile_id'],
  profiles: ['id'],
  advisor_sessions: ['id'],
};
const tick = () => new Promise((r) => setImmediate(r));
// Mirrors migration 042's trigger: tracked ceo_context fields bump a per-field version and append history.
const TRACKED = ['product_description', 'target_customer', 'top_priority', 'top_priority_other', 'arr_band', 'competitors', 'additional_context', 'revenue_model', 'geography_detail', 'strategic_priorities', 'avoided_decision'];

export function createFakeDb(seed = {}, { missing = [] } = {}) {
  const tables = new Map(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const rows = (t) => { if (!tables.has(t)) tables.set(t, []); return tables.get(t); };
  const log = [];
  let factSource = 'direct';
  function trackFacts(before, after) {
    for (const f of TRACKED) {
      const o = before ? JSON.stringify(before[f] ?? null) : 'null', n = JSON.stringify(after[f] ?? null);
      if (o === n) continue;
      const vs = rows('company_fact_versions');
      let v = vs.find((r) => r.profile_id === after.profile_id && r.field === f);
      if (!v) { v = { profile_id: after.profile_id, field: f, version: 0 }; vs.push(v); }
      v.version += 1;
      rows('company_fact_history').push({ profile_id: after.profile_id, field: f, version: v.version, old_value: before ? before[f] ?? null : null, new_value: after[f] ?? null, source: factSource });
    }
  }
  let failNext = null; // { table, op } → next matching statement returns a database error
  function builder(table) {
    const st = { op: 'select', filters: [], payload: null, single: null, opts: {}, limit: null, order: null };
    const b = {
      select() { if (st.op === 'select') st.op = 'select'; return b; },
      insert(p) { st.op = 'insert'; st.payload = p; return b; },
      upsert(p, o = {}) { st.op = 'upsert'; st.payload = p; st.opts = o; return b; },
      update(p) { st.op = 'update'; st.payload = p; return b; },
      delete() { st.op = 'delete'; return b; },
      eq(c, v) { st.filters.push((r) => (c.includes('->>') ? (r[c.split('->>')[0]] ?? {})[c.split('->>')[1]] === v : r[c] === v)); return b; },
      neq(c, v) { st.filters.push((r) => r[c] !== v); return b; },
      lt(c, v) { st.filters.push((r) => r[c] < v); return b; },
      gte(c, v) { st.filters.push((r) => r[c] >= v); return b; },
      in(c, vs) { st.filters.push((r) => vs.includes(r[c])); return b; },
      match(o) { for (const [c, v] of Object.entries(o)) b.eq(c, v); return b; },
      order(col, o = {}) { st.order = { col, asc: o.ascending !== false }; return b; },
      limit(n) { st.limit = n; return b; },
      single() { st.single = 'single'; return run(); },
      maybeSingle() { st.single = 'maybe'; return run(); },
      then(res, rej) { return run().then(res, rej); },
    };
    async function run() {
      await tick(); // let concurrent requests interleave between statements
      log.push({ table, op: st.op });
      if (missing.includes(table)) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } };
      if (failNext && failNext.table === table && failNext.op === st.op) { failNext = null; return { data: null, error: { code: 'XX000', message: 'simulated failure' } }; }
      const all = rows(table), keys = KEYS[table];
      const sameKey = (a, r) => keys && keys.every((k) => a[k] === r[k]);
      const match = all.filter((r) => st.filters.every((f) => f(r)));
      let out;
      if (st.op === 'select') out = match;
      else if (st.op === 'insert') {
        const list = Array.isArray(st.payload) ? st.payload : [st.payload];
        for (const p of list) if (keys && all.some((r) => sameKey(p, r))) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        out = list.map((p) => ({ created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...p }));
        all.push(...out);
      } else if (st.op === 'upsert') {
        const list = Array.isArray(st.payload) ? st.payload : [st.payload]; out = [];
        for (const p of list) {
          const hit = all.find((r) => sameKey(p, r));
          if (hit) { if (!st.opts.ignoreDuplicates) Object.assign(hit, p); else continue; out.push(hit); } else { const n = { ...p }; all.push(n); out.push(n); }
        }
      } else if (st.op === 'update') { for (const r of match) { const before = { ...r }; Object.assign(r, st.payload); if (table === 'ceo_context' && !missing.includes('company_fact_versions')) trackFacts(before, r); } out = match; }
      else if (st.op === 'delete') { tables.set(table, all.filter((r) => !match.includes(r))); out = match; }
      if (st.order) { const { col, asc } = st.order; out = [...out].sort((x, y) => (x[col] > y[col] ? 1 : x[col] < y[col] ? -1 : 0) * (asc ? 1 : -1)); }
      if (st.limit) out = out.slice(0, st.limit);
      const copy = out.map((r) => JSON.parse(JSON.stringify(r)));
      if (st.single === 'single') return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } };
      if (st.single === 'maybe') return { data: copy[0] ?? null, error: null };
      return { data: copy, error: null };
    }
    return b;
  }
  // Mirrors apply_advisor_memory() in migration 042, executed as one atomic step.
  async function rpc(fn, a) {
    await tick();
    if (fn !== 'apply_advisor_memory' || missing.includes('rpc')) return { data: null, error: { code: 'PGRST202', message: 'function not found' } };
    if (failNext && failNext.table === 'rpc') { failNext = null; return { data: null, error: { code: 'XX000', message: 'simulated failure' } }; }
    const op = rows('advisor_memory_ops').find((r) => r.profile_id === a.p_profile && r.session_id === a.p_session && r.turn_id === a.p_turn);
    if (!op || op.claim_token !== a.p_token || op.status !== 'claimed' || op.lease_until < new Date().toISOString()) return { data: { result: 'lost_claim' }, error: null };
    if (op.field !== a.p_field) return { data: { result: 'rejected', error: 'field does not match the claim' }, error: null };
    const vs = rows('company_fact_versions');
    let v = vs.find((r) => r.profile_id === a.p_profile && r.field === a.p_field);
    if (!v) { v = { profile_id: a.p_profile, field: a.p_field, version: 0 }; vs.push(v); }
    const appended = ['competitors', 'additional_context'].includes(a.p_field);
    if (!appended && v.version !== (op.based_on_version ?? 0)) { op.status = 'conflict'; op.conflict = { based_on_version: op.based_on_version, current_version: v.version, proposed: a.p_value }; return { data: { result: 'conflict', current_version: v.version }, error: null }; }
    if (v.version !== a.p_expected_version) return { data: { result: 'retry', current_version: v.version }, error: null };
    const ctx = rows('ceo_context').find((r) => r.profile_id === a.p_profile);
    if (!ctx) return { data: { result: 'retry' }, error: null };
    const before = { ...ctx };
    if (a.p_field === 'top_priority') { ctx.top_priority = a.p_value; ctx.top_priority_other = null; } else ctx[a.p_field] = a.p_value;
    factSource = `advisor:${a.p_session}:${a.p_turn}`; trackFacts(before, ctx); factSource = 'direct';
    op.status = 'applied'; op.saved_value = JSON.stringify(a.p_value);
    return { data: { result: 'applied', version: v.version }, error: null };
  }
  return {
    client: { from: (t) => builder(t), rpc },
    rows, log, failNext(table, op) { failNext = { table, op }; },
  };
}
