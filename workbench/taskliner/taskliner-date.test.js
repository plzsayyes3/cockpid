const test = require('node:test');
const assert = require('node:assert/strict');
const DateFlow = require('./taskliner-date.js');

test('accepts only real calendar dates and shifts across month and year boundaries', () => {
  assert.equal(DateFlow.isValidDate('2024-02-29'), true);
  assert.equal(DateFlow.isValidDate('2026-02-29'), false);
  assert.equal(DateFlow.isValidDate('2026-02-31'), false);
  assert.equal(DateFlow.shiftDate('2026-09-01', -1), '2026-08-31');
  assert.equal(DateFlow.shiftDate('2026-12-31', 1), '2027-01-01');
});

test('queues rapid date navigation relative to the pending destination', () => {
  let currentDate = '2026-09-28';
  const sent = [];
  const navigation = DateFlow.createNavigationQueue(() => currentDate, target => {
    sent.push(target);
    return true;
  });

  assert.equal(navigation.request('2026-09-29'), true);
  assert.equal(navigation.request(DateFlow.shiftDate(navigation.targetDate(), 1)), true);
  assert.deepEqual(sent, ['2026-09-29']);

  assert.equal(navigation.acknowledge('2026-09-29', () => { currentDate = '2026-09-29'; }), true);
  assert.equal(currentDate, '2026-09-29');
  assert.deepEqual(sent, ['2026-09-29', '2026-09-30']);
});

test('ignores a navigation acknowledgement that does not match the in-flight request', () => {
  const sent = [];
  let committed = false;
  const navigation = DateFlow.createNavigationQueue(() => '2026-09-28', target => {
    sent.push(target);
    return true;
  });
  navigation.request('2026-09-29');
  assert.equal(navigation.acknowledge('2026-09-30', () => { committed = true; }), false);
  assert.equal(committed, false);
  assert.deepEqual(sent, ['2026-09-29']);
});

test('releases a failed navigation and discards its queued destination', () => {
  const sent = [];
  const navigation = DateFlow.createNavigationQueue(() => '2026-09-28', target => {
    sent.push(target);
    return true;
  });
  navigation.request('2026-09-29');
  navigation.request('2026-09-30');
  assert.equal(navigation.cancel('2026-09-29'), true);
  assert.equal(navigation.targetDate(), '2026-09-28');
  assert.equal(navigation.acknowledge('2026-09-29'), false);
  assert.equal(navigation.request('2026-09-27'), true);
  assert.deepEqual(sent, ['2026-09-29', '2026-09-27']);
});

test('rejects impossible navigation targets without sending a request', () => {
  const sent = [];
  const navigation = DateFlow.createNavigationQueue(() => '2026-09-28', target => sent.push(target));
  assert.equal(navigation.request('2026-02-31'), false);
  assert.deepEqual(sent, []);
});

test('discards a remote date load that resolves after the active date changed', async () => {
  let currentDate = '2026-09-27';
  let resolveLoad;
  let applied = null;
  const load = DateFlow.loadForDate('2026-09-27', {
    currentDate: () => currentDate,
    load: () => new Promise(resolve => { resolveLoad = resolve; }),
    apply: value => { applied = value; }
  });

  currentDate = '2026-09-28';
  resolveLoad('stale note');
  assert.equal(await load, false);
  assert.equal(applied, null);
});

test('applies a remote date load while its requested date is still active', async () => {
  let applied = null;
  const result = await DateFlow.loadForDate('2026-09-28', {
    currentDate: () => '2026-09-28',
    load: async () => 'today note',
    apply: value => { applied = value; }
  });
  assert.equal(result, true);
  assert.equal(applied, 'today note');
});
