const test = require('node:test');
const assert = require('node:assert/strict');

const StatusView = require('./project-status-view.js');

test('town status view is built from the selected Project record', () => {
  const project = {
    id: 'cockpid',
    title: 'COCKPID',
    current: 'BackstageとProject Townを統合する',
    next: '詳細画面を確認する',
    activity: 'review',
    decision: 'この方向で進める'
  };
  const html = StatusView.renderTownStatus(project, {
    activity: () => ({ key: 'review', label: '見てもらい待ち' }),
    momentum: () => ({ key: 'rising', label: '上昇', mark: '↑' }),
    motivation: () => 3,
    decisionText: () => 'この方向で進める',
    detailMessage: () => 'あなたのターンです。'
  });

  assert.match(html, /data-project-id="cockpid"/);
  assert.match(html, /見てもらい待ち/);
  assert.match(html, /上昇/);
  assert.match(html, /この方向で進める/);
  assert.match(html, /あなたのターンです/);
});
