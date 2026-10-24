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

test('UI size change, persistence, reset, and text-entry behavior work', () => {
  const { runInNewContext } = require('node:vm');
  const callbacks = {};
  const props = {};
  const values = {};
  const makeControl = () => ({
    value: '100',
    events: {},
    addEventListener(type, handler) { this.events[type] = handler; }
  });
  const slider = makeControl();
  const reset = makeControl();
  const output = { textContent: '' };
  const document = {
    documentElement: { style: { setProperty(name, value) { props[name] = value; } } },
    body: { classList: {
      add(name) { values.activeClass = name; },
      remove() { values.activeClass = ''; }
    } },
    getElementById(id) {
      return { uiSizeRange: slider, uiSizeReset: reset, uiSizeOutput: output }[id];
    },
    addEventListener(name, handler) { callbacks[name] = handler; }
  };
  const window = { addEventListener(name, handler) { callbacks['window-' + name] = handler; } };
  const localStorage = {
    getItem(key) { return values[key] ?? null; },
    setItem(key, value) { values[key] = value; }
  };
  class HTMLElement {
    constructor(tag) { this.tag = tag; }
    matches(selector) {
      return this.tag === 'textarea' ? selector.startsWith('textarea') : selector === 'input' && this.tag === 'input';
    }
  }
  runInNewContext(read('adaptive-layout.js'), { document, window, localStorage, HTMLElement });
  assert.equal(output.textContent, '100%');
  slider.value = '85';
  slider.events.input();
  assert.equal(props['--wb-capture-adjust'], '-24px');
  slider.events.change();
  assert.equal(values['cockpid.workbench.ui-size.v1'], '85');
  reset.events.click();
  assert.equal(slider.value, '100');
  assert.equal(values['cockpid.workbench.ui-size.v1'], '100');
  callbacks.focusin({ target: new HTMLElement('textarea') });
  assert.equal(values.activeClass, 'wb-text-entry');
  callbacks.focusout();
  assert.equal(values.activeClass, '');
  values['cockpid.workbench.ui-size.v1'] = '110';
  callbacks['window-storage']({ key: 'cockpid.workbench.ui-size.v1' });
  assert.equal(output.textContent, '110%');
});
