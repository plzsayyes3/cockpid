(() => {
  'use strict';

  const LEGACY = Object.freeze({ repo: 'mynotebook', dir: '02_techo' });
  const sourceApi = window.COCKPID_SOURCES;
  const originalGh = typeof window.gh === 'function' ? window.gh : null;
  if (!sourceApi || !originalGh) return;

  function currentSource() {
    const source = sourceApi.get?.('techo');
    return source?.repo && source?.dir ? source : { ...LEGACY };
  }

  function resolve(path, repo) {
    const requestedRepo = repo || 'my-storage-note';
    const requestedPath = String(path || '').replace(/^\/+/, '');
    if (requestedRepo !== LEGACY.repo) return null;
    if (requestedPath !== LEGACY.dir && !requestedPath.startsWith(`${LEGACY.dir}/`)) return null;

    const target = currentSource();
    const suffix = requestedPath.slice(LEGACY.dir.length).replace(/^\/+/, '');
    return {
      repo: target.repo,
      path: suffix ? `${target.dir}/${suffix}` : target.dir
    };
  }

  window.gh = function cockpidCalendarSourceGh(path, repo, ...rest) {
    const mapped = resolve(path, repo);
    if (mapped) return originalGh(mapped.path, mapped.repo, ...rest);
    return originalGh(path, repo, ...rest);
  };

  window.COCKPID_CALENDAR_SOURCE = Object.freeze({
    get: currentSource,
    resolve,
    legacy: { ...LEGACY }
  });
})();
