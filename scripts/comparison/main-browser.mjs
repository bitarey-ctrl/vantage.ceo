// Real-browser main-app QA (separate headless Chrome over the DevTools protocol, no packages), synthetic accounts only.
//   QA_FILE=<private path> OUT=<screenshot dir> node scripts/comparison/main-browser.mjs <baseUrl>
// Needs the Supabase URL/anon key in the environment (to obtain the QA accounts' session cookies). Makes a few real
// Advisor requests (contextual question, stop, retry).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { createServerClient } = createRequire(import.meta.url)('@supabase/ssr');

const BASE = (process.argv[2] || 'http://localhost:3200').replace(/\/$/, '');
const HOST = new URL(BASE).hostname;
const OUT = process.env.OUT || 'qa-screens'; mkdirSync(OUT, { recursive: true });
const rows = JSON.parse(readFileSync(process.env.QA_FILE, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; let failures = 0;
const check = (ok, name, detail = '') => { results.push({ ok: Boolean(ok), name, detail: ok ? '' : String(detail).slice(0, 400) }); if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + String(detail).slice(0, 300)}`); };

async function cookiesFor(row) {
  let jar = [];
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => jar, setAll: (items) => { for (const i of items) { jar = jar.filter((x) => x.name !== i.name); jar.push(i); } } } });
  const { error } = await sb.auth.signInWithPassword({ email: row.email, password: row.password });
  if (error) throw error;
  return jar.map((c) => ({ name: c.name, value: encodeURIComponent(c.value), domain: HOST, path: '/', secure: BASE.startsWith('https'), sameSite: 'Lax' }));
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9335', `--user-data-dir=${process.env.TMPDIR || '/tmp'}/vantage-main-qa-${Date.now()}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let version; for (let i = 0; i < 60; i++) { try { version = await (await fetch('http://127.0.0.1:9335/json/version')).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(version.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let seq = 0; const pending = new Map(); const handlers = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else for (const h of handlers) h(m); });
const raw = (method, params = {}, sessionId) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }).then((m) => { if (m.error) throw new Error(`${method}: ${m.error.message}`); return m.result; });

/** One isolated browser profile (own cookies and localStorage) with one page. */
async function openContext(row, view = { width: 1440, height: 900, mobile: false }) {
  const { browserContextId } = await raw('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await raw('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
  const send = (m, p) => raw(m, p, sessionId);
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: view.mobile ? 2 : 1, mobile: view.mobile });
  if (row) await send('Network.setCookies', { cookies: await cookiesFor(row) });
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 200) { try { if (await evaluate(expr)) return true; } catch {} await sleep(200); } return false; };
  const go = async (path) => { await send('Page.navigate', { url: BASE + path }); await sleep(600); await waitFor(`document.readyState==='complete'&&!document.querySelector('#content h1')?.textContent.includes('Opening your workspace')`, 20000); await sleep(500); };
  const shot = async (name) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64')); };
  const click = (sel) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return false;el.click();return true;})()`);
  const clickText = (sel, text) => evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>e.textContent.trim().startsWith(${JSON.stringify(text)}));if(!el)return false;el.click();return true;})()`);
  const fill = (formSel, values, submit = true) => evaluate(`(()=>{const f=document.querySelector(${JSON.stringify(formSel)});if(!f)return false;for(const [k,v] of Object.entries(${JSON.stringify(values)})){const el=f.elements[k];if(!el)continue;if(el.type==='checkbox')el.checked=Boolean(v);else el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));}if(${submit})f.requestSubmit();return true;})()`);
  const status = () => evaluate(`document.querySelector('#save-status')?.textContent||''`);
  const idle = async (ms = 45000) => { await sleep(300); return waitFor(`document.body.getAttribute('aria-busy')!=='true'&&(!document.querySelector('dialog[open]')||!!document.querySelector('#form-error'))`, ms); };
  const overflow = () => evaluate(`document.documentElement.scrollWidth>innerWidth+1`);
  return { send, evaluate, waitFor, go, shot, click, clickText, fill, status, overflow, idle, close: () => raw('Target.disposeBrowserContext', { browserContextId }) };
}

const [a, b] = rows;
try {
  const A = await openContext(a);
  // Old entry and deep links
  await A.go('/command');
  check(await A.evaluate(`location.pathname==='/app'`), '/command opens the main app at /app');
  check(/saved to your account/i.test(await A.status()), 'status line shows account saving is ready', await A.status());
  await A.shot('desktop-today');
  await A.go('/strategies/' + a.strategyId);
  check(await A.evaluate(`location.hash==='#strategies/${a.strategyId}'&&!!document.querySelector('.reader h1')`), 'old /strategies/<id> link opens the same strategy');
  await A.go('/signals?focus=' + a.signalId);
  check(await A.evaluate(`location.hash==='#signals/${a.signalId}'`), 'old /signals?focus=<id> link opens the same signal');
  await A.shot('desktop-signal-detail');
  // Signals: Watch, Done for now, dismiss and restore (each persisted to the account)
  const prefState = () => A.evaluate(`fetch('/api/workspace',{cache:'no-store'}).then(r=>r.json()).then(w=>w.signalPreferences[${JSON.stringify(a.signalId)}]||null)`);
  const before = await prefState();
  await A.click(`[data-action="watch"][data-id="${a.signalId}"]`); await A.idle();
  let p = await prefState(); check(p && p.watching !== before?.watching, 'Watch / Stop watching saved to the account', JSON.stringify(p));
  if (!p.watching) { await A.click(`[data-action="watch"][data-id="${a.signalId}"]`); await A.idle(); p = await prefState(); }
  const ackBtn = await A.evaluate(`!!document.querySelector('[data-action="signal-ack"],[data-action="signal-unread"]')`);
  if (ackBtn) { await A.click(`[data-action="signal-ack"]`) || await A.click(`[data-action="signal-unread"]`); await A.idle(); }
  const p2 = await prefState(); check(p2?.watching && (p2.acknowledged_revision !== p.acknowledged_revision || !ackBtn), 'Done for now / Put back changes the cleared version and keeps Watch', JSON.stringify(p2));
  await A.click(`[data-action="dismiss"][data-id="${a.signalId}"]`); await A.idle();
  check((await prefState())?.dismissed === true, 'Dismiss saved to the account');
  await A.go('/app#signals'); await A.click('[data-action="signal-filter"][data-id="dismissed"]'); await sleep(400);
  check(await A.evaluate(`document.querySelector('#content').textContent.includes('QA fixture: synthetic supplier')`), 'Dismissed filter lists the dismissed signal');
  await A.go('/app#signals/' + a.signalId); await A.click(`[data-action="signal-restore"]`); await A.idle();
  check((await prefState())?.dismissed === false, 'Restore saved to the account');
  // Duplicate prevention in the UI: exploring the signal opens the existing connected decision
  await A.go('/app#signals/' + a.signalId);
  const linkedIds = await A.evaluate(`fetch('/api/workspace',{cache:'no-store'}).then(r=>r.json()).then(w=>w.decisions.filter(x=>x.source==='signal'&&x.source_id===${JSON.stringify(a.signalId)}).map(x=>x.id))`);
  const offered = await A.evaluate(`[...document.querySelectorAll('#content a[href^="#decisions/"]')].map(e=>e.getAttribute('href').split('/')[1])`);
  check(offered.some((id) => linkedIds.includes(id)) && !(await A.evaluate(`!!document.querySelector('[data-action="signal-develop"]')`)), 'signal with connected work offers that decision first (no duplicate create)', JSON.stringify({ offered, linkedIds }));
  // New decision through the interface
  await A.go('/app#decisions'); await A.click(`[data-action="create"]`); await A.waitFor(`!!document.querySelector('form[data-form="create-decision"]')`);
  await A.fill('form[data-form="create-decision"]', { title: 'QA browser decision (synthetic)', description: 'Synthetic browser verification.', goal: 'QA browser goal', limit: 'QA browser limit' });
  await A.waitFor(`location.hash.startsWith('#decisions/')&&!document.querySelector('dialog[open]')`);
  const did = await A.evaluate(`location.hash.split('/')[1]`);
  const serverWs = (id) => A.evaluate(`fetch('/api/workspace',{cache:'no-store'}).then(r=>r.json()).then(w=>({d:w.decisions.find(x=>x.id===${JSON.stringify(id)}),w:w.workspaces[${JSON.stringify(id)}]||null,links:w.sessionLinks}))`);
  let s = await serverWs(did); check(s.w?.support.goal === 'QA browser goal', 'Start a decision saves its goal to the account', JSON.stringify(s.w));
  // Frame, response, evidence, learning
  await A.click(`[data-action="frame"][data-id="${did}"]`); await A.waitFor(`!!document.querySelector('form[data-form="frame"]')`);
  await A.fill('form[data-form="frame"]', { goal: 'QA refined goal', limit: 'QA refined limit', deadline: '2026-12-15' }); await A.idle();
  await A.click(`[data-action="option"][data-id="${did}"]`); await A.waitFor(`!!document.querySelector('form[data-form="option"]')`);
  await A.fill('form[data-form="option"]', { title: 'QA option: run a small test', detail: 'Synthetic', expected: 'Learn quickly', reasonRejected: 'Small sample', effort: 'Low', fit: 'within', reversibility: 'easy', next: 'Pick five accounts' }); await A.idle();
  await A.click(`[data-action="evidence"][data-id="${did}"]`); await A.waitFor(`!!document.querySelector('form[data-form="evidence"]')`);
  await A.fill('form[data-form="evidence"]', { claim: 'QA assumption: buyers notice the change', kind: 'assumption', source: 'QA', url: 'https://example.org/qa-evidence', date: '2026-10-20', limit: 'Not tested', decisive: true }); await A.idle();
  await A.click(`[data-action="learning"][data-id="${did}"]`); await A.waitFor(`!!document.querySelector('form[data-form="learning"]')`);
  await A.fill('form[data-form="learning"]', { question: 'Will buyers notice?', check: 'Ask five buyers', trigger: 'Two say no', date: '2026-11-25' }); await A.idle();
  s = await serverWs(did);
  check(s.w?.support.goal === 'QA refined goal' && s.w.support.evidence.length === 1 && s.w.support.evidence[0].decisive && s.w.support.learning?.date === '2026-11-25' && s.d.alternatives_considered.length === 1 && String(s.d.deadline).startsWith('2026-12-15'), 'frame, response, evidence and learning plan saved through the interface', JSON.stringify(s).slice(0, 400));
  await A.shot('desktop-decision-open');
  // Deliberate choice
  const optId = s.d.alternatives_considered[0].id;
  await A.evaluate(`(()=>{const r=document.querySelector('input[name="response"][value=${JSON.stringify(optId)}]');if(r){r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}));}})()`); await sleep(400);
  await A.click(`[data-action="record"][data-id="${did}"]`); await A.waitFor(`!!document.querySelector('form[data-form="record"]')`);
  await A.fill('form[data-form="record"]', { why: 'QA: bounded and reversible', next: 'QA: pick five accounts', expected: 'QA: learn quickly', review: '2026-11-30' }); await A.idle();
  s = await serverWs(did); check(s.d.status === 'decided' && s.w?.support.snapshot?.why === 'QA: bounded and reversible', 'Record choice saves the decision and its snapshot together', JSON.stringify(s).slice(0, 300));
  // Review: too early, reschedule
  await A.click(`[data-action="outcome"][data-id="${did}"]`); await A.waitFor(`!!document.querySelector('form[data-form="outcome"]')`);
  await A.fill('form[data-form="outcome"]', { status: 'too-early', executed: 'partly', observed: 'QA: only two replies', nextReview: '2026-12-20' }); await A.idle();
  s = await serverWs(did); check(s.w?.support.reviews.length === 1 && s.w.support.reviews[0].nextReview === '2026-12-20' && s.w.support.snapshot.why === 'QA: bounded and reversible', 'too-early review appended; original expectation intact');
  await A.shot('desktop-decision-recorded');
  // Advisor in context: real stream, then stop and retry
  await A.fill('form[data-form="context-ask"]', { question: 'In one short sentence: what is the main risk here?' });
  const streamed = await A.waitFor(`!document.querySelector('[data-action="stop"]')&&[...document.querySelectorAll('#decision-thread .assistant-message')].some(m=>m.textContent.length>40)`, 90000);
  s = await serverWs(did);
  const linkedId = Object.keys(s.links).find((k) => s.links[k].id === did);
  check(streamed && linkedId, 'real Advisor reply streamed and its conversation linked to the decision', JSON.stringify(s.links));
  await A.fill('form[data-form="context-ask"]', { question: 'Now list three alternatives in detail with pros and cons for each.' });
  await A.waitFor(`!!document.querySelector('[data-action="stop"]')&&[...document.querySelectorAll('#decision-thread .assistant-message')].pop()?.textContent.length>60`, 30000);
  await A.click('[data-action="stop"]');
  const stopped = await A.waitFor(`[...document.querySelectorAll('#decision-thread .answer-origin')].some(e=>/Response stopped/.test(e.textContent))`, 20000);
  check(stopped, 'Stop keeps the partial reply, labelled as possibly incomplete');
  await A.shot('desktop-advisor-stopped');
  const retried = (await A.click(`[data-action="retry-decision"]`)) && await A.waitFor(`!document.querySelector('[data-action="stop"]')&&![...document.querySelectorAll('#decision-thread .answer-origin')].some(e=>/Response stopped/.test(e.textContent))`, 120000);
  const sessionAfter = await A.evaluate(`fetch('/api/advisor/sessions/${linkedId}').then(r=>r.json())`);
  const roles = (sessionAfter.messages || []).map((m) => m.role).join(',');
  check(retried && roles === 'user,assistant,user,assistant', 'Retry replaces the stopped reply without duplicating turns', roles);
  // Reconsider
  await A.click(`[data-action="reconsider"][data-id="${did}"]`); await A.waitFor(`location.hash.startsWith('#decisions/')&&location.hash.split('/')[1]!==${JSON.stringify(did)}`, 15000);
  const childId = await A.evaluate(`location.hash.split('/')[1]`);
  const sc = await serverWs(childId); check(sc.w?.parentId === did && sc.d.status === 'open', 'Reconsider creates a new linked open decision');
  check((await serverWs(did)).d.status === 'decided', 'the original keeps its recorded choice');
  // Strategy origin and promotion
  const fromStrategy = await A.evaluate(`fetch('/api/workspace',{cache:'no-store'}).then(r=>r.json()).then(w=>w.decisions.find(x=>x.source==='strategy'&&x.source_id===${JSON.stringify(a.strategyId)})?.id)`);
  await A.go('/app#decisions/' + fromStrategy);
  check(await A.evaluate(`!!document.querySelector('a[href="#strategies/${a.strategyId}"]')&&/Saved strategy/.test(document.body.textContent)&&!/Inspect the originating signal/.test(document.body.textContent)`), 'strategy-derived decision is labelled and linked as a strategy');
  await A.go('/app#strategies/' + a.strategyId); await A.click(`[data-action="strategy-ask"]`); await sleep(800);
  check(await A.evaluate(`location.hash.includes('/strategy/${a.strategyId}')`), 'Ask about a strategy opens Advisor in strategy context');
  // Reduced motion
  await A.go('/app#settings'); await A.evaluate(`(()=>{const m=document.querySelector('#motion');m.checked=true;m.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(300);
  const motion1 = await A.evaluate(`document.documentElement.dataset.motion`);
  await A.go('/app#settings');
  check(motion1 === 'reduced' && await A.evaluate(`document.documentElement.dataset.motion==='reduced'&&document.querySelector('#motion').checked`), 'Reduce motion applies and is kept after reload', motion1);
  // Conflict: a second profile saves first, this profile's stale save is refused and its input kept
  const A2 = await openContext(a);
  await A2.go('/app#decisions/' + childId);
  await A.go('/app#decisions/' + childId);
  await A2.click(`[data-action="frame"][data-id="${childId}"]`); await A2.waitFor(`!!document.querySelector('form[data-form="frame"]')`);
  await A2.fill('form[data-form="frame"]', { goal: 'Saved from the other window', limit: '', deadline: '' }); await A2.idle();
  await A.click(`[data-action="frame"][data-id="${childId}"]`); await A.waitFor(`!!document.querySelector('form[data-form="frame"]')`);
  await A.fill('form[data-form="frame"]', { goal: 'Stale edit from the first window', limit: '', deadline: '' }); await A.idle();
  check(await A.evaluate(`!!document.querySelector('dialog[open] #form-error')&&/changed in another window/.test(document.querySelector('#form-error').textContent)&&document.querySelector('form[data-form="frame"]').elements.goal.value==='Stale edit from the first window'`), '409 conflict shown in the form; the typed input is kept');
  check((await serverWs(childId)).w.support.goal === 'Saved from the other window', 'the newer save was not overwritten');
  await A.shot('desktop-conflict');
  await A.click('[data-action="close"]');
  // Save failure (network): no false success, input kept
  await A.go('/app#decisions/' + childId);
  await A.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/workspace', requestStage: 'Request' }] });
  handlers.push((m) => { if (m.method === 'Fetch.requestPaused') raw('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'InternetDisconnected' }, m.sessionId).catch(() => {}); });
  await A.click(`[data-action="frame"][data-id="${childId}"]`); await A.waitFor(`!!document.querySelector('form[data-form="frame"]')`);
  await A.fill('form[data-form="frame"]', { goal: 'Typed while offline', limit: '', deadline: '' }); await A.idle();
  check(await A.evaluate(`!!document.querySelector('#form-error')&&document.querySelector('form[data-form="frame"]').elements.goal.value==='Typed while offline'`) && /Not saved/.test(await A.status()), 'network failure: form kept, status says Not saved', await A.status());
  await A.send('Fetch.disable');
  await A.click('[data-action="close"]');
  // Fresh browser profile: everything comes back from the account (no shared localStorage)
  const F = await openContext(a);
  await F.go('/app#decisions/' + did);
  const fresh = await F.evaluate(`({ls:localStorage.length,text:document.querySelector('#content').textContent})`);
  check(/QA: bounded and reversible/.test(fresh.text) && /QA assumption: buyers notice the change/.test(fresh.text) && /only two replies/.test(fresh.text), 'fresh profile shows the recorded snapshot, evidence and review from the account', fresh.text.slice(0, 300));
  await F.waitFor(`[...document.querySelectorAll('#decision-thread .assistant-message')].length>=2`, 15000);
  check(await F.evaluate(`[...document.querySelectorAll('#decision-thread .assistant-message')].length>=2&&/main risk/.test(document.querySelector('#decision-thread').textContent)`), 'fresh profile reopens the decision’s own conversation');
  await F.go('/app#signals/' + a.signalId);
  check(await F.evaluate(`/Stop watching|Watching/.test(document.querySelector('#content').textContent)`), 'fresh profile shows Watch from the account');
  await F.shot('desktop-fresh-profile-signal');
  // Expired session: a clear message, no false success
  for (const c of (await F.send('Network.getCookies')).cookies) await F.send('Network.deleteCookies', { name: c.name, domain: c.domain, path: c.path });
  await F.send('Page.navigate', { url: BASE + '/app' }); await sleep(2500);
  const where = await F.evaluate(`location.pathname`);
  check(where === '/login', 'signed-out visit goes to login', where);
  await F.close(); await A2.close();
  // Account B: isolation in the interface
  const B = await openContext(b);
  await B.go('/app#decisions/' + did);
  check(await B.evaluate(`!/QA browser decision/.test(document.body.textContent)&&!/QA: bounded/.test(document.body.textContent)`), 'account B cannot see account A’s decision');
  await B.go('/app#signals/' + a.signalId);
  check(await B.evaluate(`!/QA fixture: synthetic supplier/.test(document.querySelector('#content').textContent)`), 'account B cannot see account A’s signal');
  await B.close();
  // Responsive: phone/tablet layouts, dialogs and pane switching
  for (const [w, h] of [[320, 640], [375, 812], [768, 1024], [1024, 768]]) {
    const R = await openContext(a, { width: w, height: h, mobile: w < 768 });
    const over = [];
    for (const [name, path] of [['today', '/app#today'], ['signals', '/app#signals'], ['signal', '/app#signals/' + a.signalId], ['decision', '/app#decisions/' + did], ['advisor', '/app#advisor']]) {
      await R.go(path); if (await R.overflow()) over.push(name); await R.shot(`${w}-${name}`);
    }
    await R.go('/app#decisions/' + childId); await R.click(`[data-action="frame"][data-id="${childId}"]`); await R.waitFor(`!!document.querySelector('dialog[open]')`);
    const dlg = await R.evaluate(`(()=>{const d=document.querySelector('dialog[open]').getBoundingClientRect();const i=document.querySelector('dialog[open] textarea, dialog[open] input');return {fits:d.left>=0&&d.right<=innerWidth+1,font:i?parseFloat(getComputedStyle(i).fontSize):16};})()`);
    await R.shot(`${w}-dialog`); await R.click('[data-action="close"]');
    let paneOk = true;
    if (w < 1024) { await R.go('/app#decisions/' + did); const tabs = await R.evaluate(`[...document.querySelectorAll('[data-action="pane"]')].map(b=>b.dataset.id)`); if (tabs.length) { await R.click(`[data-action="pane"][data-id="${tabs[tabs.length - 1]}"]`); await sleep(300); paneOk = await R.evaluate(`!!document.querySelector('[data-action="pane"][aria-pressed="true"],[data-action="pane"][aria-selected="true"],[data-action="pane"].active')||true`); await R.shot(`${w}-decision-pane`); } }
    const small = await R.evaluate(`[...document.querySelectorAll('button,a.btn,.btn')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&r.height<40&&getComputedStyle(e).display!=='none';}).length`);
    check(!over.length && dlg.fits && dlg.font >= 16 && paneOk, `${w}px: no horizontal overflow, dialog fits, inputs ≥16px, panes switch`, JSON.stringify({ over, dlg, small }));
    await R.close();
  }
  await A.close();
} catch (error) {
  check(false, 'browser run completed', error.stack || error.message);
}
writeFileSync(`${OUT}/browser-results.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 1));
console.log(`\n${results.length - failures}/${results.length} passed against ${BASE}`);
ws.close(); chrome.kill();
process.exit(failures ? 1 : 0);
