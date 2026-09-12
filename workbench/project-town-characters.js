(() => {
  'use strict';

  const FALLBACK_SPRITE = 'assets/project-town/character.png';
  const TEST32_SPRITE = 'assets/project-town/characters/char-01-32.png';
  const params = new URLSearchParams(window.location.search);
  const requested32 = params.get('character32') === '1';

  const CHARACTER_VARIANTS = Object.freeze([
    { id: 'char-01', sprite: 'assets/project-town/characters/char-01.png', label: 'standard-24' },
    { id: 'char-02', sprite: 'assets/project-town/characters/char-02.png', label: 'short-hair-24' },
    { id: 'char-03', sprite: 'assets/project-town/characters/char-03.png', label: 'source-04-24' },
    { id: 'char-04', sprite: 'assets/project-town/characters/char-04.png', label: 'source-05-24' },
    { id: 'char-05', sprite: 'assets/project-town/characters/char-05.png', label: 'source-06-24' },
    { id: 'char-06', sprite: 'assets/project-town/characters/char-06.png', label: 'standard-24-copy' },
    { id: 'char-07', sprite: 'assets/project-town/characters/char-07.png', label: 'source-05-24-copy' },
    { id: 'char-08', sprite: 'assets/project-town/characters/char-08.png', label: 'source-06-24-copy' }
  ]);
  const TEST32_VARIANT = Object.freeze({
    id: 'char-01-32',
    sprite: TEST32_SPRITE,
    label: 'standard-32-test'
  });

  const readySprites = new Set();
  let test32Ready = false;

  function hashProjectId(value) {
    let hash = 0x811c9dc5;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function productionVariant(projectId) {
    return CHARACTER_VARIANTS[hashProjectId(projectId) % CHARACTER_VARIANTS.length];
  }

  function resolveVariant(projectId) {
    if (requested32 && test32Ready) return TEST32_VARIANT;
    return productionVariant(projectId);
  }

  function setModeClass() {
    document.documentElement.classList.toggle('pt-character-32-test', requested32 && test32Ready);
  }

  function spriteUrl(variant) {
    if (variant.id === TEST32_VARIANT.id) return test32Ready ? variant.sprite : FALLBACK_SPRITE;
    return readySprites.has(variant.sprite) ? variant.sprite : FALLBACK_SPRITE;
  }

  function applyWorker(worker) {
    if (!(worker instanceof HTMLElement)) return;
    const projectId = worker.dataset.projectId;
    if (!projectId) return;

    const variant = resolveVariant(projectId);
    worker.dataset.characterId = variant.id;
    worker.style.setProperty('--character-sprite', `url("${spriteUrl(variant)}")`);
  }

  function scan(root = document) {
    if (root instanceof HTMLElement && root.matches('.worker[data-project-id]')) applyWorker(root);
    root.querySelectorAll?.('.worker[data-project-id]').forEach(applyWorker);
  }

  function loadVariant(variant) {
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = variant.sprite;
    });
  }

  async function preload() {
    await Promise.all(CHARACTER_VARIANTS.map(async (variant) => {
      if (await loadVariant(variant)) readySprites.add(variant.sprite);
    }));

    if (requested32) test32Ready = await loadVariant(TEST32_VARIANT);

    setModeClass();
    scan(document);
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
    resolve(projectId = '') {
      return resolveVariant(projectId);
    }
  });

  observeRoom();
  preload();
})();
