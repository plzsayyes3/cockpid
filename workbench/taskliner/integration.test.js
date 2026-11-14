const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
test('Tasks uses the internal reusable module instead of the iframe bridge',()=>{
  const routing=read('../app-routing.js');assert.match(routing,/tasks:\s*\{[^\n]*type: 'taskliner'/);assert.match(routing,/taskliner\/controller.mjs/);
});
test('native task component has no runtime HTML patching or nested frames',()=>{
  for(const file of ['app.mjs','controller.mjs','app-markup.mjs']){const source=read(file);assert.doesNotMatch(source,/srcdoc|<iframe|document\.write\(|new Function\(/);}
  assert.match(read('controller.mjs'),/attachShadow/);assert.match(read('controller.mjs'),/instance/);
});
test('ported core retains original storage and explicit view API',()=>{
  const source=read('app.mjs');assert.match(source,/taskliner_taskchute_line_v1:/);assert.match(source,/taskliner_taskchute_line_document_v1:/);
  for(const name of ['exportMarkdown','importMarkdown','navigate','getDate'])assert.match(source,new RegExp(name));
});
test('component defines its palette on the actual scoped body',()=>{
  const css=read('app.css');assert.doesNotMatch(css,/\.tl-\.tl-body/);assert.match(css,/\.tl-body\s*\{\s*color-scheme:light/);
});
test('Enter during Japanese composition does not add a task',()=>{
  const source=read('app.mjs');
  for(const id of ['newTitle','newEstimate']){
    const registration=source.match(new RegExp("\\$\\('"+id+"'\\)\\.addEventListener\\('keydown',(e=>\\{[^}]*\\})\\)"));assert.ok(registration);
    let additions=0;const handler=new Function('addNew','return ('+registration[1]+')')(()=>additions++);
    handler({key:'Enter',isComposing:true});assert.equal(additions,0);
    handler({key:'Enter',isComposing:false});assert.equal(additions,1);
  }
});
test('Escape in the native component is handled before the drawer closes',()=>{
  const vm=require('node:vm'),handlers={};let closed=false;
  const drawer={classList:{contains:()=>true,remove(){closed=true}},setAttribute(){},addEventListener(){}};
  const doc={getElementById:id=>id==='appWindow'?drawer:id==='appClose'?{addEventListener(){}}:{innerHTML:''},addEventListener:(type,fn)=>handlers[type]=fn};
  vm.runInNewContext(read('../navigation.js'),{document:doc});
  handlers.keydown({key:'Escape',composedPath:()=>[{dataset:{taskliner:'native'}}],preventDefault(){},stopImmediatePropagation(){}});
  assert.equal(closed,false);
});
test('conflict recovery exposes confirmed local overwrite as well as pull',()=>{
  assert.match(read('view-markup.mjs'),/id="tlForceSave"/);
  assert.match(read('controller.mjs'),/window\.confirm\('GitHub側の内容を、現在のローカルの内容で上書きしますか？'\)/);
});
test('moving a task to tomorrow marks the target date for synchronization',()=>{
  const line=read('app.mjs').split('\n').find(value=>value.startsWith('function moveTomorrow('));
  const tasks=[{id:'one',title:'移動'}],target={tasks:[],nodes:[]},notifications=[];
  const deps={tasks,activeDate:'2026-11-14',shiftDate:require('./taskliner-date.js').shiftDate,normalizeTask:x=>x,uid:()=>'two',readStoredDate:()=>target,insertTaskNode(){},writeStoredDate(){},removeTaskNode(){},save:()=>notifications.push('2026-11-14'),toast(){},notifyHost:(type,payload)=>notifications.push(payload.date)};
  const move=new Function(...Object.keys(deps),'return ('+line+')')(...Object.values(deps));move('one');
  assert.equal(target.tasks[0].title,'移動');assert.deepEqual(notifications.sort(),['2026-11-14','2026-11-15']);
});
