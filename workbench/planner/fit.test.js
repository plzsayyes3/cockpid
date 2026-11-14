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

test('Duo-sized touch viewports use a safe-area-aware side dock with the existing launchers',()=>{
 const index=read('../index.html'),css=read('../duo-side-dock.css');
 assert.match(index,/duo-side-dock\.css/);
 assert.match(css,/min-width:320px/);
 assert.match(css,/pointer:coarse/);
 assert.match(css,/#appDock \.dock-primary/);
 assert.match(css,/env\(safe-area-inset-right\)/);
 assert.match(css,/duo-planner-open #appDock/);
});
test('planner right adjustment is applied to container padding, not the frame width',()=>{
 const css=read('../planner-shell.css');
 assert.match(css,/padding:0 calc\(env\(safe-area-inset-right\) \+ var\(--planner-extra-right,0px\)\)/);
 assert.doesNotMatch(css,/width:calc\(100% - var\(--planner-extra-right/);
});

test('Folded Duo retains side dock without a portrait aspect ratio gate',()=>{
 const css=read('../duo-side-dock.css');
 assert.match(css,/min-width:320px/);
 assert.doesNotMatch(css,/min-aspect-ratio/);
 assert.match(css,/body\.wb-side-dock #appDock/);
});
test('Side dock choice persists and is exposed through the More panel',()=>{
 const js=read('../duo-side-dock.js'),index=read('../index.html');
 assert.match(index,/duo-side-dock\.js/);
 assert.match(js,/cockpid\.workbench\.side-dock\.v1/);
 assert.match(js,/localStorage\.setItem/);
 assert.match(js,/extra\.append\(button\)/);
 assert.match(js,/aria-pressed/);
});

test('planner masks the layout-viewport remainder without expanding interactive bounds',()=>{
 const css=read('../planner-shell.css');
 assert.match(css,/\.app-window\.planner-mode\.open\s*\{\s*box-shadow:0 0 0 100vmax #f8f6ef;/);
 assert.match(css,/width:var\(--duo-visible-width,100vw\)!important/);
 assert.match(css,/height:var\(--duo-visible-height,100dvh\)!important/);
});

test('DUO has three independent persistent display calibration controls',()=>{
 const js=read('notebook.mjs'),css=read('notebook.css'),shell=read('../planner-shell.css');
 for(const id of ['shift','railTop','inset'])assert.match(js,new RegExp('id="'+id+'"'));
 for(const key of ['horizontal-shift.v1','rail-top.v1','right-inset.v1'])assert.ok(js.includes(key));
 assert.match(js,/layoutValues/);
 assert.match(js,/resetLayout/);
 assert.match(js,/addEventListener\('input',applyLayout\)/);
 assert.match(css,/--planner-rail-top/);
 assert.match(shell,/--planner-shift-x/);
});

test('DUO calibration assets are independently versioned through the import chain',()=>{
 const route=read('../app-routing.js'),controller=read('controller.mjs'),notebook=read('notebook.mjs'),index=read('../index.html');
 const version='20261114-calibration2';
 assert.ok(route.includes("planner/controller.mjs?v="+version));
 assert.ok(controller.includes("notebook.mjs?v="+version));
 assert.ok(notebook.includes("notebook.css?v="+version));
 assert.ok(index.includes("planner-shell.css?v="+version));
 assert.match(notebook,/表示調整 · v2/);
});
