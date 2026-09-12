(() => {
  'use strict';

  const FALLBACK_SPRITE = 'assets/project-town/character.png';
  const PROJECT_CONTENT_PREFIX = '/repos/plzsayyes3/gpts/contents/projects/';
  const CHARACTER_VARIANTS = Object.freeze([
    { id: 'char-01', sprite: 'assets/project-town/characters/char-01.png', label: 'brown-short-white' },
    { id: 'char-02', sprite: 'assets/project-town/characters/char-02.png', label: 'black-short-blue' },
    { id: 'char-03', sprite: 'assets/project-town/characters/char-03.png', label: 'brown-bob-mustard' },
    { id: 'char-04', sprite: 'assets/project-town/characters/char-04.png', label: 'long-hair-green' },
    { id: 'char-05', sprite: 'assets/project-town/characters/char-05.png', label: 'glasses-teal' },
    { id: 'char-06', sprite: 'assets/project-town/characters/char-06.png', label: 'cap-coral' },
    { id: 'char-07', sprite: 'assets/project-town/characters/char-07.png', label: 'hoodie-plum' },
    { id: 'char-08', sprite: 'assets/project-town/characters/char-08.png', label: 'formal-navy' }
  ]);

  const variantById = new Map(CHARACTER_VARIANTS.map((variant) => [variant.id, variant]));
  const assetState = new Map();
  const explicitCharacterByProject = new Map();
  let assetsReady = false;

  function hashProjectId(value) {
    let hash = 0x811c9dc5;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function resolveVariant(projectId, explicitId = '') {
    const requested = variantById.get(String(explicitId || '').trim());
    if (requested) return requested;
    return CHARACTER_VARIANTS[hashProjectId(projectId) % CHARACTER_VARIANTS.length];
  }

  function spriteFor(variant) {
    if (!variant || !assetsReady) return FALLBACK_SPRITE;
    return assetState.get(variant.id) === true ? variant.sprite : FALLBACK_SPRITE;
  }

  function decodeGithubContent(value) {
    try {
      const raw = atob(String(value || '').replace(/\n/g, ''));
      return new TextDecoder().decode(Uint8Array.from(raw, (char) => char.charCodeAt(0)));
    } catch (_) {
      return '';
    }
  }

  function frontmatterValue(markdown, key) {
    const source = String(markdown || '').replace(/^\uFEFF/, '');
    const match = /^---\s*\n([\s\S]*?)\n---/.exec(source);
    if (!match) return '';
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const line = new RegExp(`^${escaped}:\\s*(.*?)\\s*$`, 'm').exec(match[1]);
    if (!line) return '';
    const value = line[1].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    return value;
  }

  function rememberExplicitCharacter(markdown) {
    const projectId = frontmatterValue(markdown, 'id');
    const characterId = frontmatterValue(markdown, 'character');
    if (!projectId || !variantById.has(characterId)) return;
    explicitCharacterByProject.set(projectId, characterId);
    scan(document);
  }

  function observeProjectResponse(response, url) {
    if (!response?.ok || !String(url || '').includes(PROJECT_CONTENT_PREFIX) || !/\.md(?:\?|$)/.test(String(url || ''))) return;
    response.clone().json().then((payload) => {
      if (!payload?.content) return;
      rememberExplicitCharacter(decodeGithubContent(payload.content));
    }).catch(() => {});
  }

  function installProjectResponseTap() {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (...args) => {
      const source = args[0];
      const url = typeof source === 'string' ? source : source?.url || '';
      return nativeFetch(...args).then((response) => {
        observeProjectResponse(response, url);
        return response;
      });
    };
  }

  function applyWorker(worker) {
    if (!(worker instanceof HTMLElement)) return;
    const projectId = worker.dataset.projectId || '';
    if (!projectId) return;
    const explicitId = worker.dataset.character || explicitCharacterByProject.get(projectId) || '';
    const variant = resolveVariant(projectId, explicitId);
    worker.dataset.characterId = variant.id;
    worker.style.setProperty('--character-sprite', `url("${spriteFor(variant)}")`);
  }

  function scan(root = document) {
    if (root instanceof HTMLElement && root.matches('.worker[data-project-id]')) applyWorker(root);
    root.querySelectorAll?.('.worker[data-project-id]').forEach(applyWorker);
  }

  function preloadVariant(variant) {
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        assetState.set(variant.id, true);
        resolve();
      };
      image.onerror = () => {
        assetState.set(variant.id, false);
        resolve();
      };
      image.src = variant.sprite;
    });
  }

  function preloadAll() {
    return Promise.all(CHARACTER_VARIANTS.map(preloadVariant)).then(() => {
      assetsReady = true;
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
    resolve(projectId, explicitId = '') {
      return resolveVariant(projectId, explicitId || explicitCharacterByProject.get(String(projectId || '')) || '');
    }
  });

  installProjectResponseTap();
  observeRoom();
  preloadAll();
})();
