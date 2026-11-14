const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8');
test('right page opens Inbox writing and retains Inbox and Daily choices',()=>{
 const s=read('notebook.mjs');assert.match(s,/mode='write'/);assert.match(s,/createDailyView/);assert.match(s,/Inbox/);assert.match(s,/createStore/);
});
test('TaskLiner compact mode is scoped to planner mounts',()=>{
 assert.match(read('../taskliner/controller.mjs'),/setLayoutMode/);assert.match(read('controller.mjs'),/mode:'planner'/);assert.match(read('../taskliner/view.css'),/\.tl-body\[data-layout="planner"\]/);
});
test('planner header resets inherited safe-area padding and gives the viewport its own rect',()=>{
 const css=read('../planner-shell.css');assert.match(css,/padding:0 10px!important/);assert.match(css,/--duo-visible-width/);assert.match(css,/--planner-extra-right/);
});
test('visual viewport geometry includes offsets without adding them to its size',()=>{
 const {geometry}=require('./viewport.js');assert.deepEqual(geometry({width:866,height:586,offsetTop:82,offsetLeft:0},950,668),{width:866,height:586,top:82,left:0});
 assert.deepEqual(geometry(null,390,800),{width:390,height:800,top:0,left:0});
});

test('DUO right rail has labeled choices and a visible active state',()=>{
 const source=read('notebook.mjs'),css=read('notebook.css');
 for(const mode of ['write','inbox','daily','display'])assert.match(source,new RegExp('data-mode="'+mode+'"'));
 assert.match(source,/class="rail-icon"/);assert.match(source,/class="rail-text"/);
 assert.match(css,/nav button\[aria-pressed="true"\]/);assert.match(css,/min-height:52px/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) 44px/);
});
