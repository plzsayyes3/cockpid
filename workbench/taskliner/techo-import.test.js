const test=require('node:test');
const assert=require('node:assert/strict');
const Techo=require('./techo-import.js');

test('extracts the requested Japanese date section from a monthly techo file',()=>{
  const md=`# 2026年9月\n\n## 9月19日(土)\n- 前日\n\n## 9月20日(日)\n- 10:00-12:00 👪予定\n- [x] 🐰完了作業\n- 日中の作業\n\n## 9月21日(月)\n- 次の日`;
  assert.deepEqual(Techo.extractDateTasks(md,'2026-09-20'),[
    {title:'👪予定',estimate:120,completed:false,section:'9-19',planned_at:'10:00'},
    {title:'🐰完了作業',estimate:0,completed:true,section:'9-19',planned_at:''},
    {title:'日中の作業',estimate:0,completed:false,section:'9-19',planned_at:''}
  ]);
});

test('maps time ranges to TaskLiner sections and ignores non-task headings',()=>{
  const md=`## 9月20日(日)\n- 07:00-07:30 朝\n- 19:00-23:00 夜\n### メモ\n- 箇条書き`;
  const items=Techo.extractDateTasks(md,'2026-09-20');
  assert.deepEqual(items.map(x=>[x.title,x.section,x.estimate,x.planned_at]),[
    ['朝','7-9',30,'07:00'],['夜','19-24',240,'19:00'],['箇条書き','9-19',0,'']
  ]);
});

test('deduplicates imported items without merging different times',()=>{
  const items=[
    {title:'同じ予定',estimate:30,completed:false,section:'9-19',planned_at:'10:00'},
    {title:'同じ予定',estimate:30,completed:false,section:'9-19',planned_at:'10:00'},
    {title:'同じ予定',estimate:30,completed:false,section:'9-19',planned_at:'11:00'}
  ];
  assert.equal(Techo.dedupeTasks(items).length,2);
});


