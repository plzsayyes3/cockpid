const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const status = require('./project-status-model.js');
global.window = { COCKPID_PROJECT_STATUS: status };
const model = require('./project-town-model.js');
delete global.window;
const areaModel = require('./area-model.js');
const source = fs.readFileSync(require.resolve('./project-town-v2.js'), 'utf8');

function element() {
  return {
    classList: { add() {}, toggle() {} },
    dataset: {},
    innerHTML: '',
    textContent: '',
    disabled: false,
    addEventListener() {}
  };
}

function context({ areaLoader, fetchImpl = async () => ({ ok: true, json: async () => [] }), projectSource = null } = {}) {
  const elements = new Map(['projectList', 'projectRoom', 'projectCount', 'townSummary', 'detailContent', 'detailState', 'reloadBtn', 'messageTitle', 'messageText'].map((id) => [id, element()]));
  const document = {
    hidden: false,
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const window = {
    __COCKPID_PROJECT_TOWN_NO_AUTOLOAD__: true,
    ProjectTownModel: model,
    COCKPID_PROJECT_STATUS: status,
    COCKPID_AREA_MODEL: areaModel,
    COCKPID_AREA_VIEW: { loadWithFallback: areaLoader },
    COCKPID_PROJECT_SOURCE: projectSource,
    ProjectTownMotion: { start() {}, stop() {} },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout,
    addEventListener() {},
    open() {}
  };
  const vmContext = {
    window,
    document,
    localStorage: { getItem: () => '' },
    navigator: { clipboard: { writeText: async () => {} } },
    fetch: fetchImpl,
    console,
    setTimeout,
    URL,
    Date,
    Promise,
    TextDecoder,
    TextEncoder,
    atob,
    btoa
  };
  vm.runInNewContext(source, vmContext);
  return { controller: window.COCKPID_PROJECT_TOWN, elements };
}

function areaView() {
  return {
    schema_version: 1,
    generated_at: '2026-09-23T05:23:58+09:00',
    source: { repository: 'plzsayyes3/my-storage-note', authority: 'objects' },
    areas: [{ id: 'childcare', title: '保育園運営', projects: [{ id: 'area-project', title: 'Area P' }], assignments: [{ id: 'assignment', title: 'A' }], tasks: [{ id: 'task', title: 'T' }] }],
    unassigned: { projects: [], assignments: [], tasks: [] }
  };
}

test('actual Project Town load path prefers Area data and renders the live room', async () => {
  let fallbackCalls = 0;
  const harness = context({
    areaLoader: async () => ({ kind: 'area', fallback: false, source: { repo: 'my-storage-note', path: 'views/areas.json', mode: 'view' }, view: areaView() })
  });

  await harness.controller.load();

  assert.equal(fallbackCalls, 0);
  assert.match(harness.elements.get('projectRoom').innerHTML, /保育園運営/);
  assert.match(harness.elements.get('projectRoom').innerHTML, /PROJECT/);
  assert.match(harness.elements.get('projectRoom').innerHTML, /ASSIGNMENT/);
  assert.match(harness.elements.get('projectRoom').innerHTML, /TASK/);
  assert.match(harness.elements.get('projectRoom').innerHTML, /data-project-id="area-project"/);
});

test('actual Project Town load path invokes legacy fallback when Area loading fails', async () => {
  const markdown = '---\ntype: "project"\nid: "custom-project"\ntitle: "Custom P"\nstatus: "active"\n---\n';
  const requested = [];
  const harness = context({
    projectSource: { repo: 'legacy-repo', dir: 'custom-projects' },
    areaLoader: async (_init, fallback) => {
      const view = await fallback();
      return { kind: 'project', fallback: true, source: { repo: 'legacy-repo', dir: 'custom-projects' }, view };
    },
    fetchImpl: async (url) => {
      requested.push(String(url));
      if (String(url).includes('/repos/plzsayyes3/legacy-repo/contents/custom-projects?')) {
        return { ok: true, json: async () => [{ type: 'file', name: 'custom-project.md', path: 'custom-projects/custom-project.md' }] };
      }
      return { ok: true, json: async () => ({ content: btoa(markdown) }) };
    }
  });

  await harness.controller.load();

  assert.equal(requested.length, 2);
  assert.match(requested[0], /legacy-repo\/contents\/custom-projects/);
  assert.match(harness.elements.get('projectList').innerHTML, /Custom P/);
  assert.equal(Number(harness.elements.get('projectCount').textContent), 1);
});

test('actual Project detail and handoff contract remains Project-only for fallback records', async () => {
  const harness = context({
    areaLoader: async (_init, fallback) => ({
      kind: 'project',
      fallback: true,
      source: { repo: 'legacy-repo', dir: 'custom-projects' },
      view: { projects: [{ id: 'custom-project', title: 'Custom P', path: 'custom-projects/custom-project.md', current: '確認お願いします', activity: 'review' }] }
    })
  });

  await harness.controller.load();
  harness.controller.showProject('custom-project');
  const detail = harness.elements.get('detailContent').innerHTML;

  assert.match(detail, /data-handoff-id="custom-project"/);
  assert.match(harness.controller.handoffPrompt({
    id: 'custom-project', title: 'Custom P', path: 'custom-projects/custom-project.md',
    source: { repo: 'legacy-repo', dir: 'custom-projects' }
  }), /legacy-repo\/custom-projects\/custom-project\.md/);
});
