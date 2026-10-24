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
  // Prevent fixed controls from sitting over the virtual keyboard.
  const isTextEntry = (node) => node instanceof HTMLElement &&
    (node.matches('textarea,select,[contenteditable="true"]') ||
      (node.matches('input') && !['checkbox','radio','range','button','submit','reset'].includes(node.type)));
  document.addEventListener('focusin', (event) => {
    if (isTextEntry(event.target)) document.body.classList.add('wb-text-entry');
  });
  document.addEventListener('focusout', () => {
    document.body.classList.remove('wb-text-entry');
  });
  load();
})();
