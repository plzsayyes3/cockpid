const test = require('node:test');
const assert = require('node:assert/strict');

const AreaModel = require('./area-model.js');

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
