(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const STORAGE_KEY = 'cockpid.sources.v1';
  const DEFAULT_SOURCE = Object.freeze({ repo: 'gpts', dir: 'projects' });
  const VIEW_SOURCE = Object.freeze({ repo: 'my-storage-note', path: 'views/projects.json' });
  const OBJECT_DIR = 'objects/projects';

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
  const useGeneratedView = source.repo === DEFAULT_SOURCE.repo && source.dir === DEFAULT_SOURCE.dir;
  window.COCKPID_PROJECT_SOURCE = useGeneratedView
    ? Object.freeze({ repo: VIEW_SOURCE.repo, dir: VIEW_SOURCE.path, mode: 'view' })
    : source;

  const originalFetch = window.fetch.bind(window);
  let viewPromise = null;

  function rawUrl(input) {
    return typeof input === 'string' || input instanceof URL ? String(input) : input?.url || '';
  }

  function decodeBase64Utf8(value) {
    const binary = atob(String(value || '').replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  }

  function encodeBase64Utf8(value) {
    const bytes = new TextEncoder().encode(String(value || ''));
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function yamlScalar(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean' || typeof value === 'number') return String(value);
    return JSON.stringify(String(value));
  }

  function yamlLinesFor(key, value) {
    if (!Array.isArray(value)) return [`${key}: ${yamlScalar(value)}`];
    if (!value.length) return [`${key}: []`];
    const lines = [`${key}:`];
    value.forEach((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const fields = Object.entries(item);
        if (!fields.length) return;
        const [firstKey, firstValue] = fields[0];
        lines.push(`  - ${firstKey}: ${yamlScalar(firstValue)}`);
        fields.slice(1).forEach(([field, fieldValue]) => lines.push(`    ${field}: ${yamlScalar(fieldValue)}`));
      } else {
        lines.push(`  - ${yamlScalar(item)}`);
      }
    });
    return lines;
  }

  function projectMarkdown(project) {
    const meta = Object.entries(project || {})
      .filter(([key]) => !['body_markdown', 'object_path'].includes(key));
    const frontmatter = meta.flatMap(([key, value]) => yamlLinesFor(key, value)).join('\n');
    return `---\n${frontmatter}\n---\n${String(project?.body_markdown || '').trim()}\n`;
  }

  function jsonResponse(value) {
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  async function loadProjectView(init, force = false) {
    if (force || !viewPromise) {
      const url = `https://api.github.com/repos/${OWNER}/${VIEW_SOURCE.repo}/contents/${VIEW_SOURCE.path}?ref=main&_=${Date.now()}`;
      viewPromise = originalFetch(url, init).then(async (response) => {
        if (!response.ok) throw new Error(`Project view ${response.status}`);
        const payload = await response.json();
        if (!payload?.content) throw new Error('Project view has no content');
        const view = JSON.parse(decodeBase64Utf8(payload.content));
        if (!Array.isArray(view?.projects)) throw new Error('Project view is invalid');
        return view;
      }).catch((error) => {
        viewPromise = null;
        throw error;
      });
    }
    return viewPromise;
  }

  function defaultProjectRequest(input) {
    const raw = rawUrl(input);
    if (!raw) return null;
    let url;
    try { url = new URL(raw, location.href); }
    catch (_) { return null; }
    if (url.hostname !== 'api.github.com') return null;
    const prefix = `/repos/${OWNER}/${DEFAULT_SOURCE.repo}/contents/${DEFAULT_SOURCE.dir}`;
    if (url.pathname === prefix || url.pathname === `${prefix}/`) return { kind: 'list', url };
    if (!url.pathname.startsWith(`${prefix}/`)) return null;
    const relative = url.pathname.slice(prefix.length + 1).split('/').map((part) => {
      try { return decodeURIComponent(part); } catch (_) { return part; }
    }).join('/');
    if (!relative.endsWith('.md') || relative.includes('/')) return null;
    return { kind: 'file', url, id: relative.replace(/\.md$/i, '') };
  }

  async function serveGeneratedView(request, init) {
    const view = await loadProjectView(init, request.kind === 'list');
    if (request.kind === 'list') {
      return jsonResponse(view.projects.map((project) => ({
        type: 'file',
        name: `${project.id}.md`,
        path: `${DEFAULT_SOURCE.dir}/${project.id}.md`,
        sha: `view-${project.id}`
      })));
    }
    const project = view.projects.find((item) => String(item.id || '') === request.id);
    if (!project) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    const markdown = projectMarkdown(project);
    return jsonResponse({
      type: 'file',
      name: `${project.id}.md`,
      path: `${DEFAULT_SOURCE.dir}/${project.id}.md`,
      sha: `view-${project.id}`,
      encoding: 'base64',
      content: encodeBase64Utf8(markdown)
    });
  }

  function encodePath(value) {
    return cleanDir(value).split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  function rewriteCustomApiInput(input) {
    const raw = rawUrl(input);
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

  window.fetch = (input, init) => {
    if (useGeneratedView) {
      const request = defaultProjectRequest(input);
      if (request) return serveGeneratedView(request, init);
      return originalFetch(input, init);
    }
    return originalFetch(rewriteCustomApiInput(input), init);
  };

  function rewriteGithubHref(href) {
    let url;
    try { url = new URL(href, location.href); }
    catch (_) { return href; }
    if (url.hostname !== 'github.com') return href;

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== OWNER || parts[1] !== DEFAULT_SOURCE.repo) return href;
    if (!['blob', 'tree'].includes(parts[2]) || parts[3] !== 'main') return href;

    const content = parts.slice(4).map((part) => {
      try { return decodeURIComponent(part); } catch (_) { return part; }
    });

    if (useGeneratedView) {
      if (parts[2] === 'blob' && content.length === 2 && content[0] === DEFAULT_SOURCE.dir && /\.md$/i.test(content[1])) {
        url.pathname = `/${OWNER}/${VIEW_SOURCE.repo}/blob/main/${OBJECT_DIR}/${encodeURIComponent(content[1])}`;
        return url.href;
      }
      return href;
    }

    parts[1] = source.repo;
    if (content[0] === DEFAULT_SOURCE.dir) content.splice(0, 1, ...source.dir.split('/').filter(Boolean));
    url.pathname = `/${parts.slice(0, 4).map(encodeURIComponent).join('/')}/${content.map(encodeURIComponent).join('/')}`;
    return url.href;
  }

  function rewritePrompt(text) {
    const value = String(text ?? '');
    if (useGeneratedView) {
      return value.replace(/まず gpts\/projects\/([^\s]+\.md)/g, `まず ${VIEW_SOURCE.repo}/${OBJECT_DIR}/$1`);
    }
    return value.replace(`まず ${DEFAULT_SOURCE.repo}/`, `まず ${source.repo}/`);
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
    const label = useGeneratedView ? `${VIEW_SOURCE.repo} / ${VIEW_SOURCE.path}` : `${source.repo} / ${source.dir}`;
    const after = before.replace(`${DEFAULT_SOURCE.repo} / ${DEFAULT_SOURCE.dir}`, label).replace('source: gpts/projects', `source: ${label}`);
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
