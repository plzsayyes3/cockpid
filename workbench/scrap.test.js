const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('./scrap-model.js');
const {createStore} = require('./scrap-store.js');
const json = value => new Response(JSON.stringify(value), {headers:{'Content-Type':'application/json'}});
const payload = (value,sha='v1') => ({content:Buffer.from(JSON.stringify(value)).toString('base64'),sha});
const capture = {id:'abc',title:'スクショ',memo:'あとで読む',created_at:'2026-11-05T00:00:00Z',handled:false,image_path:'03_scrap/assets/abc.png',image_type:'image/png'};

test('only unhandled captures show by default; handled remain restorable', () => {
 const cards=[capture,{...capture,id:'done',handled:true}];
 assert.deepEqual(M.visibleCaptures(cards,false).map(x=>x.id),['abc']);
 assert.deepEqual(M.visibleCaptures(cards,true).map(x=>x.id),['done']);
 assert.equal(cards[1].handled,true);
});
test('14 JST dates include today and cross a month boundary correctly',()=>{
 const dates=M.dates(new Date('2026-11-01T16:00:00Z'),14);
 assert.equal(dates[0],'2026-11-02');assert.equal(dates.at(-1),'2026-10-20');assert.equal(dates.length,14);
});
test('Japanese recent writing ranks matching Ideas and mixes without duplicates',()=>{
 const ideas=Array.from({length:12},(_,i)=>({id:String(i),title:i<7?'木製キーボードのキーキャップ '+i:'保育の主体性 '+i,status:'active'}));
 const selected=M.selectIdeas(ideas,'最近は木製キーボードのキーキャップを作っている',{limit:10,rng:()=>0});
 assert.equal(selected.length,10);assert.equal(new Set(selected.map(x=>x.id)).size,10);
 assert.ok(selected.filter(x=>x.reason==='最近の記録と関連').length>=7);
 assert.ok(selected.some(x=>x.reason==='ランダム'));
 assert.equal(selected[0].id,'0');
});
test('empty context is random and archived Ideas are excluded; pins survive',()=>{
 const ideas=[{id:'a',title:'a',status:'active'},{id:'b',title:'b',status:'archived'},{id:'c',title:'c',status:'active'}];
 const selected=M.selectIdeas(ideas,'',{limit:2,rng:()=>0,pinned:['a']});
 assert.deepEqual(selected.map(x=>x.id),['a','c']);assert.equal(selected[0].reason,'固定');assert.equal(selected[1].reason,'ランダム');
});
test('authenticated uploads stay private and retry an immutable asset without duplicate cards',async()=>{
 const files=new Map();const writes=[];
 const store=createStore({token:()=> 'secret',fetch:async(url,init={})=>{
 assert.equal(init.headers.Authorization,'Bearer secret');assert.match(url,/repos\/plzsayyes3\/mynotebook\/contents\/03_scrap\//);assert.ok(!url.includes('secret'));
 const key=new URL(url).pathname;
 if(init.method==='PUT'){const b=JSON.parse(init.body);writes.push(key);files.set(key,{content:b.content,sha:'sha'});return json({content:{sha:'sha'}});}
 return files.has(key)?json(files.get(key)):new Response('',{status:404});
 }});
 await store.createCapture(capture,'aW1hZ2U=');await store.createCapture(capture,'aW1hZ2U=');
 assert.equal(files.size,2);assert.equal(writes.length,2);
});
test('metadata conflict retries preserve another device memo while changing handled state',async()=>{
 let current={...capture,memo:'別端末で変更'};let puts=0;
 const store=createStore({token:()=> 'x',fetch:async(url,init={})=>{
 if(init.method!=='PUT')return json(payload(current,puts?'v2':'v1'));
 puts++;if(puts===1)return new Response('',{status:409});
 const body=JSON.parse(init.body);assert.equal(body.sha,'v2');current=JSON.parse(Buffer.from(body.content,'base64').toString());return json({content:{sha:'v3'}});
 }});
 const result=await store.updateCapture('03_scrap/cards/abc.json',{handled:true});
 assert.equal(result.memo,'別端末で変更');assert.equal(result.handled,true);assert.equal(puts,2);
});
test('reject unsafe image paths, unsupported formats and oversize uploads',async()=>{
 const store=createStore({token:()=> 'x',fetch:()=>{throw Error('must not fetch')}});
 await assert.rejects(()=>store.image({...capture,image_path:'https://evil.invalid/x'}),/画像/);
 await assert.rejects(()=>store.image({...capture,image_path:'03_scrap/assets/../x'}),/画像/);
 assert.throws(()=>M.validateFile({type:'image/svg+xml',size:20}),/PNG/);
 assert.throws(()=>M.validateFile({type:'image/png',size:16*1024*1024}),/15/);
});
test('missing capture directory is empty but permission errors are surfaced',async()=>{
 const empty=createStore({token:()=> 'x',fetch:async()=>new Response('',{status:404})});
 assert.deepEqual((await empty.list()).cards,[]);
 const denied=createStore({token:()=> 'x',fetch:async()=>new Response('',{status:403})});
 await assert.rejects(()=>denied.list(),/403/);
});
test('partial capture corruption preserves readable cards and reports a warning',async()=>{
 const store=createStore({token:()=> 'x',fetch:async url=>{
 if(url.includes('/cards?'))return json([{name:'abc.json',path:'03_scrap/cards/abc.json'},{name:'broken.json',path:'03_scrap/cards/broken.json'}]);
 return url.includes('broken')?json(payload({bad:true})):json(payload(capture));
 }});
 const result=await store.list();assert.equal(result.cards.length,1);assert.equal(result.warnings.length,1);
});
test('recent context uses configured Daily and Inbox, only recent filenames',async()=>{
 const paths=[];
 const store=createStore({token:()=> 'x',dailySource:()=>({repo:'mynotebook',dir:'01_Daily'}),inboxSource:()=>({repo:'mynotebook',dir:'00_inbox'}),fetch:async url=>{
 paths.push(url);
 if(url.includes('/00_inbox?'))return json([{name:'20261105090000000.md',path:'00_inbox/20261105090000000.md'},{name:'20200101000000000.md',path:'00_inbox/20200101000000000.md'}]);
 return json({content:Buffer.from('木製キーキャップを作る').toString('base64'),sha:'x'});
 }});
 const result=await store.recentContext(new Date('2026-11-05T01:00:00Z'));
 assert.ok(result.text.includes('木製'));assert.ok(!paths.some(x=>x.includes('20200101')));assert.equal(result.warnings.length,0);
});
test('Cards is reachable from HOME without replacing numeric apps',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const home=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
 const routes=fs.readFileSync(path.join(__dirname,'app-routing.js'),'utf8');
 assert.match(home,/data-app="cards"/);
 assert.match(routes,/cards:\s*\{ key: null,[^\n]*src: 'cards.html/);
});
test('Inbox retry after a lost response does not duplicate or overwrite a memo',async()=>{
 let written=null;let puts=0;
 const store=createStore({token:()=> 'x',fetch:async(url,init={})=>{
 if(init.method==='PUT'){puts++;written=JSON.parse(init.body);throw Error('lost response');}
 return written?json({content:written.content,sha:'v1'}):new Response('',{status:404});
 }});
 const options={name:'20261105100000001.md'};
 await assert.rejects(()=>store.saveInbox('メモ',options),/lost response/);
 await store.saveInbox('メモ',options);assert.equal(puts,1);
 await assert.rejects(()=>store.saveInbox('違うメモ',options),/別メモ/);
});
test('editing just a title excludes the untouched stale memo from the update',async()=>{
 const edits=M.captureEdits({title:'旧題',memo:'開いた時のメモ'},{title:'新題',memo:'開いた時のメモ'});
 assert.deepEqual(edits,{title:'新題'});
 let saved;
 const store=createStore({token:()=> 'x',fetch:async(url,init={})=>{
 if(init.method!=='PUT')return json(payload({...capture,title:'旧題',memo:'別端末の新しいメモ'}));
 saved=JSON.parse(Buffer.from(JSON.parse(init.body).content,'base64').toString());return json({});
 }});
 await store.updateCapture('03_scrap/cards/abc.json',edits);
 assert.equal(saved.title,'新題');assert.equal(saved.memo,'別端末の新しいメモ');
});
