/* node --test workbench/adaptive-layout.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');

test('Workbench loads responsive styles and device-local UI setting', () => {
  const html = read('index.html');
  assert.match(html, /adaptive-layout\.css\?v=/);
  assert.match(html, /adaptive-layout\.js\?v=/);
  for (const id of ['uiSizeRange','uiSizeOutput','uiSizeReset']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
});

test('short and narrow viewports have their own compact layouts', () => {
  const css = read('adaptive-layout.css');
  assert.match(css, /max-width:720px/);
  assert.match(css, /max-height:700px/);
  assert.match(css, /max-height:520px/);
  assert.match(css, /min-width:721px/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-height:44px/);
  assert.doesNotMatch(css, /transform:\s*scale\(/);
});

test('slider saves only UI size locally, preserving app routing', () => {
  const js = read('adaptive-layout.js');
  assert.match(js, /cockpid\.workbench\.ui-size\.v1/);
  assert.match(js, /localStorage\.setItem\(KEY/);
  assert.match(js, /localStorage\.getItem\(KEY/);
  assert.doesNotMatch(js, /github_pat_|fetch\(|location\.reload\(/);
});
