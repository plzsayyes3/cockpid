import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarWeekday, makeRepeat, findDuplicateRepeat} from './repeat-creator.mjs';
const make = (input = {}) => makeRepeat({rule:'daily',...input}, 'task_a', 'repeat_new');
test('calendar weekdays are UTC stable and invalid dates fail', () => {
  assert.equal(calendarWeekday('2026-11-22'), 0);
  assert.equal(calendarWeekday('2026-02-30'), null);
});
test('valid daily, weekdays, weekly, nth, biweekly and month-end schedules', () => {
  assert.equal(make().rule, 'daily');
  assert.deepEqual(make({rule:'weekdays', weekdays:'5,1,3,1'}).weekdays, [1,3,5]);
  assert.equal(make({rule:'weekly', weekday:'0'}).weekday, 0);
  assert.equal(make({rule:'nth_weekday', weekday:'2', nth:'4'}).nth, 4);
  assert.equal(make({rule:'biweekly', anchorDate:'2026-11-22'}).weekday, 0);
  assert.equal(make({rule:'month_end'}).rule, 'month_end');
});
test('invalid schedules cannot be saved', () => {
  assert.throws(()=>make({rule:'weekdays',weekdays:'1,,5'}), /曜日/);
  assert.throws(()=>make({rule:'weekly',weekday:'9'}), /曜日/);
  assert.throws(()=>make({rule:'biweekly',anchorDate:'2026-02-30'}), /基準日/);
  assert.throws(()=>make({rule:'nth_weekday',weekday:'1',nth:'0'}), /第何週/);
  assert.throws(()=>make({estimate:'-2'}), /見積もり/);
});
test('duplicate active schedules are rejected, inactive are ignored', () => {
  const candidate=make();
  const key=x=>JSON.stringify([x.master_id,x.rule,x.section,x.planned_at]);
  assert.equal(findDuplicateRepeat(candidate,[{...candidate,id:'old'}],key)?.id,'old');
  assert.equal(findDuplicateRepeat(candidate,[{...candidate,id:'old',status:'inactive'}],key),null);
});