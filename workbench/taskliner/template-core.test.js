const test = require('node:test');
const assert = require('node:assert/strict');
const TL = require('./template-core.js');

const masters = [
  { id: 'task_brush', title: '歯を磨く', aliases: ['🪥歯を磨く', '夜に歯を磨く'], status: 'active', estimate: 5 },
  { id: 'task_toilet', title: 'トイレ', aliases: [], status: 'active', estimate: 5 },
  { id: 'task_english', title: '英語', aliases: ['🐤英語'], status: 'active', estimate: 5 },
];

test('exact title or alias resolves to the same master', () => {
  assert.equal(TL.findExactMaster('歯を磨く', masters).id, 'task_brush');
  assert.equal(TL.findExactMaster('🪥歯を磨く', masters).id, 'task_brush');
});

test('suggestions update from a one-character query', () => {
  const result = TL.suggestMasters('歯', masters);
  assert.equal(result[0].id, 'task_brush');
});

test('daily, weekday set, weekly, biweekly, nth weekday, and month-end rules work', () => {
  assert.equal(TL.isRepeatDue({ rule: 'daily' }, '2026-09-17'), true);
  assert.equal(TL.isRepeatDue({ rule: 'weekdays', weekdays: [1, 4] }, '2026-09-17'), true);
  assert.equal(TL.isRepeatDue({ rule: 'weekly', weekday: 4 }, '2026-09-17'), true);
  assert.equal(TL.isRepeatDue({ rule: 'biweekly', weekday: 4, anchor_date: '2026-09-03' }, '2026-09-17'), true);
  assert.equal(TL.isRepeatDue({ rule: 'biweekly', weekday: 4, anchor_date: '2026-09-10' }, '2026-09-17'), false);
  assert.equal(TL.isRepeatDue({ rule: 'nth_weekday', nth: 3, weekday: 4 }, '2026-09-17'), true);
  assert.equal(TL.isRepeatDue({ rule: 'month_end' }, '2026-09-30'), true);
  assert.equal(TL.isRepeatDue({ rule: 'month_end' }, '2026-09-29'), false);
});

test('repeat schedule identity ignores estimate but preserves distinct schedule slots', () => {
  const base={master_id:'task_brush',rule:'weekdays',weekdays:[5,1,3,1],section:'7-9',planned_at:'07:15',estimate:5};
  const same={...base,weekdays:[1,3,5],estimate:30};
  const later={...base,planned_at:'21:30'};
  const otherSection={...base,section:'21-24'};
  assert.equal(TL.repeatScheduleKey(base),TL.repeatScheduleKey(same));
  assert.notEqual(TL.repeatScheduleKey(base),TL.repeatScheduleKey(later));
  assert.notEqual(TL.repeatScheduleKey(base),TL.repeatScheduleKey(otherSection));
});

test('repeat schedule identity includes rule-specific fields', () => {
  assert.notEqual(
    TL.repeatScheduleKey({master_id:'task_brush',rule:'weekly',weekday:1,section:'',planned_at:''}),
    TL.repeatScheduleKey({master_id:'task_brush',rule:'weekly',weekday:2,section:'',planned_at:''})
  );
  assert.notEqual(
    TL.repeatScheduleKey({master_id:'task_brush',rule:'biweekly',anchor_date:'2026-09-30',section:'',planned_at:''}),
    TL.repeatScheduleKey({master_id:'task_brush',rule:'biweekly',anchor_date:'2026-10-07',section:'',planned_at:''})
  );
});

test('one master can generate multiple instances in one day through different repeats', () => {
  const repeats = [
    { id: 'repeat_brush_am', master_id: 'task_brush', status: 'active', rule: 'daily', section: '7-9', planned_at: '07:15' },
    { id: 'repeat_brush_pm', master_id: 'task_brush', status: 'active', rule: 'daily', section: '21-24', planned_at: '21:30' },
  ];
  const instances = TL.generateDailyInstances('2026-09-17', masters, repeats, []);
  assert.deepEqual(instances.map(x => x.repeat_id), ['repeat_brush_am', 'repeat_brush_pm']);
  assert.deepEqual(instances.map(x => x.section), ['7-9', '21-24']);
});

test('generation is idempotent while an instance exists, but deletion allows regeneration', () => {
  const repeats = [
    { id: 'repeat_brush_am', master_id: 'task_brush', status: 'active', rule: 'daily', section: '7-9', planned_at: '07:15' },
  ];
  const first = TL.generateDailyInstances('2026-09-17', masters, repeats, []);
  assert.equal(first.length, 1);
  const second = TL.generateDailyInstances('2026-09-17', masters, repeats, first);
  assert.equal(second.length, 0);
  const afterDelete = TL.generateDailyInstances('2026-09-17', masters, repeats, []);
  assert.equal(afterDelete.length, 1);
});

test('repeat estimate overrides master estimate and daily instance is a snapshot', () => {
  const repeats = [
    { id: 'repeat_brush_pm', master_id: 'task_brush', status: 'active', rule: 'daily', section: '21-24', planned_at: '21:30', estimate: 10 },
  ];
  const [instance] = TL.generateDailyInstances('2026-09-17', masters, repeats, []);
  assert.equal(instance.title, '歯を磨く');
  assert.equal(instance.estimate, 10);
  assert.equal(instance.master_id, 'task_brush');
  assert.equal(instance.planned_at, '21:30');
});

test('hidden metadata round-trips without changing visible task text', () => {
  const instance = {
    title: '歯を磨く', estimate: 5, completed: false,
    master_id: 'task_brush', repeat_id: 'repeat_brush_am', planned_at: '07:15'
  };
  const line = TL.renderInstanceMarkdown(instance);
  assert.match(line, /^- \[ \] 歯を磨く \(5m\)/);
  const meta = TL.parseHiddenMetadata(line);
  assert.deepEqual(meta, { master_id: 'task_brush', repeat_id: 'repeat_brush_am', planned_at: '07:15' });
});

test('master and repeat markdown serialize and parse', () => {
  const master = { id:'task_brush', title:'歯を磨く', aliases:['🪥歯を磨く','夜に歯を磨く'], status:'active', estimate:5 };
  const parsedMaster = TL.parseMasterMarkdown(TL.serializeMaster(master));
  assert.deepEqual(parsedMaster, master);
  const repeat = { id:'repeat_brush_am', master_id:'task_brush', status:'active', rule:'weekdays', weekdays:[1,2,3,4,5], weekday:'', nth:'', anchor_date:'', section:'7-9', planned_at:'07:15', estimate:'' };
  const parsedRepeat = TL.parseRepeatMarkdown(TL.serializeRepeat(repeat));
  assert.equal(parsedRepeat.id, repeat.id);
  assert.equal(parsedRepeat.master_id, repeat.master_id);
  assert.deepEqual(parsedRepeat.weekdays, repeat.weekdays);
  assert.equal(parsedRepeat.section, '7-9');
  assert.equal(parsedRepeat.planned_at, '07:15');
});


test('displayTitle hides Markdown-link destinations and WikiLink markup',()=>{
  assert.equal(TL.displayTitle('[昨日をAIに振り返ってもらう](shortcuts://run-shortcut?name=test)'),'昨日をAIに振り返ってもらう');
  assert.equal(TL.displayTitle('🐤[英語](shortcuts://run-shortcut?name=English)'),'🐤英語');
  assert.equal(TL.displayTitle('🧭[[2026-01-10 ミッションステートメント|ミッション]]をみる'),'🧭ミッションをみる');
  assert.equal(TL.displayTitle('[[folder/note#見出し]]'),'note');
});

test('displayTitle keeps canonical title data untouched',()=>{
  const raw='✏️[今日のメモを開く](shortcuts://run-shortcut?name=obsidian)';
  TL.displayTitle(raw);
  assert.equal(raw,'✏️[今日のメモを開く](shortcuts://run-shortcut?name=obsidian)');
});


test('mergeMasterRecords keeps selected target and absorbs title and aliases',()=>{
  const target={id:'task_a',title:'仕事時間',aliases:['勤務'],status:'active',estimate:250};
  const absorbed={id:'task_b',title:'💻仕事時間',aliases:['勤務','Work time'],status:'active',estimate:0};
  const merged=TL.mergeMasterRecords(target,absorbed);
  assert.equal(merged.id,'task_a');
  assert.equal(merged.title,'仕事時間');
  assert.equal(merged.estimate,250);
  assert.deepEqual(merged.aliases,['勤務','💻仕事時間','Work time']);
  assert.equal(merged.status,'active');
});
