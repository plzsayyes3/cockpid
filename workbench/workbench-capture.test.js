/* Run with: node --test workbench/workbench-capture.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'workbench.js'), 'utf8');

function element(value = '') {
  return {
    value,
    textContent: '',
    innerHTML: '',
    disabled: false,
    listeners: {},
    classList: { toggle() {} },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    focus() {}
  };
}

function boot(fetchImpl, options = {}) {
  const nodes = new Map(
    ['captureText', 'captureBtn', 'todayList', 'todayDate', 'todayTime', 'todayDateBtn']
      .map(id => [id, element(id === 'captureText' ? 'hello' : '')])
  );
  nodes.get('captureBtn').textContent = 'SAVE';
  const hint = element();
  const savedMemoNames = [];
  const context = {
    document: {
      getElementById: id => nodes.get(id),
      querySelector: () => hint
    },
    window: {
      COCKPID_SOURCES: { get: () => ({ repo: 'mynotebook', dir: '00_inbox' }) },
      COCKPID_MEMO_ROUTE: { recordMemo: name => savedMemoNames.push(name) },
      COCKPID_RESIDENT: { working() {}, complete() {}, error() {} },
      addEventListener() {}
    },
    OWNER: 'plzsayyes3',
    token: () => 'test-token',
    gh: async () => null, // the unrelated Calendar uses the shared GitHub helper
    decode: () => '',
    esc: String,
    fetch: fetchImpl,
    btoa: binary => Buffer.from(binary, 'binary').toString('base64'),
    unescape,
    AbortController,
    setInterval() {},
    setTimeout(callback, milliseconds) {
      if (options.expireWrite && milliseconds === 20000) queueMicrotask(callback);
      return 1;
    },
    clearTimeout() {},
    console: { error() {}, warn() {} }
  };
  vm.runInNewContext(source, context, { filename: 'workbench.js' });
  return {
    input: nodes.get('captureText'),
    button: nodes.get('captureBtn'),
    hint,
    savedMemoNames,
    save: () => nodes.get('captureBtn').listeners.click()
  };
}

test('successful save clears input only after a GitHub success', async () => {
  let writes = 0;
  const app = boot(async (_url, options) => {
    if (options.method === 'PUT') {
      writes += 1;
      return { ok: true, status: 201 };
    }
    return { ok: false, status: 404 };
  });
  await app.save();
  assert.equal(writes, 1);
  assert.equal(app.input.value, '');
  assert.equal(app.button.disabled, false);
  assert.equal(app.savedMemoNames.length, 1);
});

test('unknown write outcome preserves text and retries with the original path', async () => {
  const paths = [];
  const app = boot(async (url, options) => {
    if (options.method === 'PUT') {
      paths.push(url);
      if (paths.length === 1) throw Error('connection lost');
      return { ok: true, status: 201 };
    }
    return { ok: false, status: 404 };
  });
  await app.save();
  assert.equal(app.input.value, 'hello');
  assert.match(app.hint.textContent, /確認できません/);
  await app.save();
  assert.equal(paths.length, 2);
  assert.equal(paths[0], paths[1]);
  assert.equal(app.input.value, '');
});

test('confirmed remote content after a lost response counts as success', async () => {
  let writes = 0;
  const app = boot(async (_url, options) => {
    if (options.method === 'PUT') {
      writes += 1;
      throw Error('response lost');
    }
    return {
      ok: true, status: 200,
      json: async () => ({ content: Buffer.from('hello\\n').toString('base64') })
    };
  });
  await app.save();
  assert.equal(writes, 1);
  assert.equal(app.input.value, '');
  assert.equal(app.savedMemoNames.length, 1);
});

test('a shortcut or second click cannot submit concurrently; new edits survive', async () => {
  let finish;
  const request = new Promise(resolve => { finish = resolve; });
  let writes = 0;
  const app = boot(async (_url, options) => {
    if (options.method === 'PUT') {
      writes += 1;
      return request;
    }
    return { ok: false, status: 404 };
  });
  const first = app.save();
  const second = app.save();
  app.input.value = 'hello edited while sending';
  finish({ ok: true, status: 201 });
  await Promise.all([first, second]);
  assert.equal(writes, 1);
  assert.equal(app.input.value, 'hello edited while sending');
});

test('a request that never responds times out without clearing the draft', async () => {
  let writes = 0;
  const app = boot(async (_url, options) => {
    if (options.method === 'PUT') {
      writes += 1;
      return new Promise(() => {});
    }
    return { ok: false, status: 404 };
  }, { expireWrite: true });
  await app.save();
  assert.equal(writes, 1);
  assert.equal(app.input.value, 'hello');
  assert.equal(app.button.disabled, false);
  assert.match(app.hint.textContent, /通信タイムアウト/);
});
