((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaskLinerNotePull = api;
})(globalThis, () => {
  'use strict';

  const CACHE_PREFIX = 'taskliner_note_cache_v1:';

  function normalizeTarget(raw) {
    let target = String(raw || '').trim();
    const alias = target.indexOf('|');
    if (alias >= 0) target = target.slice(0, alias).trim();
    const heading = target.indexOf('#');
    if (heading >= 0) target = target.slice(0, heading).trim();
    target = target.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!target || /[?#]/.test(target)) throw new Error('ノートリンクのパスが空です');

    const parts = target.split('/').map(part => {
      let decoded;
      try { decoded = decodeURIComponent(part).trim(); }
      catch { throw new Error('ノートリンクのURLエンコードが不正です'); }
      if (!decoded || decoded === '.' || decoded === '..' || /[\u0000-\u001f]/.test(decoded)) {
        throw new Error('ノートリンクのパスが不正です');
      }
      return decoded;
    });
    let path = parts.join('/');
    if (!/\.md$/i.test(path)) path += '.md';
    return path;
  }

  function cacheKey(repo, branch, path) {
    return CACHE_PREFIX + [repo, branch, path].map(value => encodeURIComponent(String(value))).join(':');
  }

  function resolvePath(target, paths) {
    const keyOf = value => String(value || '').normalize('NFC').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\.md$/i, '').toLocaleLowerCase('ja');
    const targetKey = keyOf(target);
    const hasDirectory = targetKey.includes('/');
    const candidates = [...new Set((Array.isArray(paths) ? paths : [])
      .filter(path => /\.md$/i.test(String(path || '')))
      .filter(path => {
        const normalized = keyOf(path);
        return hasDirectory ? normalized === targetKey : normalized.split('/').pop() === targetKey;
      }))].sort();
    return { path: candidates.length === 1 ? candidates[0] : null, candidates };
  }

  function cache(storage, { repo, branch, path, sha, content, pulledAt = new Date().toISOString() }) {
    const key = cacheKey(repo, branch, path);
    storage.setItem(key, JSON.stringify({ repo, branch, path, sha, content, pulledAt }));
    return key;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function renderInline(value) {
    let html = escapeHtml(value);
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi,
      (_match, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
    return html;
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    let paragraph = [], listTag = '', listItems = [], quote = [], code = null;
    const flushParagraph = () => {
      if (paragraph.length) output.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (listTag) output.push(`<${listTag}>${listItems.map(item => `<li>${renderInline(item)}</li>`).join('')}</${listTag}>`);
      listTag = '';
      listItems = [];
    };
    const flushQuote = () => {
      if (quote.length) output.push(`<blockquote><p>${quote.map(renderInline).join('<br>')}</p></blockquote>`);
      quote = [];
    };
    const flushCode = () => {
      output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      code = null;
    };

    for (const line of lines) {
      if (/^\s*```/.test(line)) {
        flushParagraph(); flushList(); flushQuote();
        if (code) flushCode(); else code = [];
        continue;
      }
      if (code) { code.push(line); continue; }
      const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
      const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      const quoted = line.match(/^\s*>\s?(.*)$/);
      if (!line.trim() || heading || bullet || ordered || quoted || /^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) flushParagraph();
      if (heading) {
        flushList(); flushQuote();
        const level = heading[1].length;
        output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      } else if (bullet || ordered) {
        flushQuote();
        const nextTag = bullet ? 'ul' : 'ol';
        if (listTag && listTag !== nextTag) flushList();
        listTag = nextTag;
        listItems.push((bullet || ordered)[1]);
      } else if (quoted) {
        flushList();
        quote.push(quoted[1]);
      } else if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
        flushList(); flushQuote(); output.push('<hr>');
      } else if (line.trim()) {
        flushList(); flushQuote(); paragraph.push(line.trim());
      } else {
        flushList(); flushQuote();
      }
    }
    flushParagraph(); flushList(); flushQuote();
    if (code) flushCode();
    return output.join('');
  }

  return { normalizeTarget, resolvePath, cacheKey, cache, renderMarkdown };
});
