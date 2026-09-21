const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const refinementCss = fs.readFileSync(path.join(root, 'home-refinement.css'), 'utf8');
const homeCss = fs.readFileSync(path.join(root, 'home-final.css'), 'utf8');

test('top input surface exposes a readable label, save action, and guidance', () => {
  assert.match(index, /id="captureHeading"/);
  assert.match(index, /textarea id="captureText"[^>]+aria-labelledby="captureHeading"/);
  assert.match(index, /button class="action-btn" id="captureBtn"[^>]+aria-label="メモを保存"/);
  assert.match(index, /class="capture-help"/);
});

test('top status controls use a labeled toolbar and comfortable hit areas', () => {
  assert.match(index, /class="system-status" role="toolbar" aria-label="作業台ステータス"/);
  assert.match(refinementCss, /\.status-icon\{[^}]*min-width:32px[^}]*min-height:32px/);
  assert.match(refinementCss, /\.status-board\{[^}]*min-width:32px[^}]*min-height:32px/);
});

test('top data state is announced and the dock leaves breathing room', () => {
  assert.match(index, /id="movementDate"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(refinementCss, /\.shell\{padding-bottom:132px\}/);
  assert.match(refinementCss, /\.dock\{[^}]*grid-template-rows:repeat\(2,40px\)/);
});
