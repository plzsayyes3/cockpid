(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const TOKEN_KEY = 'zen-note-github-token';
  const AREA_SOURCE = Object.freeze({ repo: 'my-storage-note', path: 'views/areas.json', mode: 'view' });
  const originalFetch = window.fetch.bind(window);
  let areaPromise = null;

  window.COCKPID_AREA_SOURCE = AREA_SOURCE;

  function decodeBase64Utf8(value) {
    const binary = atob(String(value || '').replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  }

  function validateView(view) {
    if (view?.schema_version !== 1) throw new Error('Area view has unsupported schema_version');
    if (typeof view.generated_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(view.generated_at) || Number.isNaN(Date.parse(view.generated_at))) {
      throw new Error('Area view has invalid generated_at');
    }
    if (!view.source || typeof view.source !== 'object' || Array.isArray(view.source)) throw new Error('Area view has invalid source');
    if (view.source.repository !== 'plzsayyes3/my-storage-note') throw new Error('Area view has invalid source.repository');
    if (view.source.authority !== 'objects') throw new Error('Area view has invalid source.authority');
    if (!Array.isArray(view?.areas)) throw new Error('Area view is invalid');
    if (!view?.unassigned || typeof view.unassigned !== 'object' || Array.isArray(view.unassigned)) {
      throw new Error('Area view has no unassigned bucket');
    }
    const warningAllowsUnknownArea = (type, record) => (
      !view.areas.some((area) => area?.id === record.area_id)
      && Array.isArray(view.validation_warnings)
      && view.validation_warnings.some((warning) => (
        warning?.object_type === type.slice(0, -1)
        && String(warning.object_id || '') === record.id
        && warning.area_id === record.area_id
      ))
    );
    const validateBucket = (bucket, label, areaId = null, options = {}) => {
      for (const type of ['projects', 'assignments', 'tasks']) {
        if (!Array.isArray(bucket[type])) throw new Error(`Area view has invalid ${label}.${type}`);
        bucket[type].forEach((record, index) => {
          if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.id !== 'string' || !record.id.trim()) {
            throw new Error(`Area view has invalid ${label}.${type}[${index}]`);
          }
          if (areaId !== null && record.area_id !== areaId) throw new Error(`Area view has invalid ${label}.${type}[${index}].area_id`);
          if (label === 'unassigned' && record.area_id != null) {
            if (typeof record.area_id !== 'string') {
              throw new Error(`Area view has invalid unassigned.${type}[${index}].area_id`);
            }
            if (record.area_id.trim() && !warningAllowsUnknownArea(type, record)) {
              throw new Error(`Area view has invalid unassigned.${type}[${index}].area_id`);
            }
          }
          if (type === 'tasks') {
            const hasProject = typeof record.project_id === 'string' && record.project_id.trim();
            const hasAssignment = typeof record.assignment_id === 'string' && record.assignment_id.trim();
            if (record.project_id != null && record.project_id !== '' && !hasProject) {
              throw new Error(`Area view has invalid ${label}.${type}[${index}].project_id`);
            }
            if (record.assignment_id != null && record.assignment_id !== '' && !hasAssignment) {
              throw new Error(`Area view has invalid ${label}.${type}[${index}].assignment_id`);
            }
            if (hasProject && hasAssignment && !options.allowInvalidTaskParentage) {
              throw new Error(`Area view has invalid task parentage at ${label}.${type}[${index}]`);
            }
          }
        });
      }
    };
    validateBucket(view.unassigned, 'unassigned');
    if (view.validation != null) {
      if (typeof view.validation !== 'object' || Array.isArray(view.validation)) {
        throw new Error('Area view has invalid validation bucket');
      }
      validateBucket(view.validation, 'validation', null, { allowInvalidTaskParentage: true });
    }
    if (view.validation_warnings != null && !Array.isArray(view.validation_warnings)) {
      throw new Error('Area view has invalid validation_warnings');
    }
    const ids = new Set();
    view.areas.forEach((area, index) => {
      if (!area || typeof area !== 'object' || Array.isArray(area) || typeof area.id !== 'string' || !area.id.trim()) {
        throw new Error(`Area view has invalid areas[${index}] id`);
      }
      if (typeof area.title !== 'string' || !area.title.trim()) throw new Error(`Area view has invalid areas[${index}] title`);
      if (area.object_path !== `objects/areas/${area.id}.md`) throw new Error(`Area view has invalid areas[${index}] object_path`);
      if (ids.has(area.id)) throw new Error(`Area view has duplicate Area id: ${area.id}`);
      ids.add(area.id);
      validateBucket(area, `areas[${index}]`, area.id);
    });
    return view;
  }

  function projectFallbackLoader(init) {
    const loader = window.COCKPID_PROJECT_VIEW?.load;
    if (typeof loader !== 'function') throw new Error('Project fallback loader unavailable');
    return loader(init);
  }

  async function loadWithFallback(init, fallbackLoader = projectFallbackLoader) {
    const configuredProjectSource = window.COCKPID_PROJECT_SOURCE;
    const hasCustomProjectSource = configuredProjectSource
      && configuredProjectSource.mode !== 'view'
      && configuredProjectSource.repo
      && configuredProjectSource.dir;
    if (hasCustomProjectSource) {
      const view = await fallbackLoader(init);
      return { kind: 'project', fallback: true, source: fallback(), view, error: null };
    }
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
      const requestInit = { ...(init || {}) };
      let token = '';
      try { token = window.localStorage?.getItem(TOKEN_KEY) || ''; } catch (_) { /* token storage may be unavailable */ }
      if (token) {
        const headers = new Headers(requestInit.headers || {});
        headers.set('Accept', 'application/vnd.github+json');
        headers.set('Authorization', `Bearer ${token}`);
        requestInit.headers = headers;
      }
      areaPromise = originalFetch(url, requestInit).then(async (response) => {
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
