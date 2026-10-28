const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../public/comparison/client.js'), 'utf8')
  .replace(/^\(async\(\)=>\{.*await load\(true\).*$/m, '');

// Unit isolation only: no browser, credentials, network or real account state.
function setup() {
  const writes = [], notes = new Map();
  const node = { innerHTML: '', open: false, dataset: {}, setAttribute() {}, removeAttribute() {}, focus() {}, remove() {} };
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
    durable=true;
    state={userId:'account-a',durable:{ready:true},workspaces:{},signalPreferences:{},sessions:[],decisions:[{id:'d',title:'Question',description:null,
      status:'open',rationale:'',alternatives_considered:[],actual_outcome:null,
      updated_at:'v1',support:{goal:'Learn first',evidence:[],reviews:[]}}],sessionLinks:{}};
    serverRecords.set('d',copy(state.decisions[0]));versions.set('d',1);
    request=async(url,method,payload)=>{writes.push({operation:payload.operation,payload});
      return {decision:{...state.decisions[0],updated_at:'v2'},workspace:{version:2,support:payload.support||state.decisions[0].support}};};
  `, scope);
  return { scope, writes, notes, run: code => vm.runInContext(code, scope) };
}

test('note edits are saved to the account with both versions, never into core fields', async () => {
  const h = setup();
  await h.run(`support(state.decisions[0]).goal='Compare customer objections';saveLocal()`);
  assert.equal(h.writes.length, 1);
  const w = h.writes[0].payload;
  assert.equal(w.operation, 'save-decision');
  assert.equal(w.expectedUpdatedAt, 'v1');
  assert.equal(w.expectedVersion, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(w.input)), {});
  assert.equal(w.support.goal, 'Compare customer objections');
  assert.equal(h.notes.size, 0, 'nothing about the decision is written to browser storage');
  assert.equal(h.run(`versions.get('d')`), 2);
});

test('core edits send only changed fields; conversation copies are never stored as notes', async () => {
  const h = setup();
  await h.run(`state.decisions[0].title='A changed question';state.decisions[0].support.thread=[{role:'user',content:'x'}];saveLocal()`);
  assert.equal(h.writes.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0].payload.input)), { title: 'A changed question' });
  assert.equal(h.writes[0].payload.support, null, 'a thread copy alone is not a notes change');
  assert.equal(h.run(`serverRecords.get('d').updated_at`), 'v2');
});

test('failed account saves roll back the visible change, keep the old versions and say it was not saved', async () => {
  const h = setup();
  await h.run(`request=async()=>{const e=new Error('This decision changed in another window or device.');e.code='conflict';throw e;};run(async()=>{state.decisions[0].status='archived';await saveLocal();})`);
  assert.equal(h.run(`state.decisions[0].status`), 'open');
  assert.equal(h.run(`serverRecords.get('d').updated_at`), 'v1');
  assert.equal(h.run(`versions.get('d')`), 1);
  assert.match(h.run(`document.querySelector('#toast').innerHTML`), /changed in another window/);
});

test('without the account update, notes are refused with a clear message instead of saved in the browser', async () => {
  const h = setup();
  await h.run(`durable=false;state.durable={ready:false,message:'Saving decision notes is not available yet. Nothing was saved.'};run(async()=>{support(state.decisions[0]).goal='Unsaved';await saveLocal();})`);
  assert.equal(h.writes.length, 0);
  assert.equal(h.notes.size, 0);
  assert.equal(h.run(`state.decisions[0].support.goal`), 'Learn first');
  assert.match(h.run(`document.querySelector('#toast').innerHTML`), /Nothing was saved/);
});

test('a clean browser loads notes, snapshots and versions from the account only', async () => {
  const h = setup();
  await h.run(`request=async()=>({userId:'account-b',profile:{},context:null,durable:{ready:true},decisions:[{id:'older',title:'Older choice',status:'decided',rationale:'Existing reason',alternatives_considered:[],updated_at:'server-version'},{id:'framed',title:'Framed',status:'open',rationale:'',alternatives_considered:[],updated_at:'s2'}],workspaces:{framed:{version:3,support:{goal:'Saved goal',evidence:[],reviews:[],snapshot:null}}},signals:[],sessions:[],strategies:[],errors:{},sessionLinks:{},signalPreferences:{}});load(true)`);
  assert.equal(h.run(`state.userId`), 'account-b');
  assert.equal(h.run(`state.decisions[0].support.snapshot`), undefined, 'no snapshot is invented for an older record');
  assert.equal(h.run(`state.decisions[0].rationale`), 'Existing reason');
  assert.equal(h.run(`state.decisions[1].support.goal`), 'Saved goal');
  assert.equal(h.run(`versions.get('framed')`), 3);
});

test('notes left in this browser by the test version are offered for review, never applied as account state', async () => {
  const h = setup();
  h.notes.set('vantage-comparison-notes-v1:account-a', JSON.stringify({ decisions: { '11111111-2222-4333-8444-555555555555': { stamp: 'old-version', support: { goal: 'Old draft goal', snapshot: { why: 'Old choice' } } } } }));
  await h.run(`request=async()=>({userId:'account-a',profile:{},context:{},durable:{ready:true},decisions:[{id:'11111111-2222-4333-8444-555555555555',title:'New account question',status:'open',rationale:'',alternatives_considered:[],updated_at:'new-version'}],workspaces:{},signals:[],sessions:[],strategies:[],errors:{},sessionLinks:{},signalPreferences:{}});load(true)`);
  assert.equal(h.run(`state.decisions[0].support.goal`), undefined);
  assert.equal(h.run(`state.decisions[0].support.snapshot`), undefined);
  assert.equal(h.run(`state.decisions[0].title`), 'New account question');
  assert.equal(h.run(`legacyNotes().counts.decisions`), 1, 'the browser copy is offered for a reviewed import');
  assert.match(h.run(`importNotice()`), /not in your account yet/);
  assert.equal(h.writes.length, 0, 'nothing is imported without the user');
});
