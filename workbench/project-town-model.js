(() => {
  'use strict';

  const Status = window.COCKPID_PROJECT_STATUS;
  if (!Status) throw new Error('Project status model is required');
  const {
    activities: ACTIVITY,
    ageDays,
    activity,
    momentum,
    motivation,
    decisionText,
    detailMessage,
    projectSourcePath
  } = Status;

  const escapeHtml = (value) => String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])
  );

  function decodeBase64Utf8(value) {
    const raw = atob(String(value || '').replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(raw, (char) => char.charCodeAt(0)));
  }

  function scalar(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      return text.slice(1, -1);
    }
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
    return text;
  }

  function parseFrontmatter(markdown) {
    const lines = String(markdown || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    if (lines[0] !== '---') return {};

    const meta = {};
    let arrayKey = '';

    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index].trim() === '---') break;

      const item = /^\s+-\s+(.*)$/.exec(lines[index]);
      if (item && arrayKey) {
        if (!Array.isArray(meta[arrayKey])) meta[arrayKey] = [];
        meta[arrayKey].push(scalar(item[1]));
        continue;
      }

      const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[index]);
      if (!pair) continue;

      if (!pair[2].trim()) {
        meta[pair[1]] = '';
        arrayKey = pair[1];
      } else {
        meta[pair[1]] = scalar(pair[2]);
        arrayKey = '';
      }
    }

    return meta;
  }

  function isProjectCandidate(entry) {
    return entry?.type === 'file'
      && String(entry.name || '').endsWith('.md')
      && !/^(index|repositories)\.md$/i.test(entry.name)
      && !/^PROJECT_/i.test(entry.name)
      && !/-\d{4}-\d{2}-\d{2}\.md$/i.test(entry.name);
  }

  function handoffPrompt(project) {
    return `「${project.title}」Projectの続きを進めたい。\n\nまず ${projectSourcePath(project)} を確認して、Project正本を基準に現在地を把握してください。\n\n現在の記録:\nCurrent: ${project.current || '未記載'}\nNext: ${project.next || '未記載'}\nDecision: ${project.decision || '未記載'}\nactivity: ${project.activity || activity(project).key}\n\nこのProjectは私の判断・指示を待っている状態です。まず、今私が判断すべきことを1〜3点に絞って提示してください。私が返答したら、その内容に従って作業を進め、Project正本の current / next / decision / activity / last_touched / History を必要に応じて更新してください。`;
  }

  function recordTitle(record) {
    return String(record?.title || record?.name || record?.id || '未命名');
  }

  function renderRecord(record, type) {
    const title = escapeHtml(recordTitle(record));
    const id = escapeHtml(record?.id || '');
    if (type === 'projects') {
      return `<button class="area-record area-project" data-project-id="${id}" type="button"><span>${title}</span></button>`;
    }
    return `<div class="area-record area-${type.slice(0, -1)}"><span>${title}</span></div>`;
  }

  function renderCollection(label, records, type) {
    const items = Array.isArray(records) ? records : [];
    return `<section class="area-collection area-collection-${type}"><h3>${label}</h3><div class="area-records">${items.length ? items.map((record) => renderRecord(record, type)).join('') : '<div class="area-empty">なし</div>'}</div></section>`;
  }

  function renderAreaSummary(area) {
    const source = area && typeof area === 'object' ? area : {};
    return `<section class="area-summary" data-area-id="${escapeHtml(source.id || '')}"><header class="area-summary-head"><span class="area-kicker">AREA</span><h2>${escapeHtml(source.title || source.id || '未命名Area')}</h2></header>${renderCollection('PROJECT', source.projects, 'projects')}${renderCollection('ASSIGNMENT', source.assignments, 'assignments')}${renderCollection('TASK', source.tasks, 'tasks')}</section>`;
  }

  function projectRecordsFromAreaView(view, source) {
    const areas = Array.isArray(view?.areas) ? view.areas : [];
    const records = areas.flatMap((area) => Array.isArray(area?.projects)
      ? area.projects.map((project) => ({ ...project, source, path: project.path || project.object_path || `projects/${project.id}.md` }))
      : []);
    const unassigned = Array.isArray(view?.unassigned?.projects) ? view.unassigned.projects : [];
    return records.concat(unassigned.map((project) => ({
      ...project,
      source,
      path: project.path || project.object_path || `projects/${project.id}.md`
    })));
  }

  function projectRecordsFromLegacyView(view) {
    return (Array.isArray(view?.projects) ? view.projects : []).map((project) => ({
      ...project,
      path: project.path || project.object_path || `projects/${project.id}.md`
    }));
  }

  const api = {
    activities: ACTIVITY,
    escapeHtml,
    decodeBase64Utf8,
    parseFrontmatter,
    isProjectCandidate,
    ageDays,
    activity,
    momentum,
    motivation,
    decisionText,
    detailMessage,
    handoffPrompt,
    renderAreaSummary,
    projectRecordsFromAreaView,
    projectRecordsFromLegacyView
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ProjectTownModel = Object.freeze(api);
})();
