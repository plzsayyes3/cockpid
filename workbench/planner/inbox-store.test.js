const {test}=require('node:test');const assert=require('node:assert/strict');
function fixture(){
 const memory=new Map(),files=new Map(),requests=[];let offline=false,lost=false,gate=null;
 const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const fetch=async(url,opts={})=>{if(offline)throw Error('offline');const p=decodeURIComponent(new URL(url).pathname.split('/contents/')[1]);requests.push({path:p,method:opts.method||'GET'});
  if(opts.method==='PUT'){if(gate)await gate;if(files.has(p))return new Response('{}',{status:409});files.set(p,Buffer.from(JSON.parse(opts.body).content,'base64').toString());if(lost){lost=false;throw Error('lost response')}return new Response(JSON.stringify({content:{sha:'saved'}}));}
  if(p==='00_inbox')return new Response(JSON.stringify([...files.keys()].map(x=>({name:x.split('/').pop(),path:x,type:x.includes('/archive/')?'dir':'file'}))));
  return files.has(p)?new Response(JSON.stringify({sha:'sha',encoding:'base64',content:Buffer.from(files.get(p)).toString('base64')})):new Response('{}',{status:404});
 };
 const create=()=>require('./inbox-store.js').createStore({storage,fetch,source:()=>({repo:'mynotebook',dir:'00_inbox'}),token:()=>'fixture-token',now:()=>new Date('2026-11-14T08:30:00.001Z')});
 return{create,files,requests,offline(v){offline=v},lost(){lost=true},gate(v){gate=v}};
}
test('Inbox send writes an immutable timestamped file and clears a confirmed unchanged draft',async()=>{
 const f=fixture(),s=f.create();s.edit('メモ');await s.send();assert.equal(f.files.size,1);assert.match([...f.files.keys()][0],/^00_inbox\/\d{17}\.md$/);assert.equal([...f.files.values()][0],'メモ\n');assert.equal(s.draft().text,'');
});
test('lost response and retry never create duplicate Inbox files',async()=>{
 const f=fixture(),s=f.create();s.edit('再送');f.lost();await s.send();assert.equal(f.files.size,1);assert.equal(s.draft().text,'');
});
test('offline retry survives a new store and retains the same pending filename',async()=>{
 const f=fixture(),s=f.create();s.edit('下書き');f.offline(true);await assert.rejects(s.send(),/offline/);const name=s.draft().pending.name;
 const restored=f.create();assert.equal(restored.draft().pending.name,name);f.offline(false);await restored.send();assert.equal([...f.files.keys()][0],'00_inbox/'+name);
});
test('sending an earlier snapshot does not delete later edits',async()=>{
 const f=fixture(),s=f.create();s.edit('元のメモ');let release;f.gate(new Promise(r=>release=r));const sending=s.send();await new Promise(r=>setImmediate(r));s.edit('元のメモ\n追記');release();await sending;assert.equal(s.draft().text,'元のメモ\n追記');assert.equal([...f.files.values()][0],'元のメモ\n');
});
test('double send shares one operation',async()=>{
 const f=fixture(),s=f.create();s.edit('一度だけ');await Promise.all([s.send(),s.send()]);assert.equal(f.requests.filter(x=>x.method==='PUT').length,1);
});
test('a different existing file is never overwritten',async()=>{
 const f=fixture(),s=f.create();s.edit('別のメモ');f.offline(true);await assert.rejects(s.send());const name=s.draft().pending.name;f.files.set('00_inbox/'+name,'他の内容');f.offline(false);await assert.rejects(s.send(),{code:'INBOX_COLLISION'});assert.equal(f.files.get('00_inbox/'+name),'他の内容');assert.equal(s.draft().text,'別のメモ');
});
test('Inbox list excludes archive, assets and malformed names',async()=>{
 const f=fixture(),s=f.create();f.files.set('00_inbox/20261114173000001.md','新しい');f.files.set('00_inbox/20261113120000.md','古い');f.files.set('00_inbox/archive/a.md','除外');f.files.set('00_inbox/image.png','除外');const rows=await s.list();assert.deepEqual(rows.map(x=>x.name),['20261114173000001.md','20261113120000.md']);assert.equal(await s.read(rows[0]),'新しい');
});
