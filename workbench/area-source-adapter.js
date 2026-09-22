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
    for (const bucket of [view.unassigned, ...view.areas]) {
      for (const type of ['projects', 'assignments', 'tasks']) {
        if (bucket[type] !== undefined && !Array.isArray(bucket[type])) throw new Error(`Area view has invalid ${type}`);
      }
    }
    return view;
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
  window.COCKPID_AREA_VIEW = Object.freeze({ load, source: AREA_SOURCE, fallback });
  Object.defineProperty(window, 'COCKPID_AREA_VIEW_PROMISE', {
    configurable: true,
    get: () => load()
  });
})();
