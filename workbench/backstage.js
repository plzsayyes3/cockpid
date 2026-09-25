(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const REPO = 'gpts';
  const BRANCH = 'main';
  const PROJECT_DIR = 'projects';
  const TOKEN_KEY = 'zen-note-github-token';
  const SYMMETRIC_RELATIONS = new Set(['related', 'integrates_with']);
  const SHEETS_FULL_SCALE = 30;

  const $ = (id) => document.getElementById(id);
  const list = $('projectList');
  const deskItems = $('deskItems');
  const deskCount = $('deskCount');
  const projectCount = $('projectCount');
  const status = $('loadStatus');
  const reloadButton = $('reloadBtn');
  const detailContent = $('detailContent');
  const detailEmpty = $('detailEmpty');
  const memoPane = $('projectMemoPane');
  const memoContext = $('projectMemoContext');
  const memoTitle = $('projectMemoTitle');
  const memoSourceLabel = $('projectMemoSource');
  const memoText = $('projectMemoText');
  const memoStatus = $('projectMemoStatus');
  const memoSave = $('projectMemoSave');
  const memoClose = $('projectMemoClose');
  const statusModel = window.COCKPID_PROJECT_STATUS;
  const statusView = window.COCKPID_PROJECT_STATUS_VIEW;
  const areaContext = window.COCKPID_AREA_CONTEXT || window.AreaContext;

  let allProjects = [];
  let projects = [];
  let selectedKey = '';
  let areaView = null;
  let memoRecordKey = '';
  const memoDrafts = new Map();

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  const token = () => localStorage.getItem(TOKEN_KEY) || '';

  function memoSource() {
    try {
      return window.COCKPID_SOURCES?.get?.('memo')
        || window.parent?.COCKPID_SOURCES?.get?.('memo')
        || { repo: 'mynotebook', dir: '00_inbox' };
    } catch (_) {
      return { repo: 'mynotebook', dir: '00_inbox' };
    }
  }

  function joinPath(dir, child) {
    const base = String(dir || '').replace(/^\/+|\/+$/g, '');
    const tail = String(child || '').replace(/^\/+/, '');
    return base ? `${base}/${tail}` : tail;
  }

  function encodeApiPath(path) {
    return String(path || '').split('/').map(encodeURIComponent).join('/');
  }

  function encodeUtf8(value) {
    const bytes = new TextEncoder().encode(String(value ?? ''));
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function memoStamp(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || '00';
    return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}${String(date.getMilliseconds()).padStart(3, '0')}`;
  }

  function selectedProject() {
    return recordByKey(selectedKey);
  }

  function projectMemoPrefix(project) {
    return project ? `${project.title}: ` : '';
  }

  function recordType(project) {
    const value = String(project?.recordType || project?.meta?.type || project?.meta?.object_type || 'project').toLowerCase();
    return value === 'assignment' ? 'assignment' : 'project';
  }

  function recordKey(project) {
    if (!project?.id) return '';
    return `${recordType(project)}:${project.id}`;
  }

  function recordByKey(value) {
    const key = String(value || '').trim();
    if (!key) return null;
    const typed = /^(project|assignment):(.*)$/.exec(key);
    if (typed) {
      return allProjects.find((item) => recordType(item) === typed[1] && String(item.id) === typed[2]) || null;
    }
    // Legacy Backstage hashes used a raw Project id. Prefer Project when
    // resolving those links so old URLs keep their historical meaning.
    return allProjects.find((item) => recordType(item) === 'project' && String(item.id) === key)
      || allProjects.find((item) => String(item.id) === key)
      || null;
  }

  function recordTypeShort(project) {
    return recordType(project) === 'assignment' ? 'ASSIGN' : 'PJ';
  }

  function recordTypeLong(project) {
    return recordType(project) === 'assignment' ? 'Assignment' : 'Project';
  }

  const CLOSED_ASSIGNMENT_STATUSES = new Set(['done', 'cancelled', 'canceled', 'archived']);

  function recordStatus(project) {
    return String(project?.meta?.status || '').trim().toLowerCase();
  }

  function isBackstageVisible(project) {
    const status = recordStatus(project);
    if (recordType(project) === 'assignment') return !CLOSED_ASSIGNMENT_STATUSES.has(status);
    return status !== 'archived';
  }

  function isClosedAssignment(project) {
    return recordType(project) === 'assignment' && CLOSED_ASSIGNMENT_STATUSES.has(recordStatus(project));
  }

  function recordTypeBadge(project, detail = false) {
    const type = recordType(project);
    const label = detail ? recordTypeLong(project).toUpperCase() : recordTypeShort(project);
    return `<span class="record-type-badge ${type}${detail ? ' detail' : ''}">${label}</span>`;
  }

  function memoRouteApi() {
    try {
      return window.COCKPID_MEMO_ROUTE || window.parent?.COCKPID_MEMO_ROUTE || null;
    } catch (_) {
      return window.COCKPID_MEMO_ROUTE || null;
    }
  }

  function memoRouteFor(project) {
    const routeApi = memoRouteApi();
    const area = areaFor(project);
    if (!project || !area || typeof routeApi?.selectBranch !== 'function') return null;
    return routeApi.selectBranch(area, recordType(project), {
      id: project.id,
      title: project.title
    });
  }

  function setMemoStatus(message, error = false) {
    if (!memoStatus) return;
    memoStatus.textContent = message;
    memoStatus.classList.toggle('error', error);
  }

  function stashProjectMemoDraft() {
    if (!memoText || !memoRecordKey) return;
    memoDrafts.set(memoRecordKey, memoText.value);
  }

  function loadProjectMemo(project) {
    if (!memoText || !memoContext || !memoSave) return;
    stashProjectMemoDraft();
    memoRecordKey = recordKey(project);
    const source = memoSource();
    if (memoSourceLabel) memoSourceLabel.textContent = `${source.repo} / ${source.dir}`;

    if (!project) {
      if (memoTitle) memoTitle.textContent = 'Memo';
      memoContext.textContent = 'Project / Assignmentを選択してください。';
      memoText.placeholder = 'このProject / Assignmentについて、今考えていることを書く……';
      memoText.value = '';
      memoText.disabled = true;
      memoSave.disabled = true;
      setMemoStatus('SELECT ITEM');
      return;
    }

    const typeName = recordTypeLong(project);
    if (memoTitle) memoTitle.textContent = `${typeName} Memo`;
    memoContext.textContent = `${typeName} · ${project.title}`;
    memoText.placeholder = `この${typeName}について、今考えていることを書く……`;
    memoText.disabled = false;
    memoSave.disabled = false;
    memoText.value = memoDrafts.get(recordKey(project)) ?? projectMemoPrefix(project);
    setMemoStatus('READY');
    const end = memoText.value.length;
    memoText.focus?.();
    memoText.setSelectionRange?.(end, end);
  }

  function notifyProjectMemoState(open) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'cockpid:project-memo-state', open: Boolean(open) }, location.origin);
      }
    } catch (_) {}
  }

  function openProjectMemo() {
    if (!memoPane) return;
    memoPane.hidden = false;
    document.body.classList.add('memo-open');
    notifyProjectMemoState(true);
    loadProjectMemo(selectedProject());
  }

  function closeProjectMemo() {
    if (!memoPane) return;
    stashProjectMemoDraft();
    memoPane.hidden = true;
    document.body.classList.remove('memo-open');
    notifyProjectMemoState(false);
  }

  async function saveProjectMemo() {
    const project = selectedProject();
    if (!project || !memoText || !memoSave) {
      setMemoStatus('SELECT PROJECT', true);
      return;
    }
    const text = memoText.value.trim();
    const prefix = projectMemoPrefix(project).trim();
    if (!text || text === prefix) {
      setMemoStatus('EMPTY', true);
      return;
    }
    const currentToken = token();
    if (!currentToken) {
      setMemoStatus('TOKEN REQUIRED · Workbench Settings', true);
      return;
    }

    const source = memoSource();
    const name = `${memoStamp()}.md`;
    const memoPath = joinPath(source.dir, name);
    memoSave.disabled = true;
    setMemoStatus('POSTING…');

    try {
      const response = await fetch(`https://api.github.com/repos/${OWNER}/${source.repo}/contents/${encodeApiPath(memoPath)}`, {
        method: 'PUT',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `cockpid: ${recordType(project)} memo ${name}`,
          content: encodeUtf8(`${text}\n`)
        })
      });
      if (!response.ok) throw new Error(`${source.repo} write ${response.status}`);
      try {
        const routeApi = memoRouteApi();
        const route = memoRouteFor(project);
        if (route && typeof routeApi?.recordMemo === 'function') {
          routeApi.recordMemo(name, undefined, route);
        }
      } catch (_) {}
      memoDrafts.set(recordKey(project), projectMemoPrefix(project));
      memoText.value = projectMemoPrefix(project);
      setMemoStatus(`SAVED · ${name}`);
    } catch (error) {
      console.error('Project memo write failed', error);
      setMemoStatus(String(error?.message || error).toUpperCase(), true);
    } finally {
      memoSave.disabled = false;
    }
  }

  async function apiJson(url) {
    const headers = { Accept: 'application/vnd.github+json' };
    const currentToken = token();
    if (currentToken) headers.Authorization = `Bearer ${currentToken}`;

    let response = await fetch(url, { headers });
    if (!response.ok && currentToken && (response.status === 403 || response.status === 404)) {
      response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    }
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    return response.json();
  }

  function decodeBase64Utf8(value) {
    const binary = atob(String(value || '').replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  }

  function parseScalar(raw) {
    const value = String(raw ?? '').trim();
    if (!value) return '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null' || value === '~') return null;
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    return value;
  }

  function parseFrontmatter(markdown) {
    const text = String(markdown || '').replace(/^\uFEFF/, '');
    if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return { meta: {}, body: text };
    const lines = text.split(/\r?\n/);
    let end = -1;
    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index].trim() === '---') { end = index; break; }
    }
    if (end < 0) return { meta: {}, body: text };

    const meta = {};
    let arrayKey = '';
    let currentObject = null;

    for (const line of lines.slice(1, end)) {
      const topPair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
      if (topPair) {
        const [, key, rawValue] = topPair;
        currentObject = null;
        if (!rawValue.trim()) {
          meta[key] = '';
          arrayKey = key;
        } else {
          meta[key] = parseScalar(rawValue);
          arrayKey = '';
        }
        continue;
      }

      const listItem = /^\s{2}-\s+(.*)$/.exec(line);
      if (listItem && arrayKey) {
        if (!Array.isArray(meta[arrayKey])) meta[arrayKey] = [];
        const objectStart = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(listItem[1]);
        if (objectStart) {
          currentObject = { [objectStart[1]]: parseScalar(objectStart[2]) };
          meta[arrayKey].push(currentObject);
        } else {
          currentObject = null;
          meta[arrayKey].push(parseScalar(listItem[1]));
        }
        continue;
      }

      const objectField = /^\s{4}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
      if (objectField && currentObject) {
        currentObject[objectField[1]] = parseScalar(objectField[2]);
      }
    }

    return { meta, body: lines.slice(end + 1).join('\n').trim() };
  }

  function isCandidate(entry) {
    if (entry.type !== 'file' || !entry.name.endsWith('.md')) return false;
    if (/^(index|repositories)\.md$/i.test(entry.name)) return false;
    if (/^PROJECT_/i.test(entry.name)) return false;
    if (/-\d{4}-\d{2}-\d{2}\.md$/i.test(entry.name)) return false;
    return true;
  }

  async function fetchProject(entry) {
    const payload = await apiJson(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${entry.path}?ref=${BRANCH}`);
    if (!payload?.content) return null;
    const source = decodeBase64Utf8(payload.content);
    const parsed = parseFrontmatter(source);
    if (parsed.meta.type !== 'project') return null;
    return {
      id: String(parsed.meta.id || entry.name.replace(/\.md$/, '')),
      title: String(parsed.meta.title || parsed.meta.id || entry.name.replace(/\.md$/, '')),
      meta: parsed.meta,
      body: parsed.body,
      path: entry.path,
      sha: entry.sha
    };
  }

  function jstDateKey() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || '00';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function dayDistance(dateText) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText || ''))) return null;
    const [ty, tm, td] = jstDateKey().split('-').map(Number);
    const [y, m, d] = String(dateText).split('-').map(Number);
    return Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
  }

  function touchedLabel(value) {
    const distance = dayDistance(value);
    if (distance === 0) return '今日';
    if (distance === 1) return '昨日';
    if (distance != null && distance > 1 && distance < 14) return `${distance}日前`;
    return String(value || '—');
  }

  function sheetsValue(project) {
    const value = Number(project.meta.sheets || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function fillPercent(project) {
    return Math.min(100, Math.max(0, (sheetsValue(project) / SHEETS_FULL_SCALE) * 100));
  }

  function projectTags(project) {
    const tags = Array.isArray(project.meta.tags) ? project.meta.tags : [];
    const commitment = String(project.meta.commitment || '');
    const values = [...tags.slice(0, 2)];
    if (commitment && commitment !== 'none') values.unshift(commitment);
    return values;
  }

  function areaFor(project) {
    return project?.area || areaContext?.resolve(project, areaView)?.area || null;
  }

  function areaLabel(project, branch = false) {
    const area = areaFor(project);
    if (!area) return '';
    const label = `AREA · ${area.title || area.id}`;
    return branch
      ? `<button class="area-branch" type="button" data-area-id="${esc(area.id)}">${esc(label)} →</button>`
      : `<span class="area-context-label">${esc(label)}</span>`;
  }

  function renderDesk() {
    const desk = projects.filter((project) => project.meta.desk === true);
    deskCount.textContent = String(desk.length);
    if (!desk.length) {
      deskItems.innerHTML = '<span class="quiet">重点的に扱うProjectだけ、ここに出ます。</span>';
      return;
    }
    deskItems.innerHTML = desk.map((project) => `<button class="desk-chip" type="button" data-record-key="${esc(recordKey(project))}">${esc(project.title)}</button>`).join('');
  }

  function renderList() {
    projectCount.textContent = String(projects.length);
    if (!projects.length) {
      list.innerHTML = '<div class="empty-list">表示できるProjectがありません。</div>';
      return;
    }

    list.innerHTML = projects.map((project) => {
      const tags = projectTags(project);
      const tagHtml = tags.map((tag) => `<span class="tag${String(tag).toLowerCase() === 'must' ? ' must' : ''}">${esc(tag)}</span>`).join('');
      const current = String(project.meta.current || '').trim();
      const type = recordType(project);
      const isProject = type === 'project';
      const sheets = isProject ? sheetsValue(project) : 0;
      const metricHtml = isProject ? `<span class="sheets">${sheets} / ${SHEETS_FULL_SCALE}</span>` : '';
      return `<button class="project-card record-${type}${selectedKey === recordKey(project) ? ' active' : ''}" type="button" data-record-key="${esc(recordKey(project))}" data-record-type="${type}" style="--fill-width:${isProject ? fillPercent(project) : 0}%">
        <span class="project-fill" aria-hidden="true"></span>
        <span class="project-inner">
          <span class="project-top"><span class="project-title-wrap">${recordTypeBadge(project)}<span class="project-title">${esc(project.title)}</span></span><span class="project-age">${esc(touchedLabel(project.meta.last_touched))}</span></span>
          ${areaLabel(project)}
          ${current ? `<span class="project-current">${esc(current)}</span>` : ''}
          <span class="project-foot"><span class="tags">${tagHtml}</span>${metricHtml}</span>
        </span>
      </button>`;
    }).join('');
  }

  function resolveMarkdownLink(href) {
    const value = String(href || '').trim();
    if (!value) return '#';
    if (/^(https?:|mailto:)/i.test(value)) return value;
    if (value.startsWith('#')) return value;
    try {
      return new URL(value, `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/${PROJECT_DIR}/`).href;
    } catch (_) {
      return '#';
    }
  }

  function inlineMarkdown(raw) {
    const links = [];
    let value = String(raw || '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const linkToken = `@@LINK_${links.length}@@`;
      links.push(`<a href="${esc(resolveMarkdownLink(href))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`);
      return linkToken;
    });
    value = esc(value)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    links.forEach((html, index) => { value = value.replace(`@@LINK_${index}@@`, html); });
    return value;
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown || '').split(/\r?\n/);
    const html = [];
    let paragraph = [];
    let inList = false;

    const flushParagraph = () => {
      if (!paragraph.length) return;
      html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
      paragraph = [];
    };
    const closeList = () => {
      if (!inList) return;
      html.push('</ul>');
      inList = false;
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.trim()) { flushParagraph(); closeList(); continue; }
      if (/^---+$/.test(line.trim())) { flushParagraph(); closeList(); html.push('<hr>'); continue; }
      const heading = /^(#{1,3})\s+(.*)$/.exec(line);
      if (heading) {
        flushParagraph(); closeList();
        const level = heading[1].length;
        html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
        continue;
      }
      const item = /^\s*[-*]\s+(.*)$/.exec(line);
      if (item) {
        flushParagraph();
        if (!inList) { html.push('<ul>'); inList = true; }
        html.push(`<li>${inlineMarkdown(item[1])}</li>`);
        continue;
      }
      if (inList) closeList();
      paragraph.push(line.trim());
    }
    flushParagraph(); closeList();
    return html.join('');
  }

  function githubPath(path, mode = 'blob', repo = REPO) {
    const value = String(path || '').trim().replace(/^\/+|\/+$/g, '');
    if (!value) return '';
    const encoded = value.split('/').map((part) => encodeURIComponent(part)).join('/');
    return `https://github.com/${OWNER}/${repo}/${mode}/${BRANCH}/${encoded}`;
  }

  function projectSourceLink(project) {
    const repo = project?.source?.repo || REPO;
    const url = githubPath(project?.path, 'blob', repo);
    if (!url) return '';
    return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${recordTypeLong(project).toUpperCase()} ↗</a>`;
  }

  function repositoryLink(repository) {
    const value = String(repository || '').trim();
    if (!value) return '';
    const url = value.startsWith('http') ? value : `https://github.com/${value}`;
    return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">REPOSITORY ↗</a>`;
  }

  function workspaceLink(workspace) {
    const value = String(workspace || '').trim();
    if (!value) return '';
    const url = githubPath(value, 'tree');
    if (!url) return '';
    return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">WORKSPACE ↗</a>`;
  }

  function markdownSection(source, heading) {
    const match = new RegExp(`(?:^|\\n)##\\s+${heading}\\b\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i').exec(source);
    return match ? match[1].trim() : '';
  }

  function detailParts(project) {
    const sourceBody = String(project.body || '').replace(/^#\s+.*(?:\r?\n|$)/, '').trim();
    const current = String(project.meta.current || markdownSection(sourceBody, 'Current')).trim();
    const next = String(project.meta.next || markdownSection(sourceBody, 'Next')).trim();
    const rest = sourceBody
      .replace(/(^|\n)##\s+Current\b[\s\S]*?(?=\n##\s+|$)/i, '\n')
      .replace(/(^|\n)##\s+Next\b[\s\S]*?(?=\n##\s+|$)/i, '\n')
      .trim();
    const resume = [
      current ? `## Current\n\n${current}` : '',
      next ? `## Next\n\n${next}` : ''
    ].filter(Boolean).join('\n\n');
    return { resume, rest };
  }

  function workstreamsOf(project) {
    return Array.isArray(project.meta.workstreams)
      ? project.meta.workstreams.filter((item) => item && typeof item === 'object' && (item.id || item.title))
      : [];
  }

  function renderWorkstreams(project) {
    const workstreams = workstreamsOf(project);
    if (!workstreams.length) return '';
    const active = workstreams.filter((item) => String(item.status || '').toLowerCase() !== 'done');
    const doneCount = workstreams.length - active.length;
    const rows = active.map((item) => {
      const state = String(item.status || 'active').toLowerCase();
      const title = String(item.title || item.id || 'Workstream');
      const note = String(item.note || '').trim();
      return `<div class="workstream-row">
        <span class="workstream-dot ${esc(state)}" aria-hidden="true"></span>
        <span class="workstream-main"><span class="workstream-title">${esc(title)}</span>${note ? `<span class="workstream-note">${esc(note)}</span>` : ''}</span>
        <span class="workstream-status">${esc(state)}</span>
      </div>`;
    }).join('');
    const done = doneCount ? `<div class="workstream-done">${doneCount} done</div>` : '';
    return `<section class="detail-section">
      <div class="detail-section-label">WORKSTREAMS</div>
      <div class="workstream-list">${rows || '<div class="section-empty">現在のWorkstreamはすべて完了しています。</div>'}${done}</div>
    </section>`;
  }

  function relationRecords(project) {
    if (recordType(project) !== 'project') return [];
    const records = [];
    const outgoing = Array.isArray(project.meta.relations) ? project.meta.relations : [];
    outgoing.forEach((relation) => {
      if (!relation || typeof relation !== 'object' || !relation.project) return;
      records.push({
        projectId: String(relation.project),
        type: String(relation.type || 'related'),
        note: String(relation.note || ''),
        direction: 'out'
      });
    });

    allProjects.forEach((source) => {
      if (source.id === project.id) return;
      const relations = Array.isArray(source.meta.relations) ? source.meta.relations : [];
      relations.forEach((relation) => {
        if (!relation || typeof relation !== 'object') return;
        if (String(relation.project || '') !== project.id) return;
        records.push({
          projectId: source.id,
          type: String(relation.type || 'related'),
          note: String(relation.note || ''),
          direction: 'in'
        });
      });
    });

    const deduped = new Map();
    records.forEach((record) => {
      const type = record.type.toLowerCase();
      const key = SYMMETRIC_RELATIONS.has(type)
        ? `${record.projectId}:${type}`
        : `${record.projectId}:${type}:${record.direction}`;
      if (!deduped.has(key)) deduped.set(key, record);
    });
    return [...deduped.values()];
  }

  function relationLabel(type, direction) {
    const normalized = String(type || 'related').toLowerCase();
    if (normalized === 'related') return 'related';
    if (normalized === 'integrates_with') return 'integrates with';
    if (normalized === 'depends_on') return direction === 'in' ? 'required by' : 'depends on';
    return normalized.replace(/_/g, ' ');
  }

  function renderRelations(project) {
    const relations = relationRecords(project);
    if (!relations.length) return '';
    const rows = relations.map((relation) => {
      const target = allProjects.find((item) => recordType(item) === 'project' && item.id === relation.projectId);
      const missing = !target;
      const archived = target?.meta?.status === 'archived';
      const title = target?.title || relation.projectId;
      const state = missing ? 'MISSING' : archived ? 'ARCHIVED' : '';
      const body = `<span class="relation-main"><span class="relation-title">${esc(title)}</span><span class="relation-type">${esc(relationLabel(relation.type, relation.direction))}</span>${relation.note ? `<span class="relation-note">${esc(relation.note)}</span>` : ''}</span>${state ? `<span class="relation-state ${missing ? 'missing' : 'archived'}">${state}</span>` : ''}`;
      if (missing) return `<div class="relation-row missing">${body}</div>`;
      return `<button class="relation-row" type="button" data-record-key="${esc(recordKey(target))}">${body}</button>`;
    }).join('');
    return `<section class="detail-section">
      <div class="detail-section-label">RELATED PROJECTS</div>
      <div class="relation-list">${rows}</div>
    </section>`;
  }

  function renderProjectLinks(project) {
    const links = [projectSourceLink(project), repositoryLink(project.meta.repository), workspaceLink(project.meta.workspace)].filter(Boolean).join('');
    if (!links) return '';
    return `<section class="detail-section detail-links-section">
      <div class="detail-section-label">${recordTypeLong(project).toUpperCase()} LINKS</div>
      <div class="detail-links">${links}</div>
    </section>`;
  }

  function bindDetailView(project) {
    const tabs = [...detailContent.querySelectorAll('[data-project-view]')];
    const views = {
      overview: detailContent.querySelector('#projectOverview'),
      town: detailContent.querySelector('#projectTownView')
    };
    const selectView = (name) => {
      tabs.forEach((tab) => {
        const active = tab.dataset.projectView === name;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      Object.entries(views).forEach(([key, view]) => {
        if (view) view.hidden = key !== name;
      });
      if (name !== 'town' || !views.town || views.town.dataset.rendered === 'true') return;
      if (!statusModel || !statusView) {
        views.town.innerHTML = '<div class="town-view-error">STATUS VIEWを読み込めませんでした。</div>';
        return;
      }
      try {
        views.town.innerHTML = statusView.renderTownStatus(project, statusModel);
        views.town.dataset.rendered = 'true';
      } catch (error) {
        console.error('Project Town view failed', error);
        views.town.innerHTML = '<div class="town-view-error">Project statusを表示できませんでした。</div>';
      }
    };
    tabs.forEach((tab) => tab.addEventListener('click', () => selectView(tab.dataset.projectView)));
    selectView('overview');
  }

  function showProject(key, updateHash = true) {
    const project = recordByKey(key);
    if (!project) return;
    const keyForProject = recordKey(project);
    if (selectedKey !== keyForProject) stashProjectMemoDraft();
    selectedKey = keyForProject;
    renderList();

    const tags = projectTags(project).map((tag) => `<span class="tag${String(tag).toLowerCase() === 'must' ? ' must' : ''}">${esc(tag)}</span>`).join('');
    const sheets = sheetsValue(project);
    const parts = detailParts(project);
    const isAssignment = recordType(project) === 'assignment';

    detailContent.innerHTML = `
      <button class="detail-back" id="detailBack" type="button">← PJ / ASSIGN</button>
      <div class="detail-title-row">
        <div>
          <div class="detail-kind-row">${recordTypeBadge(project, true)}</div>
          <h1 class="detail-title">${esc(project.title)}</h1>
          <div class="detail-meta"><span>${esc(project.meta.last_touched || '—')}</span><span>${esc(project.meta.status || 'backstage')}</span><span>${tags}</span>${areaLabel(project, true)}</div>
        </div>
        ${isAssignment ? '' : `<div class="detail-meter" aria-label="${sheets} sheets / ${SHEETS_FULL_SCALE}">
        <div class="detail-meter-box"><div class="detail-meter-fill" style="width:${fillPercent(project)}%"></div></div>
          <div class="detail-meter-label">${sheets} / ${SHEETS_FULL_SCALE} sheets</div>
        </div>`}
      </div>
      <div class="detail-view-tabs" role="tablist" aria-label="${recordTypeLong(project)} view">
        <button class="detail-view-tab active" type="button" role="tab" aria-selected="true" data-project-view="overview">OVERVIEW</button>
        ${isAssignment ? '' : '<button class="detail-view-tab" type="button" role="tab" aria-selected="false" data-project-view="town">TOWN / STATUS</button>'}
      </div>
      <div id="projectOverview" class="project-detail-view">
        ${parts.resume ? `<div class="markdown detail-resume">${renderMarkdown(parts.resume)}</div>` : ''}
        ${renderWorkstreams(project)}
        ${renderRelations(project)}
        ${renderProjectLinks(project)}
        ${parts.rest ? `<div class="markdown detail-rest">${renderMarkdown(parts.rest)}</div>` : ''}
      </div>
      <div id="projectTownView" class="project-detail-view" hidden></div>`;

    detailEmpty.hidden = true;
    detailContent.hidden = false;
    bindDetailView(project);
    document.body.classList.add('detail-open');
    $('detailBack')?.addEventListener('click', closeMobileDetail);
    if (document.body.classList.contains('memo-open')) loadProjectMemo(project);
    if (updateHash) history.replaceState(null, '', `#${encodeURIComponent(recordKey(project))}`);
  }

  function closeMobileDetail() {
    document.body.classList.remove('detail-open');
    if (window.innerWidth <= 820) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function bindEvents() {
    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin) return;
      if (event.data?.type !== 'cockpid:open-project-memo') return;
      openProjectMemo();
    });
    memoClose?.addEventListener('click', closeProjectMemo);
    memoSave?.addEventListener('click', saveProjectMemo);
    memoText?.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        saveProjectMemo();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeProjectMemo();
      }
    });
    document.addEventListener('click', (event) => {
      const areaButton = event.target.closest?.('[data-area-id]');
      if (areaButton?.classList.contains('area-branch')) {
        event.preventDefault();
        const areaId = areaButton.dataset.areaId;
        const target = [...list.querySelectorAll('[data-record-key]')].find((node) => {
          const project = recordByKey(node.dataset.recordKey);
          return areaFor(project)?.id === areaId;
        });
        target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      const button = event.target.closest?.('[data-record-key]');
      if (!button || button.tagName !== 'BUTTON') return;
      showProject(button.dataset.recordKey);
    });
    reloadButton.addEventListener('click', loadProjects);
  }

  async function loadProjects() {
    reloadButton.disabled = true;
    status.classList.remove('error');
    status.textContent = 'Area / Project / Assignment を読んでいます…';
    list.innerHTML = '';
    selectedKey = '';
    memoRecordKey = '';
    closeProjectMemo();
    detailContent.hidden = true;
    detailEmpty.hidden = false;
    document.body.classList.remove('detail-open');

    try {
      const result = window.COCKPID_AREA_VIEW?.loadWithFallback
        ? await window.COCKPID_AREA_VIEW.loadWithFallback({ cache: 'no-store' }, loadLegacyProjects)
        : { kind: 'project', fallback: true, source: null, view: await loadLegacyProjects() };
      areaView = result.kind === 'area' ? result.view : null;
      const loaded = result.kind === 'area'
        ? areaProjectRecords(result.view, result.source)
        : legacyProjectRecords(result.view, result.source);

      allProjects = loaded.filter(Boolean).sort((a, b) => {
        const byDate = String(b.meta.last_touched || '').localeCompare(String(a.meta.last_touched || ''));
        return byDate || a.title.localeCompare(b.title, 'ja');
      });
      projects = allProjects.filter(isBackstageVisible);

      renderDesk();
      renderList();
      const projectTotal = projects.filter((item) => recordType(item) === 'project').length;
      const assignmentTotal = projects.filter((item) => recordType(item) === 'assignment').length;
      const closedAssignmentTotal = allProjects.filter(isClosedAssignment).length;
      const hiddenAssignmentLabel = closedAssignmentTotal ? ` · ${closedAssignmentTotal} closed hidden` : '';
      status.textContent = result.kind === 'area'
        ? `${projectTotal} projects · ${assignmentTotal} assignments${hiddenAssignmentLabel} · Area-first index`
        : `${projectTotal} projects · Project fallback`;

      const hashKey = decodeURIComponent(location.hash.replace(/^#/, ''));
      if (hashKey && recordByKey(hashKey)) {
        showProject(hashKey, false);
      } else if (window.innerWidth > 820 && projects[0]) {
        showProject(recordKey(projects[0]), false);
      }
    } catch (error) {
      console.error(error);
      allProjects = [];
      projects = [];
      renderDesk();
      renderList();
      status.textContent = `読み込み失敗 · ${error.message || error}`;
      status.classList.add('error');
    } finally {
      reloadButton.disabled = false;
    }
  }

  function areaProjectRecords(view, source) {
    const areas = Array.isArray(view?.areas) ? view.areas : [];
    const collect = (bucket, area, type) => (Array.isArray(bucket) ? bucket : []).map((item) => ({ ...item, area, source, recordType: type }));
    const nested = areas.flatMap((area) => [
      ...collect(area.projects, area, 'project'),
      ...collect(area.assignments, area, 'assignment')
    ]);
    const unassigned = [
      ...collect(view?.unassigned?.projects, null, 'project'),
      ...collect(view?.unassigned?.assignments, null, 'assignment')
    ];
    return nested.concat(unassigned).map((item) => {
      const type = item.recordType === 'assignment' ? 'assignment' : 'project';
      const dir = type === 'assignment' ? 'assignments' : 'projects';
      return {
        id: String(item.id),
        title: String(item.title || item.id),
        recordType: type,
        meta: { ...item, type },
        body: String(item.body_markdown || item.body || ''),
        path: item.path || item.object_path || `objects/${dir}/${item.id}.md`,
        area: item.area || null,
        source: item.source || source
      };
    });
  }

  function legacyProjectRecords(view, source) {
    return (Array.isArray(view?.projects) ? view.projects : []).map((project) => ({
      id: String(project.id),
      title: String(project.title || project.id),
      recordType: 'project',
      meta: { ...project, type: project.type || 'project' },
      body: String(project.body_markdown || project.body || ''),
      path: project.path || project.object_path || `projects/${project.id}.md`,
      source
    }));
  }

  async function loadLegacyProjects() {
    if (window.COCKPID_PROJECT_VIEW?.load && window.COCKPID_PROJECT_SOURCE?.mode === 'view') {
      return window.COCKPID_PROJECT_VIEW.load({ cache: 'no-store' });
    }
    const entries = await apiJson(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${PROJECT_DIR}?ref=${BRANCH}`);
    const candidates = (Array.isArray(entries) ? entries : []).filter(isCandidate);
    const loaded = await Promise.all(candidates.map(async (entry) => {
      try { return await fetchProject(entry); }
      catch (error) {
        console.warn('Backstage project skip', entry.path, error);
        return null;
      }
    }));
    return { projects: loaded.filter(Boolean) };
  }

  window.COCKPID_BACKSTAGE = Object.freeze({ loadProjects, showProject });
  bindEvents();
  if (!window.__COCKPID_BACKSTAGE_NO_AUTOLOAD__) loadProjects();
})();
