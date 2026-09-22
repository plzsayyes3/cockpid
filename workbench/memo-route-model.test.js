const test = require('node:test');
const assert = require('node:assert/strict');

const Route = require('./memo-route-model.js');

function storage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test('creates an Area route with each supported destination branch', () => {
  const area = { id: 'childcare', title: '保育園運営' };
  const routes = Route.branchTypes().map((branch) => Route.selectBranch(area, branch.key));

  assert.deepEqual(routes.map((route) => route.branch), [
    'project', 'assignment', 'task', 'reference', 'principle'
  ]);
  assert.deepEqual(routes.map((route) => route.areaId), Array(5).fill('childcare'));
  assert.equal(routes[0].label, 'Project');
  assert.equal(routes[4].label, 'Principle');
});

test('records the selected route as sidecar metadata without changing memo content', () => {
  const store = storage();
  const area = { id: 'childcare', title: '保育園運営' };
  const route = Route.selectBranch(area, 'assignment', { id: 'a1', title: '申請対応' });

  Route.setCurrent(route, store);
  Route.recordMemo('20260923010101.md', store);

  assert.deepEqual(Route.current(store), route);
  assert.deepEqual(Route.forMemo('20260923010101.md', store), route);
  assert.equal(Route.memoContent('idea', route), 'idea');
  assert.match(Route.displayLabel(route), /保育園運営.*Assignment.*申請対応/);
});

test('ignores unknown branches and malformed stored route metadata', () => {
  const store = storage();
  assert.equal(Route.selectBranch({ id: 'a' }, 'unknown'), null);
  store.setItem(Route.STORAGE_KEY, JSON.stringify({ current: { areaId: '' }, memos: [] }));
  assert.equal(Route.current(store), null);
  assert.equal(Route.forMemo('missing.md', store), null);
});
