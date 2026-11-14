const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const modulePath=path.join(__dirname,'daily-store.js');
function fixture(){
 const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const remote=new Map([['2026-11-14',{text:'---\ntags: [daily]\n---\n# 今日\n\n原文のまま。\n',sha:'s1'}],['2026-11-13',{text:'# 昨日\n',sha:'s2'}]]);let gate=null,offline=false;const requests=[];
 const request=async(url,opts={})=>{if(offline)throw Error('offline');const date=url.match(/(\d{4}-\d{2}-\d{2})\.md/)[1],current=remote.get(date);requests.push({date,method:opts.method||'GET'});
   if(opts.method==='PUT'){if(gate)await gate;const body=JSON.parse(opts.body);if(current&&body.sha!==current.sha)return new Response(JSON.stringify({message:'conflict'}),{status:409});const text=Buffer.from(body.content,'base64').toString();remote.set(date,{text,sha:'saved-'+date});return new Response(JSON.stringify({content:{sha:'saved-'+date}}));}
   if(gate)await gate;return current?new Response(JSON.stringify({content:Buffer.from(current.text).toString('base64'),encoding:'base64',size:Buffer.byteLength(current.text),sha:current.sha})):new Response('{}',{status:404});
 };
 const create=()=>require(modulePath).createStore({storage,fetch:request,source:()=>({repo:'mynotebook',dir:'01_Daily'}),token:()=>'fixture-token'});
 return{create,remote,memory,requests,offline(v){offline=v},gate(v){gate=v}};
}
test('reads canonical Daily Markdown without normalizing its contents',async()=>{
 const f=fixture(),store=f.create(),record=store.get('2026-11-14');await store.load(record);assert.equal(record.path,'01_Daily/2026-11-14.md');assert.equal(record.text,f.remote.get(record.date).text);assert.equal(record.dirty,false);
});
test('saves exact text and retains the file SHA',async()=>{
 const f=fixture(),store=f.create(),r=store.get('2026-11-14');await store.load(r);store.edit(r,r.text+'\n追記。\n');const expected=r.text;await store.save(r);assert.equal(f.remote.get(r.date).text,expected);assert.equal(r.dirty,false);assert.equal(r.baseSha,'saved-'+r.date);
});
test('external changes cause a conflict without overwriting local or remote text',async()=>{
 const f=fixture(),s=f.create(),r=s.get('2026-11-14');await s.load(r);s.edit(r,'ローカル');f.remote.set(r.date,{text:'外部更新',sha:'external'});await assert.rejects(s.save(r),{code:'DAILY_CONFLICT'});assert.equal(r.text,'ローカル');assert.equal(r.dirty,true);assert.equal(f.remote.get(r.date).text,'外部更新');
});
test('edits made during save remain dirty',async()=>{
 const f=fixture(),s=f.create(),r=s.get('2026-11-14');await s.load(r);s.edit(r,'先の入力');let release;f.gate(new Promise(resolve=>release=resolve));const saving=s.save(r);await new Promise(resolve=>setImmediate(resolve));s.edit(r,'後の入力');release();await saving;assert.equal(r.text,'後の入力');assert.equal(r.dirty,true);assert.equal(f.remote.get(r.date).text,'先の入力');
});
test('records keep their dates when another day opens during an operation',async()=>{
 const f=fixture(),s=f.create(),today=s.get('2026-11-14'),yesterday=s.get('2026-11-13');await s.load(today);s.edit(today,'今日にだけ保存');await s.load(yesterday);await s.save(today);assert.equal(f.remote.get(today.date).text,'今日にだけ保存');assert.equal(yesterday.text,'# 昨日\n');
});
test('a delayed load never replaces text edited during the request',async()=>{
 const f=fixture(),s=f.create(),r=s.get('2026-11-14');let release;f.gate(new Promise(resolve=>release=resolve));const loading=s.load(r);await new Promise(resolve=>setImmediate(resolve));s.edit(r,'読込中の入力');release();await loading;assert.equal(r.text,'読込中の入力');assert.equal(r.dirty,true);
});
test('offline drafts and view position survive recreating the store',async()=>{
 const f=fixture(),s=f.create(),r=s.get('2026-11-14');await s.load(r);s.edit(r,'通信失敗でも残す');s.rememberView(r,{scrollTop:123,selectionStart:2,selectionEnd:5});f.offline(true);await assert.rejects(s.save(r),/offline/);const restored=f.create().get(r.date);assert.equal(restored.text,r.text);assert.equal(restored.dirty,true);assert.equal(restored.scrollTop,123);assert.equal(restored.selectionEnd,5);
});
test('save and reload run in order for the same daily record',async()=>{
 const f=fixture(),s=f.create(),r=s.get('2026-11-14');await s.load(r);s.edit(r,'保存してから読む');let release;f.gate(new Promise(resolve=>release=resolve));const saving=s.save(r);await new Promise(resolve=>setImmediate(resolve));const loading=s.load(r,{discard:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.requests.length,2);release();await saving;await loading;assert.equal(r.text,'保存してから読む');
});
test('an unknown baseline cannot overwrite a pre-existing Daily',async()=>{
 const f=fixture(),s=f.create(),r=s.get('2026-11-14');s.edit(r,'未読の上書き');await assert.rejects(s.save(r),{code:'DAILY_CONFLICT'});assert.match(f.remote.get(r.date).text,/原文/);
});
test('absent dates are created only after an edit and explicit save',async()=>{
 const f=fixture(),s=f.create(),r=s.get('2026-11-15');await s.load(r);await s.save(r);assert.equal(f.remote.has(r.date),false);s.edit(r,'新しい日の本文');await s.save(r);assert.equal(f.remote.get(r.date).text,'新しい日の本文');
});
test('empty text cannot automatically erase a nonempty Daily',async()=>{
 const f=fixture(),s=f.create(),r=s.get('2026-11-14');await s.load(r);s.edit(r,'');await assert.rejects(s.save(r),{code:'DAILY_EMPTY'});assert.match(f.remote.get(r.date).text,/原文/);
});
test('discard reload invalidates an old autosave queued while reload is in flight',async()=>{
 const f=fixture(),s=f.create(),r=s.get('2026-11-14');await s.load(r);s.edit(r,'discarded draft');
 f.remote.set(r.date,{text:'external newer text',sha:'external'});
 let release;f.gate(new Promise(resolve=>release=resolve));const loading=s.load(r,{discard:true});
 await new Promise(resolve=>setImmediate(resolve));const saving=s.save(r);release();await loading;await saving;
 assert.equal(f.remote.get(r.date).text,'external newer text');assert.equal(r.text,'external newer text');assert.equal(r.dirty,false);
 assert.equal(f.requests.filter(req=>req.method==='PUT').length,0);
});
