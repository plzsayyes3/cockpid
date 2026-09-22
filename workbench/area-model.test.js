const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const AreaModel = require('./area-model.js');
const adapterSource = fs.readFileSync(require.resolve('./area-source-adapter.js'), 'utf8');

function encoded(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function adapterContext(fetchImpl, projectSource = null) {
  const context = {
    window: { fetch: fetchImpl },
    atob,
    btoa,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Date,
  };
  if (projectSource) context.window.COCKPID_PROJECT_VIEW = projectSource;
  vm.runInNewContext(adapterSource, context);
  return context.window;
}

test('groups sibling records by Area and preserves unassigned records', () => {
  const grouped = AreaModel.groupItems({
    areas: [{ id: 'childcare', title: '保育園運営' }],
    unassigned: { projects: [{ id: 'p2' }], assignments: [], tasks: [] },
  });

  assert.equal(grouped[0].area.id, 'childcare');
  assert.deepEqual(grouped[0].projects, []);
  assert.deepEqual(AreaModel.unassigned({
    unassigned: { projects: [{ id: 'p2' }], assignments: [], tasks: [] }
  }), {
    projects: [{ id: 'p2' }], assignments: [], tasks: []
  });
});

test('preserves Area sibling collections without mutating the view', () => {
  const project = { id: 'p1', area_id: 'childcare' };
  const assignment = { id: 'a1', area_id: 'childcare' };
  const task = { id: 't1', area_id: 'childcare' };
  const view = {
    areas: [{ id: 'childcare', projects: [project], assignments: [assignment], tasks: [task] }],
    unassigned: { projects: [], assignments: [], tasks: [] },
  };

  assert.deepEqual(AreaModel.groupItems(view), [{
    area: view.areas[0], projects: [project], assignments: [assignment], tasks: [task]
  }]);
  assert.deepEqual(view.areas[0].projects, [project]);
});

test('decodes and caches a valid Area Contents response', async () => {
  const view = {
    areas: [{ id: 'childcare', projects: [], assignments: [], tasks: [] }],
    unassigned: { projects: [], assignments: [], tasks: [] },
  };
  let calls = 0;
  const adapter = adapterContext(async () => {
    calls += 1;
    return { ok: true, json: async () => ({ content: encoded(view) }) };
  });

  const first = adapter.COCKPID_AREA_VIEW.load();
  const second = adapter.COCKPID_AREA_VIEW.load();
  assert.strictEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(await first)), view);
  assert.equal(calls, 1);
});

test('rejects malformed Area views instead of normalizing them', async () => {
  const malformedViews = [
    { areas: [{ id: 'childcare', projects: [], assignments: [] }], unassigned: { projects: [], assignments: [], tasks: [] } },
    { areas: [{ id: '', projects: [], assignments: [], tasks: [] }], unassigned: { projects: [], assignments: [], tasks: [] } },
    { areas: [{ id: 'childcare', projects: [], assignments: [], tasks: [] }, { id: 'childcare', projects: [], assignments: [], tasks: [] }], unassigned: { projects: [], assignments: [], tasks: [] } },
    { areas: [{ id: 'childcare', projects: [null], assignments: [], tasks: [] }], unassigned: { projects: [], assignments: [], tasks: [] } },
    { areas: [{ id: 'childcare', projects: [], assignments: [], tasks: [] }], unassigned: { projects: [], assignments: [] } },
  ];

  for (const view of malformedViews) {
    const adapter = adapterContext(async () => ({ ok: true, json: async () => ({ content: encoded(view) }) }));
    await assert.rejects(adapter.COCKPID_AREA_VIEW.load(), /Area view/);
  }
});

test('returns a typed loaded Project result when Area loading fails', async () => {
  const projectView = { projects: [{ id: 'legacy-project' }] };
  let fallbackCalls = 0;
  const adapter = adapterContext(async () => ({ ok: false, status: 503 }), {
    load: async () => {
      fallbackCalls += 1;
      return projectView;
    }
  });

  const result = await adapter.COCKPID_AREA_VIEW.loadWithFallback();
  assert.equal(result.kind, 'project');
  assert.equal(result.fallback, true);
  assert.equal(result.source, null);
  assert.deepEqual(JSON.parse(JSON.stringify(result.view)), projectView);
  assert.equal(result.error.name, 'Error');
  assert.match(result.error.message, /Area view 503/);
  assert.equal(fallbackCalls, 1);
});
