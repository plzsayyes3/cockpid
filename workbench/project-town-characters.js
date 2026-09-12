(() => {
  'use strict';

  const FALLBACK_SPRITE = 'assets/project-town/character.png';
  const STABLE_SPRITE = 'assets/project-town/characters/char-01.png';
  const TEST32_SPRITE = 'assets/project-town/characters/char-01-32.png';
  const params = new URLSearchParams(window.location.search);
  const requested32 = params.get('character32') === '1';

  const CHARACTER_VARIANTS = Object.freeze([
    { id: 'char-01', sprite: STABLE_SPRITE, label: 'standard-24' },
    { id: 'char-01-32', sprite: TEST32_SPRITE, label: 'standard-32-test' }
  ]);

  let activeVariant = requested32 ? CHARACTER_VARIANTS[1] : CHARACTER_VARIANTS[0];
  let assetReady = false;

  function hashProjectId(value) {
    let hash = 0x811c9dc5;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function setModeClass() {
    document.documentElement.classList.toggle('pt-character-32-test', activeVariant.id === 'char-01-32' && assetReady);
  }

  function spriteUrl() {
    return assetReady ? activeVariant.sprite : FALLBACK_SPRITE;
  }

  function applyWorker(worker) {
    if (!(worker instanceof HTMLElement)) return;
    if (!worker.dataset.projectId) return;
    worker.dataset.characterId = activeVariant.id;
    worker.style.setProperty('--character-sprite', `url("${spriteUrl()}")`);
  }

  function scan(root = document) {
    if (root instanceof HTMLElement && root.matches('.worker[data-project-id]')) applyWorker(root);
    root.querySelectorAll?.('.worker[data-project-id]').forEach(applyWorker);
  }

  function loadVariant(variant, onDone) {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => onDone(true);
    image.onerror = () => onDone(false);
    image.src = variant.sprite;
  }

  function preload() {
    loadVariant(activeVariant, (ok) => {
      if (ok) {
        assetReady = true;
        setModeClass();
        scan(document);
        return;
      }

      if (activeVariant.id === 'char-01-32') {
        activeVariant = CHARACTER_VARIANTS[0];
        loadVariant(activeVariant, (stableOk) => {
          assetReady = stableOk;
          setModeClass();
          scan(document);
        });
        return;
      }

      assetReady = false;
      setModeClass();
      scan(document);
    });
  }

  function observeRoom() {
    const room = document.getElementById('projectRoom');
    if (!room) return;
    scan(room);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) scan(node);
        });
      });
    });
    observer.observe(room, { childList: true, subtree: true });
  }

  window.ProjectTownCharacters = Object.freeze({
    variants: CHARACTER_VARIANTS,
    fallbackSprite: FALLBACK_SPRITE,
    hashProjectId,
    is32TestRequested: requested32,
    resolve() {
      return activeVariant;
    }
  });

  observeRoom();
  preload();
})();
