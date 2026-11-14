const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
test('header opens the internal planner and its book control returns home',()=>{
 assert.match(read('../index.html'),/id="plannerOpen"[^>]*data-app="planner"/);
 assert.match(read('../app-routing.js'),/planner:\s*\{[^\n]*type: 'planner'/);
 assert.match(read('../app-routing.js'),/planner\/controller.mjs/);
 assert.match(read('../index.html'),/id="plannerClose"/);
});
test('planner reuses the native TaskLiner and never embeds another page',()=>{
 const source=read('controller.mjs');assert.match(source,/import.*mount.*taskliner\/controller.mjs/);assert.doesNotMatch(source,/<iframe|srcdoc|document\.write/);assert.match(source,/ResizeObserver/);assert.match(source,/\.inert\s*=/);
});
test('keyboard-height changes cannot change the two-page layout',()=>{
 const source=read('controller.mjs');assert.match(source,/layout\(width,focus\)/);assert.doesNotMatch(read('layout.js'),/innerHeight|visualViewport|height/i);
});
test('Daily does not use the TaskLiner storage namespace or save destination',()=>{
 const source=read('daily-store.js');assert.doesNotMatch(source,/09_taskchute|taskliner_github_dirty/);assert.match(source,/01_Daily/);
});
