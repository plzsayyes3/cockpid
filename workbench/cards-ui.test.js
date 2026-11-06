const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const M=require('./scrap-model.js');
function harness(clipboard) {
 class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.events={};this.classList={toggle(){},add(){},remove(){}};this.value='';this.disabled=false;this.open=false;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  addEventListener(name,fn){this.events[name]=fn;}
  setAttribute(){}
  showModal(){this.open=true;}
  close(){this.open=false;}
  querySelector(){return new Element();}
  querySelectorAll(selector){return this.children.flatMap(c=>c instanceof Element?[...((selector.split(',').map(s=>s.trim()).includes(c.tagName.toLowerCase()))?[c]:[]),...c.querySelectorAll(selector)]:[]);}
  focus(){}
  fire(name,event={}){return this.events[name]?.(event);}
 }
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 let finish;const waiting=new Promise(r=>finish=r);
 const events={};
 const doc={getElementById:get,createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element(),body:new Element(),addEventListener(name,fn){events[name]=fn;}};
 const store={createCapture:async card=>{await waiting;return {...card,path:`03_scrap/cards/${card.id}.json`};}};
 const win={COCKPID_SCRAP_MODEL:M,COCKPID_SCRAP_OCR:require('./scrap-ocr.js'),COCKPID_SCRAP_STORE:{createStore:()=>store},fetch(){},addEventListener(){},COCKPID_SOURCES:{get(){}}};
 const sandbox={window:win,document:doc,navigator:{clipboard},File,token:()=>'',localStorage:{getItem:()=>null,setItem(){}},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},crypto:{randomUUID:()=> 'id'},FileReader:class {readAsDataURL(){this.result='data:image/png;base64,aQ==';queueMicrotask(()=>this.onload());}},setTimeout:()=>1,clearTimeout(){},console,Intl,Date};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'cards.js'),'utf8'),sandbox);
 return {get,finish,fire:(name,event)=>events[name]?.(event)};
}
test('upload editors are disabled for the entire in-flight snapshot',async()=>{
 const h=harness();
 h.get('imageFiles').fire('change',{target:{files:[{name:'test.png',type:'image/png',size:100}],value:''}});
 const save=h.get('saveUploads').fire('click');
 const inputs=h.get('uploadItems').querySelectorAll('input, textarea');
 assert.equal(inputs.length,2);
 assert.ok(inputs.every(input=>input.disabled),'title and memo must be locked before network starts');
 h.finish();await save;
});

test('clipboard is read only on click and opens the image editor before saving',async()=>{
 let reads=0;
 const h=harness({read:async()=>{reads++;return [{types:['text/html','image/png'],getType:async()=>new Blob(['image'],{type:'image/png'})}];}});
 assert.equal(reads,0);
 await h.get('pasteImage').fire('click');
 assert.equal(reads,1);assert.equal(h.get('uploadDialog').open,true);
 assert.equal(h.get('uploadItems').querySelectorAll('input, textarea').length,2);
});
test('clipboard denial preserves a clear keyboard paste fallback',async()=>{
 const h=harness({read:async()=>{throw new Error('NotAllowedError');}});
 await h.get('pasteImage').fire('click');
 assert.equal(h.get('uploadDialog').open,false);
 assert.match(h.get('clipboardStatus').textContent,/Ctrl.*V/);
 assert.equal(h.get('clipboardStatus').hidden,false);
});
test('clipboard with no image does not create an empty card',async()=>{
 const h=harness({read:async()=>[{types:['text/plain']}]});
 await h.get('pasteImage').fire('click');
 assert.equal(h.get('uploadDialog').open,false);
 assert.match(h.get('clipboardStatus').textContent,/画像/);
});
test('Ctrl+V accepts image items when clipboard files are unavailable',()=>{
 const h=harness();let prevented=false;
 h.fire('paste',{clipboardData:{files:[],items:[{type:'image/png',getAsFile:()=>new File(['image'],'paste.png',{type:'image/png'})}]},preventDefault(){prevented=true;}});
 assert.equal(h.get('uploadDialog').open,true);assert.equal(prevented,true);
});
test('ordinary pasted text is left alone and does not read the clipboard',()=>{
 const h=harness({read(){throw Error('should not read');}});let prevented=false;
 h.fire('paste',{clipboardData:{files:[],items:[{type:'text/plain'}]},preventDefault(){prevented=true;}});
 assert.equal(prevented,false);assert.equal(h.get('uploadDialog').open,false);
});
