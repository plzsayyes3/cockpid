(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const REPO = 'gpts';
  const BRANCH = 'main';
  const PROJECT_DIR = 'projects';
  const TOKEN_KEY = 'zen-note-github-token';
  const SYMMETRIC_RELATIONS = new Set(['related', 'integrates_with']);

  const $ = (id) => document.getElementById(id);
  const list = $('projectList');
  const deskItems = $('deskItems');
  const deskCount = $('deskCount');
  const projectCount = $('projectCount');
  const status = $('loadStatus');
  const reloadButton = $('reloadBtn');
  const detailContent = $('detailContent');
  const detailEmpty = $('detailEmpty');

  let allProjects = [];
  let projects = [];
  let selectedId = '';

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  const token = () => localStorage.getItem(TOKEN_KEY) || '';

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
    return Math.min(100, Math.max(0, sheetsValue(project)));
  }

  function projectTags(project) {
    const tags = Array.isArray(project.meta.tags) ? project.meta.tags : [];
    const commitment = String(project.meta.commitment || '');
    const values = [...tags.slice(0, 2)];
    if (commitment && commitment !== 'none') values.unshift(commitment);
    return values;
  }

  function renderDesk() {
    const desk = projects.filter((project) => project.meta.desk === true);
    deskCount.textContent = String(desk.length);
    if (!desk.length) {
      deskItems.innerHTML = '<span class="quiet">重点的に扱うProjectだけ、ここに出ます。</span>';
      return;
    }
    deskItems.innerHTML = desk.map((project) => `<button class="desk-chip" type="button" data-project-id="${esc(project.id)}">${esc(project.title)}</button>`).join('');
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
      const sheets = sheetsValue(project);
      return `<button class="project-card${selectedId === project.id ? ' active' : ''}" type="button" data-project-id="${esc(project.id)}" style="--fill-width:${fillPercent(project)}%">
        <span class="project-fill" aria-hidden="true"></span>
        <span class="project-inner">
          <span class="project-top"><span class="project-title">${esc(project.title)}</span><span class="project-age">${esc(touchedLabel(project.meta.last_touched))}</span></span>
          ${current ? `<span class="project-current">${esc(current)}</span>` : ''}
          <span class="project-foot"><span class="tags">${tagHtml}</span><span class="sheets">${sheets} / 100</span></span>
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

  function githubPath(path, mode = 'blob') {
    const value = String(path || '').trim().replace(/^\/+|\/+$/g, '');
    if (!value) return '';
    const encoded = value.split('/').map((part) => encodeURIComponent(part)).join('/');
    return `https://github.com/${OWNER}/${REPO}/${mode}/${BRANCH}/${encoded}`;
  }

  function projectSourceLink(project) {
    const url = githubPath(project?.path, 'blob');
    if (!url) return '';
    return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">PROJECT ↗</a>`;
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
      const target = allProjects.find((item) => item.id === relation.projectId);
      const missing = !target;
      const archived = target?.meta?.status === 'archived';
      const title = target?.title || relation.projectId;
      const state = missing ? 'MISSING' : archived ? 'ARCHIVED' : '';
      const body = `<span class="relation-main"><span class="relation-title">${esc(title)}</span><span class="relation-type">${esc(relationLabel(relation.type, relation.direction))}</span>${relation.note ? `<span class="relation-note">${esc(relation.note)}</span>` : ''}</span>${state ? `<span class="relation-state ${missing ? 'missing' : 'archived'}">${state}</span>` : ''}`;
      if (missing) return `<div class="relation-row missing">${body}</div>`;
      return `<button class="relation-row" type="button" data-project-id="${esc(target.id)}">${body}</button>`;
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
      <div class="detail-section-label">PROJECT LINKS</div>
      <div class="detail-links">${links}</div>
    </section>`;
  }

  function showProject(id, updateHash = true) {
    const project = allProjects.find((item) => item.id === id);
    if (!project) return;
    selectedId = id;
    renderList();

    const tags = projectTags(project).map((tag) => `<span class="tag${String(tag).toLowerCase() === 'must' ? ' must' : ''}">${esc(tag)}</span>`).join('');
    const sheets = sheetsValue(project);
    const parts = detailParts(project);

    detailContent.innerHTML = `
      <button class="detail-back" id="detailBack" type="button">← BACKSTAGE</button>
      <div class="detail-title-row">
        <div>
          <h1 class="detail-title">${esc(project.title)}</h1>
          <div class="detail-meta"><span>${esc(project.meta.last_touched || '—')}</span><span>${esc(project.meta.status || 'backstage')}</span><span>${tags}</span></div>
        </div>
        <div class="detail-meter" aria-label="${sheets} sheets / 100">
          <div class="detail-meter-box"><div class="detail-meter-fill" style="width:${fillPercent(project)}%"></div></div>
          <div class="detail-meter-label">${sheets} / 100 sheets</div>
        </div>
      </div>
      ${parts.resume ? `<div class="markdown detail-resume">${renderMarkdown(parts.resume)}</div>` : ''}
      ${renderWorkstreams(project)}
      ${renderRelations(project)}
      ${renderProjectLinks(project)}
      ${parts.rest ? `<div class="markdown detail-rest">${renderMarkdown(parts.rest)}</div>` : ''}`;

    detailEmpty.hidden = true;
    detailContent.hidden = false;
    document.body.classList.add('detail-open');
    $('detailBack')?.addEventListener('click', closeMobileDetail);
    if (updateHash) history.replaceState(null, '', `#${encodeURIComponent(project.id)}`);
  }

  function closeMobileDetail() {
    document.body.classList.remove('detail-open');
    if (window.innerWidth <= 820) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-project-id]');
      if (!button) return;
      showProject(button.dataset.projectId);
    });
    reloadButton.addEventListener('click', loadProjects);
  }

  async function loadProjects() {
    reloadButton.disabled = true;
    status.classList.remove('error');
    status.textContent = 'gpts / projects を読んでいます…';
    list.innerHTML = '';
    selectedId = '';
    detailContent.hidden = true;
    detailEmpty.hidden = false;
    document.body.classList.remove('detail-open');

    try {
      const entries = await apiJson(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${PROJECT_DIR}?ref=${BRANCH}`);
      const candidates = (Array.isArray(entries) ? entries : []).filter(isCandidate);
      const loaded = await Promise.all(candidates.map(async (entry) => {
        try { return await fetchProject(entry); }
        catch (error) { console.warn('Backstage project skip', entry.path, error); return null; }
      }));

      allProjects = loaded.filter(Boolean).sort((a, b) => {
        const byDate = String(b.meta.last_touched || '').localeCompare(String(a.meta.last_touched || ''));
        return byDate || a.title.localeCompare(b.title, 'ja');
      });
      projects = allProjects.filter((project) => project.meta.status !== 'archived');

      renderDesk();
      renderList();
      status.textContent = `${projects.length} projects · source: gpts/projects`;

      const hashId = decodeURIComponent(location.hash.replace(/^#/, ''));
      if (hashId && allProjects.some((project) => project.id === hashId)) {
        showProject(hashId, false);
      } else if (window.innerWidth > 820 && projects[0]) {
        showProject(projects[0].id, false);
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

  bindEvents();
  loadProjects();
})();
