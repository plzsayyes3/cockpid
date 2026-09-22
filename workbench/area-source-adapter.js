(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const AREA_SOURCE = Object.freeze({ repo: 'my-storage-note', path: 'views/areas.json', mode: 'view' });
  const originalFetch = window.fetch.bind(window);
  let areaPromise = null;

  window.COCKPID_AREA_SOURCE = AREA_SOURCE;

  function decodeBase64Utf8(value) {
    const binary = atob(String(value || '').replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  }

  function validateView(view) {
    if (!Array.isArray(view?.areas)) throw new Error('Area view is invalid');
    if (!view?.unassigned || typeof view.unassigned !== 'object' || Array.isArray(view.unassigned)) {
      throw new Error('Area view has no unassigned bucket');
    }
    const validateBucket = (bucket, label) => {
      for (const type of ['projects', 'assignments', 'tasks']) {
        if (!Array.isArray(bucket[type])) throw new Error(`Area view has invalid ${label}.${type}`);
        bucket[type].forEach((record, index) => {
          if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.id !== 'string' || !record.id.trim()) {
            throw new Error(`Area view has invalid ${label}.${type}[${index}]`);
          }
        });
      }
    };
    validateBucket(view.unassigned, 'unassigned');
    const ids = new Set();
    view.areas.forEach((area, index) => {
      if (!area || typeof area !== 'object' || Array.isArray(area) || typeof area.id !== 'string' || !area.id.trim()) {
        throw new Error(`Area view has invalid areas[${index}] id`);
      }
      if (ids.has(area.id)) throw new Error(`Area view has duplicate Area id: ${area.id}`);
      ids.add(area.id);
      validateBucket(area, `areas[${index}]`);
    });
    return view;
  }

  function projectFallbackLoader(init) {
    const loader = window.COCKPID_PROJECT_VIEW?.load;
    if (typeof loader !== 'function') throw new Error('Project fallback loader unavailable');
    return loader(init);
  }

  async function loadWithFallback(init, fallbackLoader = projectFallbackLoader) {
    try {
      return { kind: 'area', fallback: false, source: AREA_SOURCE, view: await load(init) };
    } catch (error) {
      const view = await fallbackLoader(init);
      return { kind: 'project', fallback: true, source: fallback(), view, error };
    }
  }

  function load(init, force = false) {
    if (force || !areaPromise) {
      const url = `https://api.github.com/repos/${OWNER}/${AREA_SOURCE.repo}/contents/${AREA_SOURCE.path}?ref=main&_=${Date.now()}`;
      areaPromise = originalFetch(url, init).then(async (response) => {
        if (!response.ok) throw new Error(`Area view ${response.status}`);
        const payload = await response.json();
        if (!payload?.content) throw new Error('Area view has no content');
        return validateView(JSON.parse(decodeBase64Utf8(payload.content)));
      }).catch((error) => {
        areaPromise = null;
        throw error;
      });
    }
    return areaPromise;
  }

  const fallback = () => window.COCKPID_PROJECT_SOURCE_FALLBACK || window.COCKPID_PROJECT_SOURCE || null;
  window.COCKPID_AREA_VIEW = Object.freeze({ load, loadWithFallback, loadOrFallback: loadWithFallback, source: AREA_SOURCE, fallback });
  Object.defineProperty(window, 'COCKPID_AREA_VIEW_PROMISE', {
    configurable: true,
    get: () => load()
  });
})();
