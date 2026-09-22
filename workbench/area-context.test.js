const test = require('node:test');
const assert = require('node:assert/strict');

const { AreaContext } = require('./area-model.js');

test('adds Area context without changing canonical Task completion semantics', () => {
  const context = AreaContext.resolve({ area_id: 'childcare', project_id: 'p1' }, {
    areas: [{
      id: 'childcare',
      title: '保育園運営',
      projects: [{ id: 'p1', title: 'P1' }],
      assignments: [],
      tasks: []
    }]
  });

  assert.equal(context.area.title, '保育園運営');
  assert.equal(context.project.title, 'P1');
  assert.equal(context.assignment, null);
});

test('resolves parent context for an Area-only task and preserves unassigned context', () => {
  const view = {
    areas: [{
      id: 'childcare',
      title: '保育園運営',
      projects: [],
      assignments: [{ id: 'a1', title: '申請対応' }],
      tasks: [{ id: 't1', area_id: 'childcare', assignment_id: 'a1', title: '確認' }]
    }],
    unassigned: { projects: [], assignments: [], tasks: [] }
  };

  const context = AreaContext.resolve(view.areas[0].tasks[0], view);
  assert.equal(context.area.id, 'childcare');
  assert.equal(context.project, null);
  assert.equal(context.assignment.id, 'a1');

  const unassigned = AreaContext.resolve({ id: 'u1' }, view);
  assert.equal(unassigned.area, null);
  assert.equal(unassigned.project, null);
  assert.equal(unassigned.assignment, null);
});
