const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('./backstage.js'), 'utf8');
const readme = fs.readFileSync(require.resolve('../README.md'), 'utf8');
const surfaces = fs.readFileSync(require.resolve('../SURFACES.md'), 'utf8');

function element() {
  return {
    classList: { add() {}, remove() {}, toggle() {} },
    dataset: {},
    hidden: false,
    innerHTML: '',
    textContent: '',
    disabled: false,
    addEventListener() {},
    focus() {},
    setSelectionRange() {},
    querySelectorAll: () => [],
    querySelector: () => null,
  };
}

function context() {
  const elements = new Map([
    'projectList', 'deskItems', 'deskCount', 'projectCount', 'loadStatus',
    'reloadBtn', 'detailContent', 'detailEmpty',
    'projectMemoPane', 'projectMemoContext', 'projectMemoSource', 'projectMemoText',
    'projectMemoStatus', 'projectMemoSave', 'projectMemoClose'
  ].map((id) => [id, element()]));
  const window = {
    innerWidth: 900,
    COCKPID_PROJECT_SOURCE: { repo: 'custom-repo', dir: 'custom-projects' },
    COCKPID_AREA_VIEW: {
      loadWithFallback: async () => ({
        kind: 'project',
        fallback: true,
        source: { repo: 'custom-repo', dir: 'custom-projects' },
        view: { projects: [{ id: 'custom-project', title: 'Custom Project', status: 'active' }] }
      })
    },
    COCKPID_PROJECT_STATUS: {},
    COCKPID_PROJECT_STATUS_VIEW: {},
    COCKPID_AREA_CONTEXT: null,
    addEventListener() {},
  };
  const document = {
    body: { classList: { add() {}, remove() {}, contains() { return false; } } },
    getElementById: (id) => elements.get(id) || null,
    addEventListener() {},
  };
  const vmContext = {
    window,
    document,
    localStorage: { getItem: () => '' },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    console,
    history: { replaceState() {} },
    location: { hash: '', pathname: '/backstage.html', search: '' },
    URL,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    atob,
    btoa,
  };
  vm.runInNewContext(source, vmContext);
  return { window, elements };
}

test('Backstage preserves the legacy Project-only fallback contract', async () => {
  const harness = context();
  await harness.window.COCKPID_BACKSTAGE.loadProjects();

  assert.match(harness.elements.get('loadStatus').textContent, /Project fallback/);
  assert.match(harness.elements.get('projectList').innerHTML, /Custom Project/);
  assert.match(harness.elements.get('loadStatus').textContent, /Project-only/);
});

test('Backstage documentation matches the mixed Area-first shelf and Project-only fallback', () => {
  assert.match(readme, /ProjectとAssignmentを同じ一覧/);
  assert.match(readme, /compatibility\s+path remains Project-only/);
  assert.match(surfaces, /mixed Project \/ Assignment shelf/);
  assert.match(surfaces, /compatibility fallback is intentionally Project-only/);
  assert.match(surfaces, /Task siblings remain on the Area \/ ON HAND surfaces/);
});


test('Backstage exposes Projects and Assignments as distinct record types', () => {
  const html = fs.readFileSync(require.resolve('./backstage.html'), 'utf8');
  const css = fs.readFileSync(require.resolve('./backstage.css'), 'utf8');
  assert.match(html, /PROJECT \/ ASSIGNMENT/);
  assert.match(source, /area\.assignments/);
  assert.match(source, /unassigned\?\.assignments/);
  assert.match(source, /recordTypeBadge\(project/);
  assert.match(source, /ASSIGN/);
  assert.match(source, /assignmentTotal/);
  assert.match(css, /record-type-badge\.assignment/);
  assert.match(css, /project-card\.record-assignment/);
  assert.match(css, /record-assignment \.project-fill\{display:none\}/);
  assert.match(source, /const metricHtml = isProject \?/);
  assert.match(source, /isProject \? fillPercent\(project\) : 0/);
});

test('mixed Project and Assignment state uses type-qualified record keys', () => {
  assert.match(source, /function recordKey\(project\)/);
  assert.match(source, /return `\$\{recordType\(project\)\}:\$\{project\.id\}`/);
  assert.match(source, /function recordByKey\(value\)/);
  assert.match(source, /\^\(project\|assignment\):\(\.\*\)\$/);
  assert.match(source, /selectedKey === recordKey\(project\)/);
  assert.match(source, /memoDrafts\.get\(recordKey\(project\)\)/);
  assert.match(source, /data-record-key/);
  assert.match(source, /encodeURIComponent\(recordKey\(project\)\)/);
  assert.match(source, /recordType\(item\) === 'project' && item\.id === relation\.projectId/);
});

test('Backstage hides completed Assignments without changing Project lifecycle rules', () => {
  assert.match(source, /CLOSED_ASSIGNMENT_STATUSES = new Set\(\['done', 'cancelled', 'canceled', 'archived'\]\)/);
  assert.match(source, /if \(recordType\(project\) === 'assignment'\) return !CLOSED_ASSIGNMENT_STATUSES\.has\(status\)/);
  assert.match(source, /return status !== 'archived'/);
  assert.match(source, /projects = allProjects\.filter\(isBackstageVisible\)/);
  assert.match(source, /closed hidden/);
});

test('Backstage keeps a compact three-column memo layout for tablet-width frames', () => {
  const css = fs.readFileSync(require.resolve('./backstage.css'), 'utf8');
  assert.match(css, /@media\(max-width:980px\) and \(min-width:821px\)/);
  assert.match(css, /body\.memo-open \.backstage-app\{padding-left:18px;padding-right:18px\}/);
  assert.match(css, /grid-template-columns:minmax\(200px,\.9fr\) minmax\(260px,1\.25fr\) minmax\(210px,\.95fr\)/);
  assert.match(css, /body\.memo-open \.project-memo-pane\{padding-left:14px\}/);
});

test('inline memo save records the selected Project or Assignment route explicitly', () => {
  assert.match(source, /function memoRouteFor\(project\)/);
  assert.match(source, /selectBranch\(area, recordType\(project\)/);
  assert.match(source, /id: project\.id/);
  assert.match(source, /title: project\.title/);
  assert.match(source, /recordMemo\(name, undefined, route\)/);
  assert.doesNotMatch(source, /recordMemo\?\.\(name\)/);
});

test('Projects inline memo contract keeps capture project-scoped and Inbox-first', () => {
  const html = fs.readFileSync(require.resolve('./backstage.html'), 'utf8');
  assert.match(html, /id="projectMemoPane"/);
  assert.match(html, /id="projectMemoText"/);
  assert.match(html, /Project \/ Assignment正本はここでは変更しません/);
  assert.match(source, /cockpid:open-project-memo/);
  assert.match(source, /projectMemoPrefix\(project\)/);
  assert.match(source, /repo: 'mynotebook', dir: '00_inbox'/);
});
