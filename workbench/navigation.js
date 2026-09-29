(() => {
  const drawer = document.getElementById('appWindow');
  const closeButton = document.getElementById('appClose');
  const content = document.getElementById('appContent');
  if (!drawer || !closeButton || !content) return;

  const isOpen = () => drawer.classList.contains('open');

  function closeDrawer() {
    if (!isOpen()) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    content.innerHTML = '';
  }

  closeButton.addEventListener('click', (event) => {
    if (!isOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeDrawer();
  }, true);

  drawer.addEventListener('click', (event) => {
    if (event.target !== drawer || !isOpen()) return;
    event.preventDefault();
    closeDrawer();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeDrawer();
  }, true);
})();
