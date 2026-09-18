const test = require('node:test');
const assert = require('node:assert/strict');

const Status = require('./project-status-model.js');

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

test('explicit activity wins over inferred activity', () => {
  assert.equal(Status.activity({ activity: 'review', current: '作業中' }).key, 'review');
});

test('activity inference distinguishes research, review, external wait, and pause', () => {
  const recent = { last_touched: todayKey() };
  assert.equal(Status.activity({ ...recent, current: '調査して比較する' }).key, 'researching');
  assert.equal(Status.activity({ ...recent, current: '完成したので確認お願いします' }).key, 'review');
  assert.equal(Status.activity({ ...recent, next: '返信待ち' }).key, 'external_wait');
  assert.equal(Status.activity({ last_touched: '2020-01-01' }).key, 'paused');
});

test('momentum and motivation use the selected project fields', () => {
  const project = { last_touched: todayKey(), desk: true, commitment: 'must' };
  assert.deepEqual(Status.momentum(project), { key: 'surging', label: '急上昇', mark: '↑↑', speed: 1.42 });
  assert.equal(Status.motivation(project), 3);
});

test('decision and detail messages reflect the project turn', () => {
  const project = { activity: 'review', decision: '公開前に確認する' };
  const current = Status.activity(project);
  assert.equal(Status.decisionText(project, current), '公開前に確認する');
  assert.match(Status.detailMessage(current), /あなたのターン/);
});

test('source path follows the configured project source', () => {
  assert.equal(
    Status.projectSourcePath({ id: 'demo', path: 'projects/demo.md' }, { mode: 'view' }),
    'my-storage-note/objects/projects/demo.md'
  );
  assert.equal(
    Status.projectSourcePath({ id: 'demo', path: 'projects/demo.md' }, { repo: 'gpts', dir: 'projects' }),
    'gpts/projects/demo.md'
  );
});
