(() => {
  const DEFAULT_MEMO_REPO = 'mynotebook';
  const DEFAULT_MEMO_DIR = '00_inbox';
  const el = (id) => document.getElementById(id);
  let projectMemoContext = '';

  function memoSource() {
    return window.COCKPID_SOURCES?.get('memo') || { repo: DEFAULT_MEMO_REPO, dir: DEFAULT_MEMO_DIR };
  }

  function joinPath(dir, child) {
    const base = String(dir || '').replace(/^\/+|\/+$/g, '');
    const tail = String(child || '').replace(/^\/+/, '');
    return base ? `${base}/${tail}` : tail;
  }

  function encodeApiPath(path) {
    return String(path || '').split('/').map(encodeURIComponent).join('/');
  }

  function syncMemoSourceLabel() {
    const source = memoSource();
    const label = document.querySelector('#memoCapturePanel .small') || document.querySelector('.drawer .small');
    if (label) label.textContent = `${source.repo} / ${source.dir} に新規メモとして保存します。`;
  }

  function zenPad(value) {
    return String(value).padStart(2, '0');
  }

  function zenStamp() {
    const d = new Date();
    return `${d.getFullYear()}${zenPad(d.getMonth() + 1)}${zenPad(d.getDate())}${zenPad(d.getHours())}${zenPad(d.getMinutes())}${zenPad(d.getSeconds())}`;
  }

  function encodeUtf8(value) {
    return btoa(unescape(encodeURIComponent(value)));
  }

  function prefillProjectMemo() {
    if (!projectMemoContext) return;
    const input = el('memoText');
    const prefix = `${projectMemoContext}: `;
    if (!input.value.startsWith(prefix)) input.value = `${prefix}${input.value}`;
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }

  function openZenMemo() {
    syncMemoSourceLabel();
    el('drawer').classList.add('open');
    el('drawerBackdrop').classList.add('open');
    el('tokenInput').value = token();
    prefillProjectMemo();
    setTimeout(() => {
      const input = el('memoText');
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }, 80);
  }

  function closeZenMemo() {
    el('drawer').classList.remove('open');
    el('drawerBackdrop').classList.remove('open');
  }

  function toggleTokenSettings(forceOpen = null) {
    const settings = el('tokenSettings');
    const open = forceOpen == null ? !settings.classList.contains('open') : forceOpen;
    settings.classList.toggle('open', open);
    el('tokenToggle').textContent = open ? '▾ 接続設定を隠す' : '▸ 接続設定を表示';
  }

  function saveToken() {
    const value = el('tokenInput').value.trim();
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
    el('memoStatus').textContent = value ? 'TOKEN SAVED' : 'TOKEN CLEARED';
    setTimeout(() => { el('memoStatus').textContent = 'READY'; }, 1600);
  }

  async function saveZenMemo() {
    const text = el('memoText').value.trim();
    const status = el('memoStatus');

    if (!text) {
      status.textContent = 'EMPTY';
      return;
    }

    const currentToken = token();
    if (!currentToken) {
      status.textContent = 'TOKEN REQUIRED';
      toggleTokenSettings(true);
      el('tokenInput').focus();
      return;
    }

    const source = memoSource();
    const name = `${zenStamp()}.md`;
    const path = joinPath(source.dir, name);
    status.textContent = 'POSTING…';
    el('memoSave').disabled = true;

    try {
      const payload = {
        message: `cockpid: zen memo ${name}`,
        content: encodeUtf8(`${text}\n`)
      };
      const response = await fetch(`https://api.github.com/repos/${OWNER}/${source.repo}/contents/${encodeApiPath(path)}`, {
        method: 'PUT',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`${source.repo} write ${response.status}`);

      status.textContent = `POSTED · ${name}`;
      el('memoText').value = '';
      setTimeout(() => { status.textContent = 'READY'; }, 2200);
    } catch (error) {
      console.error(error);
      status.textContent = String(error?.message || error).toUpperCase();
    } finally {
      el('memoSave').disabled = false;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.type !== 'cockpid:project-detail') return;
    projectMemoContext = data.open ? String(data.title || '').trim() : '';
  });
  window.addEventListener('cockpid:sources-changed', syncMemoSourceLabel);

  el('memoOpen').addEventListener('click', openZenMemo);
  el('memoClose').addEventListener('click', closeZenMemo);
  el('drawerBackdrop').addEventListener('click', closeZenMemo);
  el('memoSave').addEventListener('click', saveZenMemo);
  el('tokenToggle').addEventListener('click', () => toggleTokenSettings());
  el('tokenSave').addEventListener('click', saveToken);
  el('memoText').addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      saveZenMemo();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && el('drawer').classList.contains('open')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeZenMemo();
    }
  });
  syncMemoSourceLabel();
})();
