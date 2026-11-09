(() => {
  'use strict';
  // UI-only preference: never synced to GitHub or mixed with personal notes.
  const KEY = 'cockpid.workbench.ui-size.v1';
  const root = document.documentElement;
  const slider = document.getElementById('uiSizeRange');
  const output = document.getElementById('uiSizeOutput');
  const reset = document.getElementById('uiSizeReset');
  const sanitize = (raw) => {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 85 && n <= 110 && n % 5 === 0 ? n : 100;
  };
  function apply(raw) {
    const value = sanitize(raw);
    const steps = (value - 100) / 5;
    root.style.setProperty('--wb-pad-adjust', `${steps * 2}px`);
    root.style.setProperty('--wb-gap-adjust', `${steps}px`);
    root.style.setProperty('--wb-capture-adjust', `${steps * 8}px`);
    root.style.setProperty('--wb-dock-adjust', `${steps * 2}px`);
    if (slider) slider.value = String(value);
    if (output) output.textContent = `${value}%`;
    return value;
  }
  function load() {
    try { return apply(localStorage.getItem(KEY) ?? 100); }
    catch (_) { return apply(100); }
  }
  function save(raw) {
    const value = apply(raw);
    try { localStorage.setItem(KEY, String(value)); } catch (_) {}
  }
  slider?.addEventListener('input', () => apply(slider.value));
  slider?.addEventListener('change', () => save(slider.value));
  reset?.addEventListener('click', () => save(100));
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) load();
  });
  // Five primary actions stay visible; the remaining ten expand above them.
  const dock = document.getElementById('appDock');
  const dockToggle = document.getElementById('dockToggle');
  const dockExtra = document.getElementById('dockExtra');
  function setDock(open) {
    const expanded = Boolean(open) && !document.body.classList.contains('wb-text-entry');
    dock?.classList.toggle('wb-open', expanded);
    document.body.classList.toggle('wb-dock-expanded', expanded);
    dockToggle?.setAttribute('aria-expanded', String(expanded));
    dockToggle?.setAttribute('aria-label', expanded ? '追加メニューを閉じる' : '追加メニューを開く');
    if (dockExtra) {
      dockExtra.inert = !expanded;
      dockExtra.setAttribute('aria-hidden', String(!expanded));
    }
  }
  dockToggle?.addEventListener('click', () => setDock(!dock?.classList.contains('wb-open')));
  document.getElementById('dockSettingsOpen')?.addEventListener('click', () => {
    document.getElementById('systemOpen')?.click();
    setDock(false);
  });
  // Router intercepts app clicks during document capture; listen earlier on window.
  window.addEventListener('click', (event) => {
    if (event.target.closest?.('.dock .app-btn')) setDock(false);
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dock?.classList.contains('wb-open')) setDock(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (dock?.classList.contains('wb-open') && !event.target.closest?.('#appDock')) setDock(false);
  });

  // Prevent fixed controls from sitting over the virtual keyboard.
  const isTextEntry = (node) => node instanceof HTMLElement &&
    (node.matches('textarea,select,[contenteditable="true"]') ||
      (node.matches('input') && !['checkbox','radio','range','button','submit','reset'].includes(node.type)));
  document.addEventListener('focusin', (event) => {
    if (!isTextEntry(event.target)) return;
    document.body.classList.add('wb-text-entry');
    document.body.classList.toggle('wb-capture-writing', event.target.id === 'captureText');
    setDock(false);
  });
  document.addEventListener('focusout', () => {
    document.body.classList.remove('wb-text-entry');
    document.body.classList.remove('wb-capture-writing');
  });
  setDock(false);
  load();
})();
