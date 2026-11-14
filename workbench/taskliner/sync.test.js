const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=path.join(__dirname,'sync.js');
function setup(remote={sha:'old',text:'- [ ] remote'}) {
  const data=new Map([['taskliner_github_sync_token_v1','fixture-token']]);
  const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v))};
  const requests=[];let gate=null;
  const fetch=async(url,opts={})=>{
    requests.push({url,opts});
    if(opts.method==='PUT') { if(gate) await gate; if(remote)remote.sha='new'; return {ok:true,json:async()=>({content:{sha:'new'}})}; }
    return remote?{ok:true,status:200,json:async()=>({sha:remote.sha,size:remote.text.length,encoding:'base64',content:Buffer.from(remote.text).toString('base64')})}:{ok:false,status:404};
  };
  const sync=require(source).createSync({storage,fetch});
  return {sync,storage,requests,gate(p){gate=p;}};
}
test('native sync module is available',()=>assert.ok(fs.existsSync(source)));
test('existing data needs a known SHA before saving',async()=>{
  const {sync,requests}=setup();sync.markDirty('2026-11-14');
  await assert.rejects(sync.save('2026-11-14','- [ ] local'),{code:'TASKLINER_SAVE_CONFLICT'});
  assert.equal(requests.filter(x=>x.opts.method==='PUT').length,0);
});
test('pull establishes SHA and saves to existing canonical daily path',async()=>{
  const {sync,requests,storage}=setup();sync.acceptPull(await sync.pull('2026-11-14'));sync.markDirty('2026-11-14');
  await sync.save('2026-11-14','- [x] done');
  const put=requests.find(x=>x.opts.method==='PUT');
  assert.match(put.url,/mynotebook\/contents\/09_taskchute\/2026-11-14.md$/);
  assert.equal(JSON.parse(put.opts.body).sha,'old');assert.equal(sync.isDirty('2026-11-14'),false);
  assert.match(storage.getItem('taskliner_github_known_sha_v1'),/new/);
});
test('remote changes and empty local text cannot overwrite existing data',async()=>{
  const remote={sha:'old',text:'- [ ] remote'},fixture=setup(remote);fixture.sync.acceptPull(await fixture.sync.pull('2026-11-14'));
  fixture.sync.markDirty('2026-11-14');
  await assert.rejects(fixture.sync.save('2026-11-14',''),{code:'TASKLINER_SAVE_CONFLICT'});
  remote.sha='changed';await assert.rejects(fixture.sync.save('2026-11-14','- [ ] local'),{code:'TASKLINER_SAVE_CONFLICT'});
  assert.equal(fixture.sync.isDirty('2026-11-14'),true);
});
test('edits made during save remain dirty and serialize a later save',async()=>{
  const {sync,gate,requests}=setup();sync.acceptPull(await sync.pull('2026-11-14'));sync.markDirty('2026-11-14');
  let release;gate(new Promise(r=>release=r));const saving=sync.save('2026-11-14','- [ ] first');
  await new Promise(r=>setImmediate(r));sync.markDirty('2026-11-14');release();await saving;
  assert.equal(sync.isDirty('2026-11-14'),true);await sync.save('2026-11-14','- [ ] second');
  assert.equal(sync.isDirty('2026-11-14'),false);assert.equal(requests.filter(x=>x.opts.method==='PUT').length,2);
});
test('network failure keeps changes and snapshots preserve date',async()=>{
  const {storage}=setup(null);const sync=require(source).createSync({storage,fetch:async()=>{throw new Error('offline')}});
  sync.markDirty('2026-11-13');await assert.rejects(sync.save('2026-11-13','- [ ] retry'),/offline/);
  assert.equal(sync.isDirty('2026-11-13'),true);
});
test('empty remote content is rejected without replacing local state',async()=>{
  const {sync}=setup({sha:'old',text:''});await assert.rejects(sync.pull('2026-11-14'),/空/);
});
test('configuration updates preserve template overrides',()=>{
  const {sync,storage}=setup();storage.setItem('taskliner_github_sync_config_v1',JSON.stringify({repo:'plzsayyes3/mynotebook',templateRepo:'plzsayyes3/other'}));
  sync.setConfig({folder:'09_taskchute'});assert.equal(JSON.parse(storage.getItem('taskliner_github_sync_config_v1')).templateRepo,'plzsayyes3/other');
});
test('a pull cannot clear edits made after that pull began',async()=>{
  const {sync}=setup();const result=await sync.pull('2026-11-14');sync.markDirty('2026-11-14');
  assert.equal(sync.acceptPull(result),false);assert.equal(sync.isDirty('2026-11-14'),true);
});
test('pull waits for an in-flight save instead of reading the pre-save remote',async()=>{
  const {sync,gate,requests}=setup();sync.acceptPull(await sync.pull('2026-11-14'));sync.markDirty('2026-11-14');
  let release;gate(new Promise(resolve=>release=resolve));const saving=sync.save('2026-11-14','- [ ] new');
  await new Promise(resolve=>setImmediate(resolve));const pulling=sync.pull('2026-11-14');
  await new Promise(resolve=>setImmediate(resolve));
  const readsBeforeRelease=requests.filter(x=>x.opts.method!=='PUT').length;
  release();await saving;await pulling;
  assert.equal(readsBeforeRelease,2,'only initial pull and save GET may run before PUT finishes');
});
test('explicit force save can resolve a remote conflict while preserving normal guards',async()=>{
  const {sync,requests}=setup();sync.markDirty('2026-11-14');await sync.save('2026-11-14','- [ ] local',{force:true});
  assert.equal(requests.filter(x=>x.opts.method==='PUT').length,1);assert.equal(sync.isDirty('2026-11-14'),false);
});
