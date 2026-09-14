(() => {
  const listEl = document.getElementById('adviceList');
  const bodyEl = document.getElementById('messageBody');
  const metaEl = document.getElementById('messageMeta');
  const mailbox = document.getElementById('mailbox');
  const countEl = document.getElementById('adviceCount');
  const unreadEl = document.getElementById('unreadCount');
  const backBtn = document.getElementById('messageBack');
  const READ_KEY = 'cockpid.advice.read.v1';
  const PENDING_KEY = 'cockpid.advice.read.pending.v1';
  const REMOTE_PATH = 'app-state/cockpid/message-state.json';
  const REMOTE_REPO = 'my-storage-note';
  const REMOTE_BRANCH = 'main';
  const OWNER = 'plzsayyes3';
  const PUSH_DEBOUNCE_MS = 1200;
  let files = [];
  let activeName = '';
  let pushTimer = null;
  let syncPromise = null;
  let pushAgain = false;

  function readSet() {
    try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')); }
    catch (_) { return new Set(); }
  }

  function saveRead(set) {
    localStorage.setItem(READ_KEY, JSON.stringify([...set].sort()));
    window.dispatchEvent(new Event('cockpid:advice-read-state'));
  }

  function readPending() {
    try {
      const value = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (_) { return {}; }
  }

  function savePending(value) {
    const next = value && typeof value === 'object' ? value : {};
    if (Object.keys(next).length) localStorage.setItem(PENDING_KEY, JSON.stringify(next));
    else localStorage.removeItem(PENDING_KEY);
  }

  function encodeUtf8Base64(value) {
    const bytes = new TextEncoder().encode(String(value ?? ''));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function decodeUtf8Base64(value) {
    const binary = atob(String(value || '').replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  }

  function normalizeRemoteRead(data) {
    const source = data?.read;
    const out = {};
    if (Array.isArray(source)) {
      source.forEach((name) => { if (name) out[name] = ''; });
      return out;
    }
    if (!source || typeof source !== 'object') return out;
    Object.entries(source).forEach(([name, at]) => { if (name) out[name] = typeof at === 'string' ? at : ''; });
    return out;
  }

  function mergeReadMaps(...maps) {
    const out = {};
    maps.forEach((map) => {
      Object.entries(map || {}).forEach(([name, at]) => {
        if (!name) return;
        if (!out[name] || (at && String(at) > String(out[name]))) out[name] = at || out[name] || '';
      });
    });
    return out;
  }

  function localReadMap() {
    const out = {};
    readSet().forEach((name) => { out[name] = ''; });
    return out;
  }

  async function fetchRemoteState() {
    if (!token()) return null;
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REMOTE_REPO}/contents/${REMOTE_PATH}?ref=${REMOTE_BRANCH}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token()}`
      },
      cache: 'no-store'
    });
    if (response.status === 404) return { sha: null, read: {} };
    if (!response.ok) throw new Error(`message state read ${response.status}`);
    const payload = await response.json();
    const data = JSON.parse(decodeUtf8Base64(payload.content) || '{}');
    return { sha: payload.sha || null, read: normalizeRemoteRead(data) };
  }

  async function putRemoteState(read, sha = null) {
    const payload = {
      schema_version: 1,
      updated_at: new Date().toISOString(),
      read
    };
    const body = {
      message: 'cockpid: sync message read state',
      content: encodeUtf8Base64(`${JSON.stringify(payload, null, 2)}\n`),
      branch: REMOTE_BRANCH
    };
    if (sha) body.sha = sha;
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REMOTE_REPO}/contents/${REMOTE_PATH}`, {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (response.status === 409 || response.status === 422) {
      const error = new Error(`message state conflict ${response.status}`);
      error.conflict = true;
      throw error;
    }
    if (!response.ok) throw new Error(`message state write ${response.status}`);
  }

  function applyReadMap(map) {
    const next = new Set([...readSet(), ...Object.keys(map || {})]);
    saveRead(next);
    if (files.length) renderList();
  }

  function schedulePush() {
    if (!token()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushReadState().catch((error) => console.warn('message read-state push failed', error)), PUSH_DEBOUNCE_MS);
  }

  async function pushReadState() {
    if (!token()) return;
    if (syncPromise) {
      pushAgain = true;
      return syncPromise;
    }
    syncPromise = (async () => {
      const pendingSnapshot = readPending();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const remote = await fetchRemoteState();
        if (!remote) return;
        const merged = mergeReadMaps(remote.read, localReadMap(), pendingSnapshot);
        applyReadMap(merged);
        try {
          const same = Object.keys(merged).every((name) => Object.prototype.hasOwnProperty.call(remote.read, name))
            && Object.keys(remote.read).every((name) => Object.prototype.hasOwnProperty.call(merged, name));
          if (!same) await putRemoteState(merged, remote.sha);
          const current = readPending();
          Object.keys(pendingSnapshot).forEach((name) => { delete current[name]; });
          savePending(current);
          if (Object.keys(current).length) schedulePush();
          return;
        } catch (error) {
          if (!error.conflict || attempt === 2) throw error;
        }
      }
    })().finally(() => {
      syncPromise = null;
      if (pushAgain) {
        pushAgain = false;
        schedulePush();
      }
    });
    return syncPromise;
  }

  async function pullReadState() {
    if (!token()) return;
    try {
      const remote = await fetchRemoteState();
      if (!remote) return;
      const pending = readPending();
      const merged = mergeReadMaps(remote.read, localReadMap(), pending);
      applyReadMap(merged);
      const needsPush = Object.keys(merged).some((name) => !Object.prototype.hasOwnProperty.call(remote.read, name));
      if (needsPush) schedulePush();
    } catch (error) {
      console.warn('message read-state pull failed', error);
    }
  }

  function markRead(name) {
    const read = readSet();
    if (!read.has(name)) {
      read.add(name);
      saveRead(read);
    }
    const pending = readPending();
    if (!pending[name]) {
      pending[name] = new Date().toISOString();
      savePending(pending);
    }
    schedulePush();
  }

  function dateLabel(name) {
    const m = /^(\d{4})-(\d{2})-(\d{2})\.md$/.exec(name);
    return m ? `${m[1]}.${m[2]}.${m[3]}` : name.replace(/\.md$/, '');
  }

  function stripHeading(text) {
    return text.replace(/^[^一-龯ぁ-んァ-ンA-Za-z0-9]+/, '').trim();
  }

  function inline(text) {
    return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function renderMarkdown(markdown) {
    const lines = markdown.split(/\r?\n/);
    let html = '';
    let inList = false;
    let inSection = false;
    const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
    const closeSection = () => { closeList(); if (inSection) { html += '</section>'; inSection = false; } };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || /^>\s*\[!tip\]/i.test(line)) { closeList(); continue; }
      if (line.startsWith('### ')) {
        closeSection();
        html += `<section><h2>${inline(stripHeading(line.slice(4)))}</h2>`;
        inSection = true;
        continue;
      }
      if (line.startsWith('- ')) {
        if (!inSection) { html += '<section>'; inSection = true; }
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${inline(line.slice(2))}</li>`;
        continue;
      }
      closeList();
      if (!inSection) { html += '<section>'; inSection = true; }
      html += `<p>${inline(line)}</p>`;
    }
    closeSection();
    return html || '<div class="empty-message">本文がありません。</div>';
  }

  function updateCounts() {
    const read = readSet();
    const unread = files.filter((file) => !read.has(file.name)).length;
    countEl.textContent = `${files.length} MAIL`;
    unreadEl.textContent = `${unread} unread`;
  }

  function renderList() {
    const read = readSet();
    listEl.innerHTML = files.map((file) => `
      <button class="mail-item${read.has(file.name) ? '' : ' unread'}${activeName === file.name ? ' active' : ''}" data-name="${esc(file.name)}">
        <span class="date">${esc(dateLabel(file.name))}</span>
        <span class="subject">AIからのアドバイス</span>
      </button>`).join('');
    listEl.querySelectorAll('.mail-item').forEach((button) => button.addEventListener('click', () => openMessage(button.dataset.name, true)));
    updateCounts();
  }

  async function openMessage(name, mobileOpen = false) {
    const file = files.find((item) => item.name === name);
    if (!file) return;
    activeName = name;
    metaEl.textContent = `${dateLabel(name)}  /  my-storage-note/advice/${name}`;
    bodyEl.innerHTML = '<div class="loading">本文を読み込んでいます…</div>';
    if (mobileOpen) mailbox.classList.add('message-open');
    markRead(name);
    renderList();
    try {
      const payload = await gh(file.path, 'my-storage-note');
      if (!payload?.content) throw new Error('advice content not found');
      bodyEl.innerHTML = renderMarkdown(decode(payload.content));
    } catch (error) {
      console.error(error);
      bodyEl.innerHTML = `<div class="error">${esc(String(error?.message || error))}</div>`;
    }
  }

  async function loadInbox() {
    if (!token()) {
      listEl.innerHTML = '<div class="error">GitHub token が必要です。</div>';
      bodyEl.innerHTML = '<div class="empty-message">Workbenchで使っているtokenを共有します。</div>';
      return;
    }
    try {
      await pullReadState();
      const rows = await gh('advice', 'my-storage-note');
      files = (Array.isArray(rows) ? rows : []).filter((row) => row.type === 'file' && /\.md$/i.test(row.name)).sort((a, b) => b.name.localeCompare(a.name));
      if (!files.length) {
        listEl.innerHTML = '<div class="loading">まだアドバイスはありません。</div>';
        updateCounts();
        return;
      }
      renderList();
      if (window.matchMedia('(min-width: 761px)').matches) openMessage(files[0].name, false);
    } catch (error) {
      console.error(error);
      listEl.innerHTML = `<div class="error">${esc(String(error?.message || error))}</div>`;
    }
  }

  backBtn.addEventListener('click', () => mailbox.classList.remove('message-open'));
  window.addEventListener('popstate', () => mailbox.classList.remove('message-open'));
  window.addEventListener('online', pullReadState);
  window.addEventListener('focus', pullReadState);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pullReadState(); });
  loadInbox();
})();
