const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const routing = fs.readFileSync(path.join(__dirname, 'app-routing.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('key 7 is the canonical Projects route', () => {
  assert.match(routing, /backstage:\s*\{ key: '7', title: '7 \/ PROJECTS'/);
  assert.match(routing, /\['7', 'backstage', 'Projects'\]/);
  assert.match(index, /data-app="backstage"><b>7<\/b><span>Projects<\/span>/);
});

test('header microphone opens the existing Stan surface', () => {
  assert.match(index, /class="status-icon status-mic" data-app="stan"/);
  assert.match(index, /aria-label="Stan \/ 音声入力"/);
  assert.match(routing, /stan:\s*\{ key: null, title: 'STAN', type: 'page', src: 'stan\/'/);
});

test('key 9 opens the Keyboard surface with the Naginata tool link', () => {
  assert.match(routing, /keyboard:\s*\{ key: '9', title: '9 \/ KEYBOARD', type: 'page', src: 'keyboard\.html'/);
  assert.match(routing, /\['9', 'keyboard', 'Keyboard'\]/);
  assert.match(index, /data-app="keyboard"><b>9<\/b><span>Keyboard<\/span>/);
  assert.match(fs.readFileSync(path.join(__dirname, 'keyboard.html'), 'utf8'), /https:\/\/github\.com\/eswai\/Benkei2/);
});

test('key 8 is the canonical Thinking route', () => {
  assert.match(routing, /\['8', 'thinking', 'Thinking'\]/);
  assert.match(routing, /thinking:\s*\{ key: '8', title: '8 \/ THINKING'/);
});

test('standalone Project Town remains available', () => {
  assert.equal(fs.existsSync(path.join(root, 'workbench', 'project-town.html')), true);
});
