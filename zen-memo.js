(() => {
  const MEMO_REPO = 'mynotebook';
  const MEMO_DIR = '00_inbox';
  const el = (id) => document.getElementById(id);

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

  function openZenMemo() {
    el('drawer').classList.add('open');
    el('drawerBackdrop').classList.add('open');
    el('tokenInput').value = token();
    setTimeout(() => el('memoText').focus(), 80);
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

    const name = `${zenStamp()}.md`;
    const path = `${MEMO_DIR}/${name}`;
    status.textContent = 'POSTING…';
    el('memoSave').disabled = true;

    try {
      const payload = {
        message: `cockpid: zen memo ${name}`,
        content: encodeUtf8(`${text}\n`)
      };
      const response = await fetch(`https://api.github.com/repos/${OWNER}/${MEMO_REPO}/contents/${path}`, {
        method: 'PUT',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`mynotebook write ${response.status}`);

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
    if (event.key === 'Escape' && el('drawer').classList.contains('open')) closeZenMemo();
  });
})();
