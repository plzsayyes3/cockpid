(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const REPO = 'gpts';
  const BRANCH = 'main';
  const DIR = 'projects';
  const TOKEN_KEY = 'zen-note-github-token';
  const ROOM_LIMIT = 6;
  const REFRESH_MS = 30 * 60 * 1000;
  const CHATGPT_URL = 'https://chatgpt.com/';

  const Model = window.ProjectTownModel;
  const Motion = window.ProjectTownMotion;
  if (!Model || !Motion) {
    console.error('Project Town dependency missing', { Model: Boolean(Model), Motion: Boolean(Motion) });
    return;
  }

  const {
    escapeHtml: esc,
    decodeBase64Utf8,
    parseFrontmatter,
    isProjectCandidate,
    activity,
    momentum,
    motivation,
    decisionText,
    detailMessage,
    handoffPrompt
  } = Model;

  const $ = (id) => document.getElementById(id);
  const dom = Object.freeze({
    list: $('projectList'),
    room: $('projectRoom'),
    count: $('projectCount'),
    summary: $('townSummary'),
    detail: $('detailContent'),
    detailState: $('detailState'),
    reload: $('reloadBtn'),
    messageTitle: $('messageTitle'),
    messageText: $('messageText')
  });

  if (Object.values(dom).some((node) => !node)) {
    console.error('Project Town DOM is incomplete');
    return;
  }

  let projects = [];
  let selected = '';
  let lastRefreshAt = 0;
  let refreshTimer = 0;

  async function api(url) {
    const headers = { Accept: 'application/vnd.github+json' };
    const token = localStorage.getItem(TOKEN_KEY) || '';
    if (token) headers.Authorization = `Bearer ${token}`;

    let response = await fetch(url, { headers, cache: 'no-store' });
    if (!response.ok && token && (response.status === 403 || response.status === 404)) {
      response = await fetch(url, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store'
      });
    }

    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    return response.json();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    }
  }

  async function loadProject(entry) {
    const payload = await api(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${entry.path}?ref=${BRANCH}&_=${Date.now()}`
    );
    if (!payload.content) return null;

    const meta = parseFrontmatter(decodeBase64Utf8(payload.content));
    if (meta.type !== 'project' || meta.status === 'archived') return null;

    return {
      id: String(meta.id || entry.name.replace(/\.md$/, '')),
      title: String(meta.title || meta.id || entry.name),
      ...meta,
      path: entry.path
    };
  }

  function workerMarkup(project) {
    const currentActivity = activity(project);
    const currentMomentum = momentum(project);

    return `<button class="worker${selected === project.id ? ' active' : ''}" data-project-id="${esc(project.id)}" data-activity="${currentActivity.key}" data-momentum="${currentMomentum.key}" type="button" aria-label="${esc(project.title)} ${esc(currentActivity.label)}">
      <span class="worker-scene" aria-hidden="true"><span class="character-actor" data-direction="right"><span class="character-sprite" data-action="idle"></span><span class="character-effect"></span></span></span>
      <span class="bubble is-quiet"></span><span class="momentum-badge">${esc(currentMomentum.mark)}${currentMomentum.key === 'surging' ? '急' : ''}</span><span class="worker-state">${esc(currentActivity.label)}</span><span class="worker-name">${esc(project.title)}</span>
    </button>`;
  }

  function renderRoom() {
    dom.room.classList.add('town-shared-room');
    const people = projects.slice(0, ROOM_LIMIT).map(workerMarkup).join('');

    dom.room.innerHTML = `<span class="town-zone-label work">💻 作業エリア</span><span class="town-zone-label research">▥ 調査エリア</span><span class="town-zone-label wait">◷ 外部待ち</span><span class="town-zone-label review">成果物はこちらへ ↓</span><span class="town-work-desk"></span><span class="town-shelf"></span><span class="town-wait-spot"></span><span class="town-review-counter"></span><span class="town-rest-sofa"></span>${people || '<div class="room-loading">Projectがありません</div>'}`;

    Motion.start({
      room: dom.room,
      projects,
      activity,
      momentum
    });
  }

  function renderList() {
    dom.count.textContent = projects.length;
    dom.list.innerHTML = projects.map((project) => {
      const currentActivity = activity(project);
      const currentMomentum = momentum(project);

      return `<button class="project-row${selected === project.id ? ' active' : ''}" data-project-id="${esc(project.id)}" type="button"><span class="project-name">${esc(project.title)}</span><span class="state-chip" data-activity="${currentActivity.key}">${esc(currentActivity.label)}</span><span class="momentum-chip" data-momentum="${currentMomentum.key}">${esc(currentMomentum.mark)}${esc(currentMomentum.label)}</span></button>`;
    }).join('');
  }

  function syncSelection() {
    document.querySelectorAll('[data-project-id]').forEach((node) => {
      node.classList.toggle('active', node.dataset.projectId === selected);
    });
  }

  function showProject(id) {
    const project = projects.find((item) => item.id === id);
    if (!project) return;

    selected = id;
    const currentActivity = activity(project);
    const currentMomentum = momentum(project);
    const stars = motivation(project);
    const sheets = Math.max(0, Number(project.sheets || 0));
    const decision = decisionText(project, currentActivity);

    const decisionCard = currentActivity.key === 'review'
      ? `<div class="decision-card"><b>🎮 今あなたに必要なこと</b><p>${esc(decision)}</p><button type="button" class="handoff-button" data-handoff-id="${esc(project.id)}">ChatGPTで続きを指示する</button><small class="handoff-note">再開用の指示文をコピーして、新しいChatGPTを開きます。</small></div>`
      : `<div class="decision-card is-passive"><b>今あなたに必要なこと</b><p>${esc(decision)}</p></div>`;

    dom.detailState.textContent = `${currentActivity.label} · ${currentMomentum.mark}${currentMomentum.label}`;
    dom.detail.innerHTML = `<div class="detail-head"><div><h2>${esc(project.title)}</h2><div class="detail-meta">最終更新 ${esc(project.last_touched || '—')} · activity: ${esc(project.activity || '推定')}</div></div><span class="big-status" data-activity="${currentActivity.key}">${esc(currentActivity.label)}</span></div><div class="stat-grid"><div class="stat"><b>勢い</b><strong>${esc(currentMomentum.mark)}${esc(currentMomentum.label)}</strong></div><div class="stat"><b>やる気</b><strong>${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</strong></div><div class="stat"><b>SHEETS</b><strong>${sheets}</strong></div></div>${decisionCard}<div class="detail-block"><b>いま</b><p>${esc(project.current || 'まだCurrentは書かれていません。')}</p></div><div class="detail-block"><b>つぎ</b><p>${esc(project.next || 'まだNextは書かれていません。')}</p></div>`;

    dom.messageTitle.textContent = `「${project.title}」は ${currentActivity.label}。${currentMomentum.key === 'normal' ? '' : `${currentMomentum.mark}${currentMomentum.label}中。`}`;
    dom.messageText.textContent = detailMessage(currentActivity);
    syncSelection();
  }

  function updateSummary() {
    const working = projects.filter((project) => activity(project).key === 'working').length;
    const review = projects.filter((project) => activity(project).key === 'review').length;
    const surge = projects.filter((project) => momentum(project).key === 'surging').length;
    dom.summary.textContent = `作業 ${working} / あなた待ち ${review} / 急上昇 ${surge} / 全部 ${projects.length}`;
  }

  async function handleHandoff(id, button) {
    const project = projects.find((item) => item.id === id);
    if (!project) return;

    const copying = copyText(handoffPrompt(project));
    window.open(CHATGPT_URL, '_blank', 'noopener,noreferrer');
    const ok = await copying;

    if (!button) return;
    button.textContent = ok ? 'コピーしました → ChatGPTへ貼り付け' : 'ChatGPTを開きました';
    button.disabled = true;
    window.setTimeout(() => {
      button.textContent = 'ChatGPTで続きを指示する';
      button.disabled = false;
    }, 1600);
  }

  async function load({ silent = false } = {}) {
    if (!silent) {
      dom.reload.disabled = true;
      dom.summary.textContent = 'gpts / projects を読んでいます…';
    }

    try {
      const entries = await api(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${DIR}?ref=${BRANCH}&_=${Date.now()}`
      );

      const loaded = await Promise.all(
        (Array.isArray(entries) ? entries : [])
          .filter(isProjectCandidate)
          .map(async (entry) => {
            try {
              return await loadProject(entry);
            } catch (error) {
              console.warn('Project Town skip', entry.path, error);
              return null;
            }
          })
      );

      const previous = selected;
      projects = loaded
        .filter(Boolean)
        .sort((a, b) => String(b.last_touched || '').localeCompare(String(a.last_touched || '')));

      selected = projects.some((project) => project.id === previous)
        ? previous
        : (projects[0]?.id || '');

      lastRefreshAt = Date.now();
      renderRoom();
      renderList();
      updateSummary();
      if (selected) showProject(selected);
    } catch (error) {
      console.error(error);
      if (!projects.length) {
        dom.summary.textContent = `読み込み失敗 · ${error.message || error}`;
        dom.room.innerHTML = '<div class="room-loading">Projectを読み込めませんでした</div>';
      }
    } finally {
      dom.reload.disabled = false;
    }
  }

  function scheduleRefresh() {
    window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => {
      if (!document.hidden) load({ silent: true });
    }, REFRESH_MS);
  }

  document.addEventListener('click', (event) => {
    const handoff = event.target.closest?.('[data-handoff-id]');
    if (handoff) {
      event.preventDefault();
      event.stopPropagation();
      handleHandoff(handoff.dataset.handoffId, handoff);
      return;
    }

    const projectTrigger = event.target.closest?.('[data-project-id]');
    if (projectTrigger) showProject(projectTrigger.dataset.projectId);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      Motion.stop();
      return;
    }

    if (Date.now() - lastRefreshAt >= REFRESH_MS) {
      load({ silent: true });
    } else if (projects.length) {
      Motion.start({ room: dom.room, projects, activity, momentum });
    }
  });

  dom.reload.addEventListener('click', () => load());

  window.addEventListener('pagehide', () => {
    window.clearInterval(refreshTimer);
    Motion.stop();
  }, { once: true });

  load();
  scheduleRefresh();
})();
