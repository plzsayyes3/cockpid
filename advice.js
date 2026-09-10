(() => {
  const listEl = document.getElementById('adviceList');
  const bodyEl = document.getElementById('messageBody');
  const metaEl = document.getElementById('messageMeta');
  const mailbox = document.getElementById('mailbox');
  const countEl = document.getElementById('adviceCount');
  const unreadEl = document.getElementById('unreadCount');
  const backBtn = document.getElementById('messageBack');
  const READ_KEY = 'cockpid.advice.read.v1';
  let files = [];
  let activeName = '';

  function readSet() {
    try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')); }
    catch (_) { return new Set(); }
  }

  function saveRead(set) {
    localStorage.setItem(READ_KEY, JSON.stringify([...set]));
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
    const read = readSet();
    read.add(name);
    saveRead(read);
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
  loadInbox();
})();
