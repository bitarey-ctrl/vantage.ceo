const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../public/comparison/client.js'), 'utf8')
  .replace(/^\(async\(\)=>\{try\{await load\(true\).*$/m, '');

// Unit isolation only: no browser, credentials, network or real account state.
function setup() {
  const writes = [], notes = new Map();
  const node = { innerHTML: '', open: false, setAttribute() {}, removeAttribute() {}, focus() {}, remove() {} };
  const scope = vm.createContext({
    console, URL, crypto: require('node:crypto').webcrypto,
    DecisionEngine: require('../../public/comparison/engine.js'),
    AttentionEngine: require('../../public/comparison/attention-engine.js'),
    document: { querySelector: () => node, querySelectorAll: () => [], addEventListener() {}, body: node, documentElement: { dataset: {} } },
    window: { addEventListener() {} }, location: { hash: '', search: '' },
    localStorage: { getItem: k => notes.get(k) || null, setItem: (k, v) => notes.set(k, v) },
    setTimeout: () => 1, clearTimeout() {},
    writes, response: {},
  });
  vm.runInContext(source, scope);
  vm.runInContext(`
    render=()=>{};
    state={userId:'account-a',decisions:[{id:'d',title:'Question',description:null,
      status:'open',rationale:'',alternatives_considered:[],actual_outcome:null,
      updated_at:'v1',support:{goal:'Learn first',evidence:[],thread:[]}}],sessionLinks:{}};
    serverRecords.set('d',copy(state.decisions[0]));
    request=async(url,method,payload)=>{writes.push({operation:payload.operation,payload});return {...state.decisions[0],updated_at:'v2'};};
  `, scope);
  return { scope, writes, notes, run: code => vm.runInContext(code, scope) };
}

test('working-note edits do not write unsupported metadata into account fields', async () => {
  const h = setup();
  await h.run(`support(state.decisions[0]).goal='Compare customer objections';saveLocal()`);
  assert.equal(h.writes.length, 0);
  const saved = JSON.parse([...h.notes.values()][0]);
  assert.equal(saved.decisions.d.support.goal, 'Compare customer objections');
  assert.equal(saved.decisions.d.title, undefined);
});

test('account saves use the original version and retain local support separately', async () => {
  const h = setup();
  await h.run(`state.decisions[0].title='A changed question';saveLocal()`);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].payload.expectedUpdatedAt, 'v1');
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0].payload.input)), { title: 'A changed question' });
  assert.equal(h.run(`state.decisions[0].support.goal`), 'Learn first');
  assert.equal(h.run(`serverRecords.get('d').updated_at`), 'v2');
});

test('failed account saves roll back the visible mutation and retain the original version', async () => {
  const h = setup();
  await h.run(`request=async()=>{throw new Error('Changed in another view');};run(async()=>{state.decisions[0].status='archived';await saveLocal();})`);
  assert.equal(h.run(`state.decisions[0].status`), 'open');
  assert.equal(h.run(`serverRecords.get('d').updated_at`), 'v1');
  assert.match(h.run(`document.querySelector('#toast').innerHTML`), /not confirmed/);
});

test('storage failure does not masquerade as loss of an account save', async () => {
  const h = setup();
  await h.run(`localStorage.setItem=()=>{throw new Error('Quota');};state.decisions[0].title='Saved account question';saveLocal()`);
  assert.equal(h.writes.length, 1);
  assert.equal(h.run(`serverRecords.get('d').updated_at`), 'v2');
  assert.equal(h.run(`storageOK`), false);
  assert.match(h.run(`document.querySelector('#toast').innerHTML`), /Working notes/);
});

test('load retains account data and never creates a snapshot in a clean browser', async () => {
  const h = setup();
  await h.run(`request=async(url)=>url.includes('analysis-map')?{}:{userId:'account-b',profile:{},context:null,decisions:[{id:'older',title:'Older choice',status:'decided',rationale:'Existing reason',alternatives_considered:[],updated_at:'server-version'}],signals:[],sessions:[],strategies:[],errors:{}};load(true)`);
  assert.equal(h.run(`state.userId`), 'account-b');
  assert.equal(h.run(`state.decisions[0].support.snapshot`), undefined);
  assert.equal(h.run(`state.decisions[0].rationale`), 'Existing reason');
  assert.equal(h.run(`state.decisions.length`), 1);
});

test('stale browser snapshots are not presented as the current account record', async () => {
  const h = setup();
  h.notes.set('vantage-comparison-notes-v1:account-a', JSON.stringify({ decisions: { d: { stamp: 'old-version', support: { goal: 'Old draft goal', snapshot: { why: 'Old choice' } } } } }));
  await h.run(`request=async(url)=>url.includes('analysis-map')?{}:{userId:'account-a',profile:{},context:{},decisions:[{id:'d',title:'New account question',status:'open',rationale:'',alternatives_considered:[],updated_at:'new-version'}],signals:[],sessions:[],strategies:[],errors:{}};load(true)`);
  assert.equal(h.run(`state.decisions[0].support.stale`), true);
  assert.equal(h.run(`state.decisions[0].support.snapshot`), null);
  assert.equal(h.run(`state.decisions[0].title`), 'New account question');
  assert.equal(h.writes.length, 0);
});
