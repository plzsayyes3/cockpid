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

test('prefers a configured custom Project source before Area-first loading', async () => {
  let areaCalls = 0;
  let fallbackCalls = 0;
  const context = {
    window: {
      fetch: async () => {
        areaCalls += 1;
        return { ok: true, json: async () => ({ content: encoded(validAreaView()) }) };
      },
      COCKPID_PROJECT_SOURCE: { repo: 'custom-repo', dir: 'custom-projects' },
    },
    atob,
    btoa,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Date,
  };
  vm.runInNewContext(adapterSource, context);

  const result = await context.window.COCKPID_AREA_VIEW.loadWithFallback({}, async () => {
    fallbackCalls += 1;
    return { projects: [{ id: 'custom-project' }] };
  });

  assert.equal(result.kind, 'project');
  assert.equal(result.source.repo, 'custom-repo');
  assert.equal(areaCalls, 0);
  assert.equal(fallbackCalls, 1);
});

function validAreaView(overrides = {}) {
  return {
    schema_version: 1,
    generated_at: '2026-09-23T05:23:58+09:00',
    source: { repository: 'plzsayyes3/my-storage-note', authority: 'objects' },
    areas: [{ id: 'childcare', title: '保育園運営', object_path: 'objects/areas/childcare.md', projects: [], assignments: [], tasks: [] }],
    unassigned: { projects: [], assignments: [], tasks: [] },
    validation: { projects: [], assignments: [], tasks: [] },
    validation_warnings: [],
    ...overrides,
  };
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

test('keeps validation records outside Area sibling groups', () => {
  const invalidTask = { id: 'task-1', area_id: 'childcare', project_id: 'p1', assignment_id: 'a1' };
  const view = {
    areas: [{ id: 'childcare', title: '保育園運営', projects: [], assignments: [], tasks: [] }],
    unassigned: { projects: [], assignments: [], tasks: [] },
    validation: { projects: [], assignments: [], tasks: [invalidTask] },
    validation_warnings: [{ task_id: 'task-1', warnings: ['project_id and assignment_id are mutually exclusive'] }],
  };

  assert.deepEqual(AreaModel.groupItems(view)[0].tasks, []);
  assert.deepEqual(AreaModel.unassigned(view), { projects: [], assignments: [], tasks: [] });
  assert.deepEqual(AreaModel.validation(view), { projects: [], assignments: [], tasks: [invalidTask] });
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
  const view = validAreaView();
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
    validAreaView({ areas: [{ id: 'childcare', title: '', object_path: 'objects/areas/childcare.md', projects: [], assignments: [], tasks: [] }] }),
    validAreaView({ areas: [{ id: 'childcare', title: '保育園運営', object_path: '', projects: [], assignments: [], tasks: [] }] }),
    validAreaView({ areas: [{ id: 'childcare', projects: [], assignments: [] }] }),
    validAreaView({ areas: [{ id: '', title: '保育園運営', object_path: 'objects/areas/childcare.md', projects: [], assignments: [], tasks: [] }] }),
    validAreaView({ areas: [{ id: 'childcare', title: '保育園運営', object_path: 'objects/areas/childcare.md', projects: [], assignments: [], tasks: [] }, { id: 'childcare', title: '重複', object_path: 'objects/areas/duplicate.md', projects: [], assignments: [], tasks: [] }] }),
    validAreaView({ areas: [{ id: 'childcare', title: '保育園運営', object_path: 'objects/areas/childcare.md', projects: [null], assignments: [], tasks: [] }] }),
    validAreaView({ unassigned: { projects: [], assignments: [] } }),
  ];

  for (const view of malformedViews) {
    const adapter = adapterContext(async () => ({ ok: true, json: async () => ({ content: encoded(view) }) }));
    await assert.rejects(adapter.COCKPID_AREA_VIEW.load(), /Area view/);
  }
});

test('rejects malformed read-model metadata', async () => {
  const malformedMetadata = [
    { schema_version: 2 },
    { generated_at: '' },
    { source: {} },
    { source: { repository: '', authority: 'objects' } },
    { source: { repository: 'plzsayyes3/my-storage-note', authority: '' } },
  ];

  for (const metadata of malformedMetadata) {
    const adapter = adapterContext(async () => ({ ok: true, json: async () => ({ content: encoded(validAreaView(metadata)) }) }));
    await assert.rejects(adapter.COCKPID_AREA_VIEW.load(), /Area view/);
  }
});

test('rejects a Task with mutually exclusive Project and Assignment parents', async () => {
  const view = validAreaView({
    unassigned: {
      projects: [],
      assignments: [],
      tasks: [{ id: 'task-1', project_id: 'project-1', assignment_id: 'assignment-1' }],
    },
  });
  const adapter = adapterContext(async () => ({ ok: true, json: async () => ({ content: encoded(view) }) }));

  await assert.rejects(adapter.COCKPID_AREA_VIEW.load(), /parentage|project_id and assignment_id/);
});

test('accepts Canonical validation records and preserves their warnings', async () => {
  const invalidTask = { id: 'task-1', area_id: 'childcare', project_id: 'project-1', assignment_id: 'assignment-1' };
  const view = validAreaView({
    validation: { projects: [], assignments: [], tasks: [invalidTask] },
    validation_warnings: [{ task_id: 'task-1', warnings: ['project_id and assignment_id are mutually exclusive'] }],
  });
  const adapter = adapterContext(async () => ({ ok: true, json: async () => ({ content: encoded(view) }) }));

  const loaded = await adapter.COCKPID_AREA_VIEW.load();

  assert.deepEqual(JSON.parse(JSON.stringify(loaded.validation)), view.validation);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.validation_warnings)), view.validation_warnings);
});

test('accepts unknown Area records in unassigned and preserves the warning', async () => {
  const view = validAreaView({
    unassigned: { projects: [{ id: 'p1', area_id: 'unknown-area' }], assignments: [], tasks: [] },
    validation_warnings: [{ object_type: 'project', object_id: 'p1', area_id: 'unknown-area', message: 'unknown Area ID: unknown-area' }],
  });
  const adapter = adapterContext(async () => ({ ok: true, json: async () => ({ content: encoded(view) }) }));

  const loaded = await adapter.COCKPID_AREA_VIEW.load();

  assert.deepEqual(JSON.parse(JSON.stringify(loaded.unassigned.projects)), view.unassigned.projects);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.validation_warnings)), view.validation_warnings);
});

test('rejects Area records without an exact matching area_id', async () => {
  for (const record of [{ id: 'p1' }, { id: 'p1', area_id: 'other-area' }]) {
    const adapter = adapterContext(async () => ({
      ok: true,
      json: async () => ({ content: encoded(validAreaView({
        areas: [{ ...validAreaView().areas[0], projects: [record] }]
      })) })
    }));
    await assert.rejects(adapter.COCKPID_AREA_VIEW.load(), /area_id/);
  }
});

test('rejects unassigned records with a non-empty area_id', async () => {
  const adapter = adapterContext(async () => ({
    ok: true,
    json: async () => ({ content: encoded(validAreaView({
      unassigned: { projects: [{ id: 'p1', area_id: 'childcare' }], assignments: [], tasks: [] }
    })) })
  }));

  await assert.rejects(adapter.COCKPID_AREA_VIEW.load(), /unassigned.*area_id/);
});

test('rejects non-string non-null area_id values in unassigned records', async () => {
  for (const areaId of [0, false, {}, []]) {
    const adapter = adapterContext(async () => ({
      ok: true,
      json: async () => ({ content: encoded(validAreaView({
        unassigned: { projects: [{ id: 'p1', area_id: areaId }], assignments: [], tasks: [] }
      })) })
    }));
    await assert.rejects(adapter.COCKPID_AREA_VIEW.load(), /unassigned.*area_id/);
  }
});

test('rejects non-canonical metadata, timestamps, and Area object paths', async () => {
  const malformedViews = [
    validAreaView({ source: { repository: 'other/repo', authority: 'objects' } }),
    validAreaView({ source: { repository: 'plzsayyes3/my-storage-note', authority: 'filesystem' } }),
    validAreaView({ generated_at: '2026-09-23' }),
    validAreaView({ areas: [{ ...validAreaView().areas[0], object_path: 'objects/areas/other.md' }] }),
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
