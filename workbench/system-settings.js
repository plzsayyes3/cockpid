(() => {
  'use strict';

  const READ_KEY = 'cockpid.advice.read.v1';
  const systemOpen = document.getElementById('systemOpen');
  const mailOpen = document.getElementById('mailOpen');
  const mailUnread = document.getElementById('mailUnread');
  const navButtons = [...document.querySelectorAll('[data-settings-section]')];
  const panels = [...document.querySelectorAll('[data-settings-panel]')];
  const sourceApi = window.COCKPID_SOURCES || null;

  const SOURCE_ROWS = [
    { key: 'daily', label: 'Daily Note', state: 'STORED' },
    { key: 'techo', label: 'Techo / Calendar', state: 'LIVE' },
    { key: 'inbox', label: 'Inbox', state: 'LIVE' },
    { key: 'memo', label: 'Short Memo', state: 'LIVE' },
    { key: 'projects', label: 'Project root', state: 'STORED' },
    { key: 'taskliner', label: 'TaskLiner data', state: 'STORED' }
  ];

  const escHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function activate(section) {
    navButtons.forEach((button) => {
      const active = button.dataset.settingsSection === section;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.settingsPanel === section));
  }

  navButtons.forEach((button) => button.addEventListener('click', () => activate(button.dataset.settingsSection)));

  if (systemOpen) {
    const syncLabel = () => {
      const hasToken = Boolean(token());
      systemOpen.title = hasToken ? 'Settings · connected' : 'Settings · GitHub token required';
      systemOpen.setAttribute('aria-label', systemOpen.title);
    };
    syncLabel();
    if (!token()) activate('github');
  }

  function renderSourceSettings() {
    const panel = document.querySelector('[data-settings-panel="paths"]');
    const list = panel?.querySelector('.path-list');
    if (!panel || !list || !sourceApi) return;

    const intro = panel.querySelector('p');
    if (intro) intro.textContent = 'Repository と Folder を指定します。未設定・不正な設定は従来の保存先へフォールバックします。';

    const sources = sourceApi.all();
    list.innerHTML = SOURCE_ROWS.map((row) => {
      const source = sources[row.key];
      const stateLabel = row.state === 'LIVE' ? 'LIVE' : 'SAVED FOR NEXT';
      return `<div class="source-row" data-source-key="${row.key}">
        <div class="source-meta"><span>${escHtml(row.label)}</span><small class="source-state ${row.state === 'LIVE' ? 'live' : ''}">${stateLabel}</small></div>
        <label class="source-field"><span>Repository</span><input class="source-repo" type="text" autocomplete="off" spellcheck="false" value="${escHtml(source.repo)}"></label>
        <label class="source-field source-folder"><span>Folder</span><input class="source-dir" type="text" autocomplete="off" spellcheck="false" value="${escHtml(source.dir)}"></label>
        <button class="source-check" type="button">CHECK</button>
        <span class="source-check-status" aria-live="polite"></span>
      </div>`;
    }).join('') + `<div class="source-actions">
      <span class="source-save-status" id="sourceSaveStatus" aria-live="polite">LOCAL SETTINGS</span>
      <button class="token-btn" id="sourceDefaults" type="button">LOAD DEFAULTS</button>
      <button class="token-btn primary" id="sourceSave" type="button">SAVE &amp; RELOAD</button>
    </div>`;

    list.querySelectorAll('.source-check').forEach((button) => {
      button.addEventListener('click', () => checkSource(button.closest('.source-row')));
    });
    document.getElementById('sourceDefaults')?.addEventListener('click', () => {
      fillSourceInputs(sourceApi.defaults());
      setSourceSaveStatus('DEFAULTS LOADED · NOT SAVED');
    });
    document.getElementById('sourceSave')?.addEventListener('click', saveSources);
  }

  function setSourceSaveStatus(message, error = false) {
    const status = document.getElementById('sourceSaveStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', error);
  }

  function fillSourceInputs(sources) {
    document.querySelectorAll('.source-row[data-source-key]').forEach((row) => {
      const source = sources[row.dataset.sourceKey];
      if (!source) return;
      const repo = row.querySelector('.source-repo');
      const dir = row.querySelector('.source-dir');
      if (repo) repo.value = source.repo;
      if (dir) dir.value = source.dir;
      const state = row.querySelector('.source-check-status');
      if (state) state.textContent = '';
    });
  }

  function readSourceInputs() {
    const next = {};
    document.querySelectorAll('.source-row[data-source-key]').forEach((row) => {
      next[row.dataset.sourceKey] = {
        repo: row.querySelector('.source-repo')?.value || '',
        dir: row.querySelector('.source-dir')?.value || ''
      };
    });
    return next;
  }

  async function checkSource(row) {
    if (!row || !sourceApi) return;
    const status = row.querySelector('.source-check-status');
    const button = row.querySelector('.source-check');
    const candidate = {
      repo: row.querySelector('.source-repo')?.value || '',
      dir: row.querySelector('.source-dir')?.value || ''
    };
    const validation = sourceApi.validate(candidate);
    if (!validation.ok) {
      if (status) status.textContent = validation.error;
      return;
    }
    if (!token()) {
      if (status) status.textContent = 'TOKEN REQUIRED';
      return;
    }
    if (button) button.disabled = true;
    if (status) status.textContent = 'CHECKING…';
    try {
      const result = await gh(validation.value.dir, validation.value.repo);
      if (status) status.textContent = result == null ? 'NOT FOUND' : Array.isArray(result) ? `FOUND · ${result.length} items` : 'FOUND';
    } catch (error) {
      console.error('source check', error);
      if (status) status.textContent = String(error?.message || error).toUpperCase();
    } finally {
      if (button) button.disabled = false;
    }
  }

  function saveSources() {
    if (!sourceApi) return;
    try {
      sourceApi.saveAll(readSourceInputs());
      setSourceSaveStatus('SAVED · RELOADING');
      setTimeout(() => window.location.reload(), 240);
    } catch (error) {
      setSourceSaveStatus(String(error?.message || error), true);
    }
  }

  function readSet() {
    try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')); }
    catch (_) { return new Set(); }
  }

  function setMailState(unread, error = false) {
    if (!mailOpen || !mailUnread) return;
    const count = Math.max(0, Number(unread) || 0);
    mailOpen.classList.toggle('has-unread', count > 0);
    mailOpen.classList.toggle('mail-error', error);
    mailUnread.hidden = count === 0;
    mailUnread.textContent = count > 99 ? '99+' : String(count);
    const label = error ? 'Mail · unavailable' : count > 0 ? `Mail · ${count} unread` : 'Mail · no unread';
    mailOpen.title = label;
    mailOpen.setAttribute('aria-label', label);
  }

  async function refreshMail() {
    if (!mailOpen || !mailUnread) return;
    if (!token()) {
      setMailState(0, false);
      mailOpen.title = 'Mail · GitHub token required';
      mailOpen.setAttribute('aria-label', mailOpen.title);
      return;
    }
    try {
      const rows = await gh('advice', 'my-storage-note');
      const files = (Array.isArray(rows) ? rows : []).filter((row) => row.type === 'file' && /\.md$/i.test(row.name));
      const read = readSet();
      setMailState(files.filter((file) => !read.has(file.name)).length, false);
    } catch (error) {
      console.error('mail status', error);
      setMailState(0, true);
    }
  }

  mailOpen?.addEventListener('click', (event) => {
    event.preventDefault();
    if (window.COCKPID_ROUTER?.openApp) window.COCKPID_ROUTER.openApp('advice');
    else window.location.href = 'advice.html';
  });

  window.addEventListener('storage', (event) => {
    if (event.key === READ_KEY || event.key === 'zen-note-github-token') refreshMail();
  });
  window.addEventListener('focus', refreshMail);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshMail(); });
  setInterval(refreshMail, 60000);
  renderSourceSettings();
  refreshMail();
})();
