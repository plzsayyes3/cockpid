(() => {
  'use strict';

  const FALLBACK_SPRITE = 'assets/project-town/character.png';
  const CHARACTER_VARIANTS = Object.freeze([
    { id: 'char-01', sprite: 'assets/project-town/characters/char-01.png?v=32', label: 'standard' }
  ]);
  const variant = CHARACTER_VARIANTS[0];
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

  function spriteUrl() {
    return assetReady ? variant.sprite : FALLBACK_SPRITE;
  }

  function applyWorker(worker) {
    if (!(worker instanceof HTMLElement)) return;
    if (!worker.dataset.projectId) return;
    worker.dataset.characterId = variant.id;
    worker.style.setProperty('--character-sprite', `url("${spriteUrl()}")`);
  }

  function scan(root = document) {
    if (root instanceof HTMLElement && root.matches('.worker[data-project-id]')) applyWorker(root);
    root.querySelectorAll?.('.worker[data-project-id]').forEach(applyWorker);
  }

  function preload() {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      assetReady = true;
      scan(document);
    };
    image.onerror = () => {
      assetReady = false;
      scan(document);
    };
    image.src = variant.sprite;
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
    resolve() {
      return variant;
    }
  });

  observeRoom();
  preload();
})();
