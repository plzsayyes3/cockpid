const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const M=require('./scrap-model.js');
function harness() {
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
 const doc={getElementById:get,createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element(),body:new Element(),addEventListener(){}};
 const store={createCapture:async card=>{await waiting;return {...card,path:`03_scrap/cards/${card.id}.json`};}};
 const win={COCKPID_SCRAP_MODEL:M,COCKPID_SCRAP_OCR:require('./scrap-ocr.js'),COCKPID_SCRAP_STORE:{createStore:()=>store},fetch(){},addEventListener(){},COCKPID_SOURCES:{get(){}}};
 const sandbox={window:win,document:doc,token:()=>'',localStorage:{getItem:()=>null,setItem(){}},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},crypto:{randomUUID:()=> 'id'},FileReader:class {readAsDataURL(){this.result='data:image/png;base64,aQ==';queueMicrotask(()=>this.onload());}},setTimeout:()=>1,clearTimeout(){},console,Intl,Date};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'cards.js'),'utf8'),sandbox);
 return {get,finish};
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
