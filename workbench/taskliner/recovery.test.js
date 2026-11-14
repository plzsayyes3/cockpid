const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createBackup,latest,targetKey}=require('./recovery.js');
function fakeStorage(){
  const values=new Map();
  return {
    values,
    getItem:key=>values.get(key)??null,
    setItem:(key,val)=>values.set(key,String(val)),
    removeItem:key=>values.delete(key)
  };
}
const base={repo:'plzsayyes3/mynotebook',branch:'main',folder:'09_taskchute',date:'2026-11-15'};
test('recovery backups preserve the full Markdown and do not modify task or token keys',()=>{
  const storage=fakeStorage();
  storage.setItem('taskliner_github_sync_token_v1','secret');
  storage.setItem('taskliner_taskchute_line_v1:2026-11-15','local tasks');
  const saved=createBackup(storage,{...base,markdown:'## Notes\n\n- [ ] 日本語\n  child note'});
  assert.equal(latest(storage,base).markdown,saved.markdown);
  assert.equal(storage.getItem('taskliner_github_sync_token_v1'),'secret');
  assert.equal(storage.getItem('taskliner_taskchute_line_v1:2026-11-15'),'local tasks');
  assert.ok(targetKey(base).includes('09_taskchute/2026-11-15.md'));
});
test('backups are separate for each repo/branch/date and keep history',()=>{
  const storage=fakeStorage();
  const previous=createBackup(storage,{...base,markdown:'first'});
  const current=createBackup(storage,{...base,markdown:'second'});
  createBackup(storage,{...base,date:'2026-11-14',markdown:'other day'});
  createBackup(storage,{...base,branch:'testing',markdown:'other branch'});
  assert.notEqual(previous.id,current.id);
  assert.equal(latest(storage,base).markdown,'second');
  assert.equal(latest(storage,{...base,branch:'testing'}).markdown,'other branch');
  assert.equal(latest(storage,{...base,date:'2026-11-14'}).markdown,'other day');
  assert.equal(latest(storage,{...base,repo:'other/repo'}),null);
  assert.ok(storage.values.has('taskliner_recovery_backup_v1:'+previous.id),'historical backup retained');
});
test('failed backup write aborts cleanly and keeps index unchanged',()=>{
  const storage=fakeStorage();
  const normalSet=storage.setItem;
  storage.setItem=(key,value)=>{
    if(key==='taskliner_recovery_backups_v1')throw new Error('quota exceeded');
    normalSet(key,value);
  };
  assert.throws(()=>createBackup(storage,{...base,markdown:'keep me'}),/quota exceeded/);
  assert.equal(storage.getItem('taskliner_recovery_backups_v1'),null);
  assert.equal([...storage.values.keys()].filter(key=>key.startsWith('taskliner_recovery_backup_v1:')).length,0);
});
