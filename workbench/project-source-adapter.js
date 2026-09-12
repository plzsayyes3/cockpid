(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const STORAGE_KEY = 'cockpid.sources.v1';
  const DEFAULT_SOURCE = Object.freeze({ repo: 'gpts', dir: 'projects' });

  function cleanDir(value) {
    return String(value || '').trim().replace(/^\/+|\/+$/g, '');
  }

  function readSource() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')?.projects;
      const repo = String(stored?.repo || '').trim();
      const dir = cleanDir(stored?.dir);
      const repoOk = /^[A-Za-z0-9._-]+$/.test(repo);
      const dirOk = Boolean(dir) && !/(^|\/)\.\.?($|\/)/.test(dir) && !/[?#]/.test(dir);
      if (repoOk && dirOk) return { repo, dir };
    } catch (_) { /* fall through */ }
    return { ...DEFAULT_SOURCE };
  }

  const source = Object.freeze(readSource());
  window.COCKPID_PROJECT_SOURCE = source;

  if (source.repo === DEFAULT_SOURCE.repo && source.dir === DEFAULT_SOURCE.dir) return;

  const originalFetch = window.fetch.bind(window);

  function encodePath(value) {
    return cleanDir(value).split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  function rewriteApiInput(input) {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    if (!raw) return input;

    let url;
    try { url = new URL(raw, location.href); }
    catch (_) { return input; }

    if (url.hostname !== 'api.github.com') return input;

    const marker = `/repos/${OWNER}/${DEFAULT_SOURCE.repo}/contents/`;
    if (!url.pathname.startsWith(marker)) return input;

    let contentPath = url.pathname.slice(marker.length).split('/').map((part) => {
      try { return decodeURIComponent(part); } catch (_) { return part; }
    }).join('/');

    if (contentPath === DEFAULT_SOURCE.dir || contentPath.startsWith(`${DEFAULT_SOURCE.dir}/`)) {
      contentPath = `${source.dir}${contentPath.slice(DEFAULT_SOURCE.dir.length)}`;
    }

    url.pathname = `/repos/${OWNER}/${encodeURIComponent(source.repo)}/contents/${encodePath(contentPath)}`;

    if (typeof Request !== 'undefined' && input instanceof Request) {
      try { return new Request(url.href, input); }
      catch (_) { return url.href; }
    }
    return url.href;
  }

  window.fetch = (input, init) => originalFetch(rewriteApiInput(input), init);

  function rewriteGithubHref(href) {
    let url;
    try { url = new URL(href, location.href); }
    catch (_) { return href; }
    if (url.hostname !== 'github.com') return href;

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== OWNER || parts[1] !== DEFAULT_SOURCE.repo) return href;
    if (!['blob', 'tree'].includes(parts[2]) || parts[3] !== 'main') return href;

    parts[1] = source.repo;
    const content = parts.slice(4).map((part) => {
      try { return decodeURIComponent(part); } catch (_) { return part; }
    });
    if (content[0] === DEFAULT_SOURCE.dir) {
      content.splice(0, 1, ...source.dir.split('/').filter(Boolean));
    }
    url.pathname = `/${parts.slice(0, 4).map(encodeURIComponent).join('/')}/${content.map(encodeURIComponent).join('/')}`;
    return url.href;
  }

  function rewritePrompt(text) {
    return String(text ?? '').replace(`まず ${DEFAULT_SOURCE.repo}/`, `まず ${source.repo}/`);
  }

  try {
    if (navigator.clipboard?.writeText) {
      const writeText = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = (text) => writeText(rewritePrompt(text));
    }
  } catch (_) { /* clipboard may be read-only */ }

  function relabel(element) {
    if (!element) return;
    const before = element.textContent || '';
    const after = before.replace(`${DEFAULT_SOURCE.repo} / ${DEFAULT_SOURCE.dir}`, `${source.repo} / ${source.dir}`);
    if (after !== before) element.textContent = after;
  }

  function rewriteAnchor(anchor) {
    if (!anchor?.href) return;
    const next = rewriteGithubHref(anchor.href);
    if (next !== anchor.href) anchor.href = next;
  }

  function apply(root = document) {
    if (root.nodeType === 1 && root.matches?.('a[href]')) rewriteAnchor(root);
    if (root.nodeType === 1 && root.matches?.('#loadStatus,#townSummary,.room-loading')) relabel(root);
    root.querySelectorAll?.('a[href]').forEach(rewriteAnchor);
    root.querySelectorAll?.('#loadStatus,#townSummary,.room-loading').forEach(relabel);
  }

  const start = () => {
    apply(document);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') rewriteAnchor(record.target);
        apply(record.target);
        record.addedNodes.forEach((node) => apply(node));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
