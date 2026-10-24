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
  // Narrow layout: launcher starts collapsed, while desktop keeps the existing Dock.
  const dock = document.getElementById('appDock');
  const dockToggle = document.getElementById('dockToggle');
  const dockScrim = document.getElementById('dockScrim');
  const narrowMedia = typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width:720px)') : null;
  const isNarrow = () => narrowMedia ? narrowMedia.matches : (window.innerWidth <= 720);
  function setDock(open) {
    const expanded = Boolean(open) && isNarrow() &&
      !document.body.classList.contains('wb-text-entry');
    dock?.classList.toggle('wb-open', expanded);
    document.body.classList.toggle('wb-dock-expanded', expanded);
    if (dockToggle) {
      dockToggle.setAttribute('aria-expanded', String(expanded));
      dockToggle.setAttribute('aria-label', expanded ? 'アプリメニューを閉じる' : 'アプリメニューを開く');
    }
    if (dockScrim) dockScrim.hidden = !expanded;
    if (dock) {
      // Keep keyboard users out of a collapsed launcher.
      dock.inert = isNarrow() && !expanded;
      dock.setAttribute('aria-hidden', String(isNarrow() && !expanded));
    }
  }
  dockToggle?.addEventListener('click', () => {
    setDock(!dock?.classList.contains('wb-open'));
  });
  dockScrim?.addEventListener('click', () => setDock(false));
  document.addEventListener('click', (event) => {
    // Registered after app-routing.js; close only once the app has been launched.
    if (event.target.closest?.('.dock .app-btn')) setDock(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dock?.classList.contains('wb-open')) setDock(false);
  });
  if (narrowMedia?.addEventListener) {
    narrowMedia.addEventListener('change', () => setDock(false));
  } else if (narrowMedia?.addListener) {
    narrowMedia.addListener(() => setDock(false));
  } else {
    window.addEventListener('resize', () => setDock(false));
  }

  // Use Safari's actually visible viewport when the keyboard is present.
  function syncVisibleHeight() {
    const measured = Number(window.visualViewport?.height) || Number(window.innerHeight) || 640;
    root.style.setProperty('--wb-visible-height', `${Math.max(150, Math.round(measured))}px`);
  }
  window.visualViewport?.addEventListener('resize', syncVisibleHeight);
  window.addEventListener('orientationchange', syncVisibleHeight);
  window.addEventListener('resize', syncVisibleHeight);

  // Prevent fixed controls from sitting over the virtual keyboard.
  const isTextEntry = (node) => node instanceof HTMLElement &&
    (node.matches('textarea,select,[contenteditable="true"]') ||
      (node.matches('input') && !['checkbox','radio','range','button','submit','reset'].includes(node.type)));
  document.addEventListener('focusin', (event) => {
    if (!isTextEntry(event.target)) return;
    document.body.classList.add('wb-text-entry');
    document.body.classList.toggle('wb-capture-writing', event.target.id === 'captureText');
    setDock(false);
    syncVisibleHeight();
  });
  document.addEventListener('focusout', () => {
    document.body.classList.remove('wb-text-entry');
    document.body.classList.remove('wb-capture-writing');
  });
  syncVisibleHeight();
  setDock(false);
  load();
})();
