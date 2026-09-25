const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const routing = fs.readFileSync(path.join(__dirname, 'app-routing.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('keys 5-9 follow Dictionary / Area / Backstage / On Hand / Thinking', () => {
  assert.match(routing, /dictionary:\s*\{ key: '5', title: '5 \/ DICTIONARY'/);
  assert.match(routing, /projecttown:\s*\{ key: '6', title: '6 \/ AREA'/);
  assert.match(routing, /backstage:\s*\{ key: '7', title: '7 \/ BACKSTAGE'/);
  assert.match(routing, /onhand:\s*\{ key: '8', title: '8 \/ ON HAND'/);
  assert.match(routing, /thinking:\s*\{ key: '9', title: '9 \/ THINKING'/);
  assert.match(routing, /\['5', 'dictionary', 'Dictionary'\]/);
  assert.match(routing, /\['6', 'projecttown', 'Area'\]/);
  assert.match(routing, /\['7', 'backstage', 'Backstage'\]/);
  assert.match(routing, /\['8', 'onhand', 'On Hand'\]/);
  assert.match(routing, /\['9', 'thinking', 'Thinking'\]/);
  assert.match(index, /data-app="dictionary"><b>5<\/b><span>Dictionary<\/span>/);
  assert.match(index, /data-app="projecttown"><b>6<\/b><span>Area<\/span>/);
  assert.match(index, /data-app="backstage"><b>7<\/b><span>Backstage<\/span>/);
  assert.match(index, /data-app="onhand"><b>8<\/b><span>On Hand<\/span>/);
  assert.match(index, /data-app="thinking"><b>9<\/b><span>Thinking<\/span>/);
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

test('key 0 opens For My Sons', () => {
  assert.match(routing, /formysons:\s*\{ key: '0', title: '0 \/ FOR MY SONS', type: 'iframe', src: 'https:\/\/plzsayyes3\.github\.io\/for_my_sons\/'/);
  assert.match(index, /data-app="formysons"><b>0<\/b><span>For My Sons<\/span>/);
  assert.doesNotMatch(routing, /secret/);
});

test('Area Town surface remains available', () => {
  assert.equal(fs.existsSync(path.join(root, 'workbench', 'project-town.html')), true);
});
