const test=require('node:test');
const assert=require('node:assert/strict');
const TL=require('./template-core.js');
const DI=require('./daily-integration.js');

test('existingInstances reads hidden metadata from Daily markdown',()=>{
  const md='## 7-9\n- [ ] 歯を磨く (5m) <!-- tl:master=task_brush repeat=repeat_am planned=07%3A15 -->\n';
  assert.deepEqual(DI.existingInstances(md),[{master_id:'task_brush',repeat_id:'repeat_am',planned_at:'07:15'}]);
});

test('planned repeats are inserted before unplanned tasks and sorted by planned_at',()=>{
  const md='## 7-9\n- [ ] 既存予定 (5m) <!-- tl:master=a repeat=r1 planned=07%3A20 -->\n- [ ] 単発タスク (5m)\n## 9-19\n- [ ] 仕事 (5m)\n';
  const instances=[
    {title:'歯を磨く',estimate:5,completed:false,master_id:'b',repeat_id:'r2',section:'7-9',planned_at:'07:15'},
    {title:'英語',estimate:5,completed:false,master_id:'c',repeat_id:'r3',section:'7-9',planned_at:'07:30'},
  ];
  const out=DI.mergeGeneratedIntoMarkdown(md,instances);
  const lines=out.split('\n');
  const brush=lines.findIndex(x=>x.includes('歯を磨く'));
  const planned=lines.findIndex(x=>x.includes('既存予定'));
  const english=lines.findIndex(x=>x.includes('英語'));
  const adhoc=lines.findIndex(x=>x.includes('単発タスク'));
  assert.ok(brush<planned);
  assert.ok(planned<english);
  assert.ok(english<adhoc);
});

test('planned task sorting keeps contiguous indented child lines with their parent',()=>{
  const md=[
    '## 7-9',
    '- [ ] 後の親 (5m) <!-- tl:master=b repeat=rb planned=08%3A00 -->',
    '    後の親メモ',
    '    - [ ] 後の子タスク',
    '- [ ] 先の親 (5m) <!-- tl:master=a repeat=ra planned=07%3A00 -->',
    '    先の親メモ',
    '    - [ ] 先の子タスク',
    ''
  ].join('\n');
  const out=DI.mergeGeneratedIntoMarkdown(md,[]);
  const lines=out.split('\n');
  const early=lines.findIndex(line=>line.includes('先の親 (5m)'));
  const earlyMemo=lines.findIndex(line=>line.includes('先の親メモ'));
  const earlyChild=lines.findIndex(line=>line.includes('先の子タスク'));
  const late=lines.findIndex(line=>line.includes('後の親 (5m)'));
  const lateMemo=lines.findIndex(line=>line.includes('後の親メモ'));
  const lateChild=lines.findIndex(line=>line.includes('後の子タスク'));
  assert.deepEqual([earlyMemo,earlyChild],[early+1,early+2]);
  assert.deepEqual([lateMemo,lateChild],[late+1,late+2]);
  assert.ok(earlyChild<late);
});

test('planned task block sorting works when parents have different child-line counts',()=>{
  const md=[
    '## 7-9',
    '- [ ] B (5m) <!-- tl:master=b repeat=rb planned=08%3A00 -->',
    '    B child 1',
    '    B child 2',
    '- [ ] A (5m) <!-- tl:master=a repeat=ra planned=07%3A00 -->',
    '    A child',
    '- [ ] 単発タスク (5m)',
    ''
  ].join('\n');
  const out=DI.mergeGeneratedIntoMarkdown(md,[]);
  assert.match(out,/A \(5m\)[^\n]*\n    A child\n- \[ \] B \(5m\)[^\n]*\n    B child 1\n    B child 2\n- \[ \] 単発タスク/);
});

test('missing section is appended without losing existing markdown',()=>{
  const md='## 7-9\n- [ ] 朝食 (5m)';
  const [instance]=TL.generateDailyInstances('2026-09-17',[{id:'m',title:'睡眠',aliases:[],status:'active',estimate:420}],[{id:'r',master_id:'m',status:'active',rule:'daily',section:'21-24',planned_at:'22:30'}],[]);
  const out=DI.mergeGeneratedIntoMarkdown(md,[instance]);
  assert.match(out,/## 7-9/);
  assert.match(out,/## 21-24/);
  assert.match(out,/repeat=r/);
});

test('generated sections follow clock order instead of string order',()=>{
  const instances=[
    {title:'夜',estimate:5,completed:false,master_id:'m3',repeat_id:'r3',section:'19-24',planned_at:'19:00'},
    {title:'朝',estimate:5,completed:false,master_id:'m1',repeat_id:'r1',section:'7-9',planned_at:'07:00'},
    {title:'昼',estimate:5,completed:false,master_id:'m2',repeat_id:'r2',section:'9-19',planned_at:'09:00'},
  ];
  const out=DI.mergeGeneratedIntoMarkdown('',instances);
  const sections=[...out.matchAll(/^## (.+)$/gm)].map(match=>match[1]);
  assert.deepEqual(sections,['7-9','9-19','19-24']);
});

test('all clock-based sections and planned tasks are ordered even when Daily headings already exist out of order',()=>{
  const md='## 19-24\n- [ ] 夜の既存タスク 【20:00-20:05 / 5m】\n## 7-9\n- [ ] 朝の既存タスク 【08:00-08:05 / 5m】\n## 9-19\n- [ ] 昼の既存タスク\n';
  const out=DI.mergeGeneratedIntoMarkdown(md,[
    {title:'夜のRepeat',estimate:5,completed:false,master_id:'m3',repeat_id:'r3',section:'19-24',planned_at:'19:00'},
    {title:'朝のRepeat',estimate:5,completed:false,master_id:'m1',repeat_id:'r1',section:'7-9',planned_at:'07:00'},
  ]);
  const sections=[...out.matchAll(/^## (.+)$/gm)].map(match=>match[1]);
  assert.deepEqual(sections,['7-9','9-19','19-24']);
  assert.ok(out.indexOf('朝のRepeat')<out.indexOf('朝の既存タスク'));
  assert.ok(out.indexOf('夜のRepeat')<out.indexOf('夜の既存タスク'));
  assert.ok(out.indexOf('昼の既存タスク')<out.indexOf('夜の既存タスク'));
});


test('all clock-based sections and planned tasks are ordered even when Daily headings already exist out of order',()=>{
  const md='## 19-24\n- [ ] 夜の既存タスク 【20:00-20:05 / 5m】\n## 7-9\n- [ ] 朝の既存タスク 【08:00-08:05 / 5m】\n## 9-19\n- [ ] 昼の既存タスク\n';
  const out=DI.mergeGeneratedIntoMarkdown(md,[
    {title:'夜のRepeat',estimate:5,completed:false,master_id:'m3',repeat_id:'r3',section:'19-24',planned_at:'19:00'},
    {title:'朝のRepeat',estimate:5,completed:false,master_id:'m1',repeat_id:'r1',section:'7-9',planned_at:'07:00'},
  ]);
  const sections=[...out.matchAll(/^## (.+)$/gm)].map(match=>match[1]);
  assert.deepEqual(sections,['7-9','9-19','19-24']);
  assert.ok(out.indexOf('朝のRepeat')<out.indexOf('朝の既存タスク'));
  assert.ok(out.indexOf('夜のRepeat')<out.indexOf('夜の既存タスク'));
  assert.ok(out.indexOf('昼の既存タスク')<out.indexOf('夜の既存タスク'));
});

test('existingInstances infers Master from a legacy Daily line without metadata',()=>{
  const masters=[{id:'task_brush',title:'🪥歯を磨く',aliases:[],status:'active',estimate:5}];
  const md='## 21-24\n- [x] 🪥歯を磨く (5m) 【22:01-22:03 / 2m】\n';
  assert.deepEqual(DI.existingInstances(md,masters),[{master_id:'task_brush'}]);
});

test('legacy same-Master line prevents one duplicate Repeat while allowing another',()=>{
  const masters=[{id:'m',title:'みんちゃれ',aliases:[],status:'active',estimate:5}];
  const repeats=[
    {id:'r_am',master_id:'m',status:'active',rule:'daily',section:'7-9',planned_at:'08:00'},
    {id:'r_pm',master_id:'m',status:'active',rule:'daily',section:'21-24',planned_at:'21:00'}
  ];
  const existing=DI.existingInstances('- [x] みんちゃれ (5m)',masters);
  const generated=TL.generateDailyInstances('2026-09-18',masters,repeats,existing);
  assert.equal(generated.length,1);
  assert.equal(generated[0].repeat_id,'r_pm');
});
