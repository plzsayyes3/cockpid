(() => {
  const appWindow = document.getElementById('appWindow');
  const appTitle = document.getElementById('appTitle');
  const appContent = document.getElementById('appContent');
  if (!appWindow || !appTitle || !appContent) return;

  function openCalendar() {
    appTitle.textContent = '1 / CALENDAR';
    appContent.innerHTML = '<iframe src="calendar.html" title="1 / CALENDAR"></iframe>';
    appWindow.classList.add('open');
    appWindow.setAttribute('aria-hidden', 'false');
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-app="calendar"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openCalendar();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== '1') return;
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openCalendar();
  }, true);
})();
