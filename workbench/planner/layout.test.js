const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const file=path.join(__dirname,'layout.js');
test('layout model exists',()=>assert.ok(fs.existsSync(file)));
test('wide layout uses equal columns and never collapses either page',()=>{
 const {layout}=require(file);assert.deepEqual(layout(700,'memo'),{mode:'spread',focus:'memo',columns:'minmax(0,1fr) minmax(0,1fr)',collapsed:null});
});
test('narrow layout keeps tasks left and memo right with a minimum 44px switch band',()=>{
 const {layout}=require(file);const tasks=layout(390,'tasks'),memo=layout(390,'memo');
 assert.equal(tasks.mode,'compact');assert.equal(tasks.collapsed,'memo');assert.equal(tasks.columns,'minmax(0,9fr) minmax(44px,1fr)');
 assert.equal(memo.collapsed,'tasks');assert.equal(memo.columns,'minmax(44px,1fr) minmax(0,9fr)');assert.equal(layout(699,'tasks').mode,'compact');
});
test('invalid initial widths use compact mode without changing the remembered focus',()=>{
 const {layout}=require(file);assert.equal(layout(0,'memo').focus,'memo');assert.equal(layout(NaN).mode,'compact');
});
