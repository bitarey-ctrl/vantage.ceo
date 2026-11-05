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

export function createFakeDb(seed = {}) {
  const tables = new Map(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const rows = (t) => { if (!tables.has(t)) tables.set(t, []); return tables.get(t); };
  const log = [];
  let failNext = null; // { table, op } → next matching statement returns a database error
  function builder(table) {
    const st = { op: 'select', filters: [], payload: null, single: null, opts: {}, limit: null };
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
      order() { return b; },
      limit(n) { st.limit = n; return b; },
      single() { st.single = 'single'; return run(); },
      maybeSingle() { st.single = 'maybe'; return run(); },
      then(res, rej) { return run().then(res, rej); },
    };
    async function run() {
      await tick(); // let concurrent requests interleave between statements
      log.push({ table, op: st.op });
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
      } else if (st.op === 'update') { for (const r of match) Object.assign(r, st.payload); out = match; }
      else if (st.op === 'delete') { tables.set(table, all.filter((r) => !match.includes(r))); out = match; }
      if (st.limit) out = out.slice(0, st.limit);
      const copy = out.map((r) => JSON.parse(JSON.stringify(r)));
      if (st.single === 'single') return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } };
      if (st.single === 'maybe') return { data: copy[0] ?? null, error: null };
      return { data: copy, error: null };
    }
    return b;
  }
  return {
    client: { from: (t) => builder(t) },
    rows, log, failNext(table, op) { failNext = { table, op }; },
  };
}
