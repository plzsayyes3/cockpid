(() => {
  'use strict';

  const KEY = 'zen-note-github-token';
  const modal = document.getElementById('tokenModal');
  const panel = modal?.querySelector('.token-panel');
  const openButton = document.getElementById('systemOpen');
  const closeButton = document.getElementById('tokenClose');
  const input = document.getElementById('workbenchTokenInput');
  const reveal = document.getElementById('tokenReveal');
  const testButton = document.getElementById('tokenTest');
  const saveButton = document.getElementById('tokenSaveWorkbench');
  const clearButton = document.getElementById('tokenClearWorkbench');
  const status = document.getElementById('tokenStatus');
  if (!modal || !openButton || !input || !status) return;

  const current = () => localStorage.getItem(KEY) || '';

  function syncIndicator() {
    const ready = Boolean(current());
    openButton.classList.toggle('token-ready', ready);
    openButton.classList.toggle('token-missing', !ready);
    openButton.title = ready ? 'Connection settings · token saved' : 'Connection settings · token required';
    openButton.setAttribute('aria-label', openButton.title);
  }

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.className = `token-status${kind ? ` ${kind}` : ''}`;
  }

  function open() {
    input.value = current();
    setStatus(current() ? 'TOKEN SAVED · 接続確認できます' : 'TOKEN REQUIRED');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => input.focus(), 30);
  }

  function close() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function testToken() {
    const value = input.value.trim();
    if (!value) return setStatus('tokenを入力してください', 'error');
    testButton.disabled = true;
    setStatus('CHECKING…');
    try {
      const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${value}` };
      const urls = [
        'https://api.github.com/repos/plzsayyes3/my-storage-note/contents?ref=main',
        'https://api.github.com/repos/plzsayyes3/mynotebook/contents?ref=main'
      ];
      const responses = await Promise.all(urls.map((url) => fetch(url, { headers })));
      if (responses.some((response) => !response.ok)) {
        throw new Error(responses.map((response) => response.status).join(' / '));
      }
      setStatus('CONNECTED · my-storage-note / mynotebook', 'ok');
    } catch (error) {
      setStatus(`CONNECTION FAILED · ${error?.message || 'unknown error'}`, 'error');
    } finally {
      testButton.disabled = false;
    }
  }

  function save() {
    const value = input.value.trim();
    if (!value) return setStatus('tokenを入力してください', 'error');
    localStorage.setItem(KEY, value);
    setStatus('SAVED · Workbenchを再読み込みします', 'ok');
    syncIndicator();
    setTimeout(() => location.reload(), 350);
  }

  function clear() {
    localStorage.removeItem(KEY);
    input.value = '';
    syncIndicator();
    setStatus('TOKEN REMOVED', 'error');
  }

  openButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    open();
  }, true);
  closeButton?.addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  panel?.addEventListener('click', (event) => event.stopPropagation());
  reveal?.addEventListener('click', () => {
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    reveal.textContent = showing ? 'SHOW' : 'HIDE';
  });
  testButton?.addEventListener('click', testToken);
  saveButton?.addEventListener('click', save);
  clearButton?.addEventListener('click', clear);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('open')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }
  }, true);

  syncIndicator();
  if (!current()) setTimeout(open, 120);
})();