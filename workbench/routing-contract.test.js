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

test('key 8 is not injected into the runtime dock', () => {
  assert.doesNotMatch(routing, /\['8', 'projecttown'/);
});

test('standalone Project Town remains available', () => {
  assert.equal(fs.existsSync(path.join(root, 'workbench', 'project-town.html')), true);
});
