(() => {
  'use strict';

  const captureTab = document.getElementById('memoCaptureTab');
  const inboxTab = document.getElementById('memoInboxTab');
  const capturePanel = document.getElementById('memoCapturePanel');
  const inboxPanel = document.getElementById('memoInboxPanel');
  const inboxList = document.getElementById('memoInboxList');
  const inboxCount = document.getElementById('memoInboxCount');
  const refreshButton = document.getElementById('memoInboxRefresh');
  if (!captureTab || !inboxTab || !capturePanel || !inboxPanel || !inboxList || !inboxCount) return;

  let loaded = false;
  let loading = false;

  function setMode(mode) {
    const inbox = mode === 'inbox';
    captureTab.classList.toggle('active', !inbox);
    inboxTab.classList.toggle('active', inbox);
    captureTab.setAttribute('aria-selected', inbox ? 'false' : 'true');
    inboxTab.setAttribute('aria-selected', inbox ? 'true' : 'false');
    capturePanel.classList.toggle('active', !inbox);
    inboxPanel.classList.toggle('active', inbox);
    capturePanel.hidden = inbox;
    inboxPanel.hidden = !inbox;
    if (inbox) loadInbox();
    else setTimeout(() => document.getElementById('memoText')?.focus(), 20);
  }

  function labelFor(name) {
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(name);
    if (!match) return name.replace(/\.md$/i, '');
    return `${match[1]}.${match[2]}.${match[3]} ${match[4]}:${match[5]}`;
  }

  function render(rows) {
    const files = (Array.isArray(rows) ? rows : [])
      .filter((row) => row.type === 'file' && /\.md$/i.test(row.name))
      .sort((a, b) => b.name.localeCompare(a.name));
    inboxCount.textContent = String(files.length);
    if (!files.length) {
      inboxList.innerHTML = '<div class="memo-inbox-empty">未処理Memoはありません。</div>';
      return;
    }
    inboxList.innerHTML = files.slice(0, 60).map((file) => {
      const href = file.html_url || `https://github.com/plzsayyes3/mynotebook/blob/main/00_inbox/${encodeURIComponent(file.name)}`;
      return `<a class="memo-inbox-item" href="${href}" target="_blank" rel="noopener noreferrer"><span class="memo-inbox-item-main"><b>${esc(file.name)}</b><span>${esc(labelFor(file.name))}</span></span><span class="memo-inbox-item-open">OPEN ↗</span></a>`;
    }).join('');
  }

  async function loadInbox(force = false) {
    if (loading || (loaded && !force)) return;
    if (!token()) {
      inboxCount.textContent = '—';
      inboxList.innerHTML = '<div class="memo-inbox-empty">GitHub token が必要です。Battery / Settings → GitHub から設定してください。</div>';
      return;
    }
    loading = true;
    inboxList.innerHTML = '<div class="memo-inbox-empty">00_inbox を確認しています…</div>';
    try {
      const rows = await gh('00_inbox', 'mynotebook');
      render(rows);
      loaded = true;
    } catch (error) {
      console.error('memo inbox', error);
      inboxCount.textContent = '!';
      inboxList.innerHTML = `<div class="memo-inbox-empty">${esc(String(error?.message || error))}</div>`;
    } finally {
      loading = false;
    }
  }

  captureTab.addEventListener('click', () => setMode('capture'));
  inboxTab.addEventListener('click', () => setMode('inbox'));
  refreshButton?.addEventListener('click', () => loadInbox(true));

  document.getElementById('memoOpen')?.addEventListener('click', () => {
    if (inboxTab.classList.contains('active')) loadInbox(true);
  });

  setMode('capture');
})();
