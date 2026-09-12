(() => {
  'use strict';

  const READ_KEY = 'cockpid.advice.read.v1';
  const systemOpen = document.getElementById('systemOpen');
  const mailOpen = document.getElementById('mailOpen');
  const mailUnread = document.getElementById('mailUnread');
  const navButtons = [...document.querySelectorAll('[data-settings-section]')];
  const panels = [...document.querySelectorAll('[data-settings-panel]')];

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
  refreshMail();
})();
