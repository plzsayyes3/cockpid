const test=require('node:test');
const assert=require('node:assert/strict');
const UI=require('./task-ui-actions.js');

function storage(initial={}){
  const data=new Map(Object.entries(initial));
  return{getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value)),data};
}

test('defines the one-character labels for every existing task action',()=>{
  assert.deepEqual(UI.keys.map(x=>[x.key,x.label,x.title]),[
    ['complete','完','完了'],['start','始','開始'],['end','終','終了'],['time','時','時刻指定'],
    ['defer','保','保留'],['tomorrow','翌','翌日'],['previous','前','前回から'],['up','上','上へ'],['down','下','下へ'],
    ['delete','削','削除'],['more','他','その他']
  ]);
});

test('loads defaults when storage is absent or invalid',()=>{
  const empty=storage();
  assert.deepEqual(UI.load(empty),UI.defaults());
  empty.setItem(UI.STORAGE_KEY,'not-json');
  assert.deepEqual(UI.load(empty),UI.defaults());
  empty.setItem(UI.STORAGE_KEY,JSON.stringify({visible:['start']}));
  assert.deepEqual(UI.load(empty),UI.defaults());
});

test('filters unknown action keys and preserves configured order',()=>{
  const saved=storage({[UI.STORAGE_KEY]:JSON.stringify(['delete','unknown','start','start','more'])});
  assert.deepEqual(UI.load(saved),['delete','start','more','previous']);
});

test('saves only supported unique keys',()=>{
  const target=storage();
  assert.deepEqual(UI.save(target,['defer','unknown','defer','end']),['defer','end','previous','delete']);
  assert.deepEqual(JSON.parse(target.data.get(UI.STORAGE_KEY)),['defer','end','previous','delete']);
});

test('keeps delete visible when migrating an older action setting',()=>{
  const saved=storage({[UI.STORAGE_KEY]:JSON.stringify(['start','time','more'])});
  assert.equal(UI.load(saved).includes('delete'),true);
  assert.equal(UI.keys.find(x=>x.key==='delete').required,true);
});

test('selecting a task replaces the previous selected task',()=>{
  assert.equal(UI.select(null,'task-a'),'task-a');
  assert.equal(UI.select('task-a','task-b'),'task-b');
  assert.equal(UI.select('task-b','task-b'),null);
});

test('visibleDefinitions returns only configured actions in definition order',()=>{
  assert.deepEqual(UI.visibleDefinitions(['more','start']),[
    UI.keys.find(x=>x.key==='start'),UI.keys.find(x=>x.key==='previous'),UI.keys.find(x=>x.key==='delete'),UI.keys.find(x=>x.key==='more')
  ]);
});

test('state-aware actions do not mislabel completion',()=>{
  assert.deepEqual(UI.availableDefinitions(['complete','previous','start'],'todo').map(x=>x.key),['start','previous','delete']);
  assert.deepEqual(UI.availableDefinitions(['complete','previous','end'],'running').map(x=>x.key),['complete','end','delete']);
  assert.equal(UI.actionDefinition('complete','done').title,'完了解除');
  assert.equal(UI.actionDefinition('complete','running').title,'完了');
});
