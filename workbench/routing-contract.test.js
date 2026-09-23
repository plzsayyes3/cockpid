const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const routing = fs.readFileSync(path.join(__dirname, 'app-routing.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('key 6 is the Area route backed by the Area-first Backstage', () => {
  assert.match(routing, /backstage:\s*\{ key: '6', title: '6 \/ AREA'/);
  assert.match(routing, /\['6', 'backstage', 'Area'\]/);
  assert.match(index, /data-app="backstage"><b>6<\/b><span>Area<\/span>/);
  assert.doesNotMatch(routing, /\['7', /);
});

test('header microphone opens the existing Stan surface', () => {
  assert.match(index, /class="status-icon status-mic" data-app="stan"/);
  assert.match(index, /aria-label="Stan \/ 音声入力"/);
  assert.match(routing, /stan:\s*\{ key: null, title: 'STAN', type: 'page', src: 'stan\/'/);
});

test('header keyboard icon opens Keyboard practice outside the numeric dock', () => {
  assert.match(routing, /keyboard:\s*\{ key: null, title: 'KEYBOARD', type: 'iframe', src: 'https:\/\/plzsayyes3\.github\.io\/Keyboard\//);
  assert.doesNotMatch(routing, /\['\d', 'keyboard'/);
  assert.match(index, /class="status-icon status-keyboard" data-app="keyboard"/);
  assert.doesNotMatch(index, /class="app-btn" data-app="keyboard"/);
});

test('key 9 is the Dictionary route', () => {
  assert.match(routing, /dictionary:\s*\{ key: '9', title: '9 \/ DICTIONARY', type: 'dictionary'/);
  assert.match(routing, /\['9', 'dictionary', 'Dictionary'\]/);
  assert.match(index, /data-app="dictionary"><b>9<\/b><span>Dictionary<\/span>/);
});

test('key 0 opens For My Sons', () => {
  assert.match(routing, /formysons:\s*\{ key: '0', title: '0 \/ FOR MY SONS', type: 'iframe', src: 'https:\/\/plzsayyes3\.github\.io\/for_my_sons\/'/);
  assert.match(index, /data-app="formysons"><b>0<\/b><span>For My Sons<\/span>/);
  assert.doesNotMatch(routing, /secret/);
});

test('key 8 is the canonical Thinking route', () => {
  assert.match(routing, /\['8', 'thinking', 'Thinking'\]/);
  assert.match(routing, /thinking:\s*\{ key: '8', title: '8 \/ THINKING'/);
});

test('standalone Project Town remains available', () => {
  assert.equal(fs.existsSync(path.join(root, 'workbench', 'project-town.html')), true);
});
