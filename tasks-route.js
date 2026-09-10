(() => {
  const appWindow = document.getElementById('appWindow');
  const appTitle = document.getElementById('appTitle');
  const appContent = document.getElementById('appContent');
  if (!appWindow || !appTitle || !appContent) return;

  const TASKLINER_URL = 'https://plzsayyes3.github.io/taskliner_taskchute-line/';

  function openTasks() {
    appTitle.textContent = '2 / TASKS';
    appContent.innerHTML = `<iframe src="${TASKLINER_URL}" title="2 / TASKS"></iframe>`;
    appWindow.classList.add('open');
    appWindow.setAttribute('aria-hidden', 'false');
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-app="tasks"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openTasks();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== '2') return;
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openTasks();
  }, true);
})();
