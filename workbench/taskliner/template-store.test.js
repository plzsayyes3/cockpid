const {test}=require('node:test');
const assert=require('node:assert/strict');
const TL=require('./template-core.js');
const base='09_taskchute/templates/repeats';
const configKey='taskliner_github_sync_config_v1';
const cacheKey='taskliner_repeat_blob_cache_v1';
async function fixture(){
  const {createTemplateStore}=await import('./template-store.mjs');
  const state=new Map(), files=new Map(), requests=[];
  const storage={getItem:k=>state.get(k)??null,setItem:(k,v)=>state.set(k,String(v))};
  let failPath='', failList=false, mismatchPath='', beforeRead=null;
  function put(id,sha,section=''){
    const path=base+'/'+id+'.md';
    files.set(path,{sha,text:TL.serializeRepeat({id,master_id:'master',rule:'daily',section})});
    return path;
  }
  const request=async url=>{
    const u=new URL(url),path=decodeURIComponent(u.pathname.split('/contents/')[1]);
    requests.push(path);
    const response=(data,status=200)=>({status,ok:status===200,json:async()=>data});
    if(path===base){
      if(failList)return response({message:'offline'},503);
      return response([...files].map(([path,f])=>({type:'file',name:path.split('/').pop(),path,sha:f.sha})));
    }
    if(beforeRead)beforeRead();
    if(path===failPath)return response({message:'offline'},503);
    const f=files.get(path);if(!f)return response({},404);
    return response({sha:path===mismatchPath?'changed-mid-read':f.sha,content:Buffer.from(f.text).toString('base64')});
  };
  const store=createTemplateStore({TaskLinerTemplates:TL},storage,request);
  return{store,storage,state,files,requests,put,request,createTemplateStore,
    failFile:p=>{failPath=p},failList:v=>{failList=v},mismatch:p=>{mismatchPath=p},beforeRead:fn=>{beforeRead=fn}};
}
test('fresh directory SHA check avoids all unchanged blob downloads, including after restart',async()=>{
  const f=await fixture();for(let i=0;i<18;i++)f.put('r'+i,'sha'+i);
  const cold=await f.store.loadRepeats();assert.equal(cold.length,18);assert.equal(f.requests.length,19);
  const restarted=f.createTemplateStore({TaskLinerTemplates:TL},f.storage,f.request);
  f.requests.length=0;assert.deepEqual(await restarted.loadRepeats(),cold);assert.deepEqual(f.requests,[base]);
});
test('changed and new files are fetched; deleted files disappear',async()=>{
  const f=await fixture(),a=f.put('a','a1'),b=f.put('b','b1');await f.store.loadRepeats();
  f.put('a','a2','new');f.files.delete(b);const c=f.put('c','c1');f.requests.length=0;
  const rows=await f.store.loadRepeats();assert.deepEqual(f.requests,[base,a,c]);
  assert.deepEqual(rows.map(x=>[x.id,x._sha,x.section]),[['a','a2','new'],['c','c1','']]);
});
test('failed changed blob or list never returns stale results or overwrites cache',async()=>{
  const f=await fixture(),a=f.put('a','a1');await f.store.loadRepeats();
  const old=f.state.get(cacheKey);f.put('a','a2');f.failFile(a);
  await assert.rejects(f.store.loadRepeats(),/読込に失敗/);assert.equal(f.state.get(cacheKey),old);
  f.failFile('');f.failList(true);await assert.rejects(f.store.loadRepeats(),/offline/);
  f.failList(false);assert.equal((await f.store.loadRepeats())[0]._sha,'a2');
});
test('configuration change and mid-read SHA mismatch fail closed',async()=>{
  const f=await fixture(),a=f.put('a','a1');await f.store.loadRepeats();
  f.put('a','a2');f.mismatch(a);await assert.rejects(f.store.loadRepeats(),/読込に失敗/);
  f.mismatch('');f.beforeRead(()=>f.storage.setItem(configKey,JSON.stringify({templateBranch:'other'})));
  await assert.rejects(f.store.loadRepeats(),/同期設定が変更/);
});
test('other repository scope and malformed or unavailable cache never prevent fresh reads',async()=>{
  const f=await fixture(),a=f.put('a','a1');await f.store.loadRepeats();
  f.storage.setItem(configKey,JSON.stringify({templateRepo:'other/repo'}));f.requests.length=0;
  await f.store.loadRepeats();assert.deepEqual(f.requests,[base,a]);
  f.storage.setItem(cacheKey,'broken');f.requests.length=0;await f.store.loadRepeats();assert.deepEqual(f.requests,[base,a]);
  f.storage.setItem=(k,v)=>{throw Error('quota')};f.put('a','a2');assert.equal((await f.store.loadRepeats())[0]._sha,'a2');
});
