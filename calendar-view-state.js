(() => {
  'use strict';

  const KEY = 'cockpid.calendar.right-view.v1';
  const anchor = document.getElementById('anchorDate');
  const viewContent = document.getElementById('viewContent');
  const tabs = [...document.querySelectorAll('[data-view]')];
  const prev = document.getElementById('prevView');
  const next = document.getElementById('nextView');
  if (!anchor || !tabs.length) return;

  const validViews = new Set(['day', 'week', 'month']);
  const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
  const currentView = () => tabs.find((button) => button.classList.contains('active'))?.dataset.view || 'day';

  function save() {
    const view = currentView();
    const date = anchor.value;
    if (!validViews.has(view) || !validDate(date)) return;
    localStorage.setItem(KEY, JSON.stringify({ view, date }));
  }

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!saved || !validViews.has(saved.view) || !validDate(saved.date)) return;

      if (anchor.value !== saved.date) {
        anchor.value = saved.date;
        anchor.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const tab = tabs.find((button) => button.dataset.view === saved.view);
      if (tab && !tab.classList.contains('active')) tab.click();
    } catch (_) {}
  }

  restore();

  tabs.forEach((button) => button.addEventListener('click', () => queueMicrotask(save)));
  prev?.addEventListener('click', () => queueMicrotask(save));
  next?.addEventListener('click', () => queueMicrotask(save));
  anchor.addEventListener('change', () => queueMicrotask(save));
  viewContent?.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-date]')) queueMicrotask(save);
  });
  window.addEventListener('pagehide', save);
})();
