(() => {
  const drawer = document.getElementById('appWindow');
  const closeButton = document.getElementById('appClose');
  const content = document.getElementById('appContent');
  if (!drawer || !closeButton || !content) return;

  const STATE_KEY = 'cockpidDrawer';
  let handlingPop = false;

  const isOpen = () => drawer.classList.contains('open');

  function clearStaleState() {
    if (!isOpen() && history.state?.[STATE_KEY]) {
      const next = { ...(history.state || {}) };
      delete next[STATE_KEY];
      history.replaceState(next, '', location.href);
    }
  }

  function pushDrawerState() {
    if (!isOpen() || history.state?.[STATE_KEY]) return;
    history.pushState({ ...(history.state || {}), [STATE_KEY]: true }, '', location.href);
  }

  function forceClose() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    content.innerHTML = '';
  }

  clearStaleState();

  const observer = new MutationObserver(() => {
    if (isOpen() && !handlingPop) pushDrawerState();
  });
  observer.observe(drawer, { attributes: true, attributeFilter: ['class'] });

  closeButton.addEventListener('click', (event) => {
    if (!isOpen() || !history.state?.[STATE_KEY]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    history.back();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen() || !history.state?.[STATE_KEY]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    history.back();
  }, true);

  window.addEventListener('popstate', (event) => {
    if (isOpen()) {
      handlingPop = true;
      forceClose();
      queueMicrotask(() => { handlingPop = false; });
      return;
    }
    if (event.state?.[STATE_KEY]) clearStaleState();
  });
})();
