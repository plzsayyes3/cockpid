const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const memoInbox = fs.readFileSync(path.join(root, 'memo-inbox.js'), 'utf8');
const workbench = fs.readFileSync(path.join(root, 'workbench.js'), 'utf8');
const zenMemo = fs.readFileSync(path.join(root, '..', 'zen-memo.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('memo-inbox renders and records all Area destination branches', () => {
  assert.match(index, /memo-route-model\.js/);
  assert.match(memoInbox, /COCKPID_MEMO_ROUTE/);
  assert.match(memoInbox, /data-memo-branch/);
  assert.match(memoInbox, /Project/);
  assert.match(memoInbox, /Assignment/);
  assert.match(memoInbox, /Reference/);
  assert.match(memoInbox, /Principle/);
});
test('memo route metadata is recorded only after existing Inbox writes succeed', () => {
  assert.match(workbench, /content: encodeUtf8\(`\$\{text\}\\n`\)/);
  assert.match(workbench, /COCKPID_MEMO_ROUTE\?\.recordMemo\(name\)/);
  assert.match(zenMemo, /content: encodeUtf8\(`\$\{text\}\\n`\)/);
  assert.match(zenMemo, /COCKPID_MEMO_ROUTE\?\.recordMemo\(name\)/);
});
