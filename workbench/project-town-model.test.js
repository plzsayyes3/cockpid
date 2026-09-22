const test = require('node:test');
const assert = require('node:assert/strict');

global.window = { COCKPID_PROJECT_STATUS: require('./project-status-model.js') };
const ProjectTownModel = require('./project-town-model.js');
delete global.window;

test('renders Project, Assignment, and Task as sibling Area sections', () => {
  const html = ProjectTownModel.renderAreaSummary({
    title: '保育園運営',
    projects: [{ title: 'P' }],
    assignments: [{ title: 'A' }],
    tasks: [{ title: 'T' }]
  });

  assert.match(html, /PROJECT/);
  assert.match(html, /ASSIGNMENT/);
  assert.match(html, /TASK/);
});

test('makes only Project records selectable and keeps Area source metadata', () => {
  const html = ProjectTownModel.renderAreaSummary({
    id: 'childcare',
    title: '保育園運営',
    projects: [{ id: 'p1', title: 'P' }],
    assignments: [{ id: 'a1', title: 'A' }],
    tasks: [{ id: 't1', title: 'T' }]
  });

  assert.match(html, /data-project-id="p1"/);
  assert.equal((html.match(/data-project-id=/g) || []).length, 1);
});

test('flattens Area Projects and unassigned Projects without dropping either source', () => {
  const source = { repo: 'my-storage-note', path: 'views/areas.json', mode: 'view' };
  const projects = ProjectTownModel.projectRecordsFromAreaView({
    areas: [{ projects: [{ id: 'area-project', title: 'Area P' }] }],
    unassigned: { projects: [{ id: 'legacy-project', title: 'Legacy P' }] }
  }, source);

  assert.deepEqual(projects.map((project) => project.id), ['area-project', 'legacy-project']);
  assert.equal(projects[0].source, source);
  assert.equal(projects[1].path, 'projects/legacy-project.md');
});

test('keeps configured legacy Project records intact for Area fallback', () => {
  const projects = ProjectTownModel.projectRecordsFromLegacyView({
    projects: [{ id: 'custom-project', title: 'Custom P', path: 'custom-dir/custom-project.md' }]
  });

  assert.deepEqual(projects, [{ id: 'custom-project', title: 'Custom P', path: 'custom-dir/custom-project.md' }]);
});

test('handoffPrompt uses a Project record source before the configured global source', () => {
  global.window = {
    COCKPID_PROJECT_STATUS: require('./project-status-model.js'),
    COCKPID_PROJECT_SOURCE: { repo: 'legacy-repo', dir: 'legacy-projects' }
  };
  delete require.cache[require.resolve('./project-town-model.js')];
  const Model = require('./project-town-model.js');

  const canonicalPrompt = Model.handoffPrompt({
    id: 'area-project',
    title: 'Area P',
    path: 'objects/projects/area-project.md',
    source: { repo: 'my-storage-note', path: 'views/areas.json', mode: 'view' }
  });
  const legacyPrompt = Model.handoffPrompt({
    id: 'custom-project',
    title: 'Custom P',
    path: 'custom-projects/custom-project.md',
    source: { repo: 'legacy-repo', dir: 'custom-projects' }
  });

  assert.match(canonicalPrompt, /my-storage-note\/objects\/projects\/area-project\.md/);
  assert.match(legacyPrompt, /legacy-repo\/custom-projects\/custom-project\.md/);
  delete global.window;
});
