const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FILES,
  buildDictionaryView,
  encodeUtf8Base64,
  createPutPayload,
  escapeHtml
} = require('./dictionary-model.js');

test('dictionary view keeps manual text editable and auto text read-only', () => {
  const view = buildDictionaryView({
    manual: { content: 'Obsidian\n', sha: 'manual-sha' },
    auto: { content: 'オブシリアン\n', sha: 'auto-sha' }
  });

  assert.equal(view.manual.path, FILES.manual.path);
  assert.equal(view.manual.editable, true);
  assert.equal(view.manual.content, 'Obsidian\n');
  assert.equal(view.auto.path, FILES.auto.path);
  assert.equal(view.auto.editable, false);
  assert.equal(view.auto.content, 'オブシリアン\n');
});

test('dictionary save payload preserves the current manual-file SHA', () => {
  const payload = createPutPayload('Obsidian\n日本語', 'sha-from-read');

  assert.deepEqual(payload, {
    message: 'cockpid: update transcription dictionary',
    branch: 'main',
    content: encodeUtf8Base64('Obsidian\n日本語'),
    sha: 'sha-from-read'
  });
});

test('dictionary save payload omits SHA when creating a missing manual file', () => {
  const payload = createPutPayload('Obsidian\n', null);

  assert.equal(payload.sha, undefined);
  assert.equal(payload.content, encodeUtf8Base64('Obsidian\n'));
});

test('dictionary content is escaped before rendering', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});
