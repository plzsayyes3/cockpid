(() => {
  'use strict';

  const BOARD_PATH = 'brain/coordination/cockpid-board.md';
  const BOARD_REPO = 'my-storage-note';
  const META_KEYS = new Set(['status', 'area', 'owner', 'started', 'branch', 'commit', 'summary', 'next', 'blocked reason', 'updated']);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function renderValue(key, value) {
    const safe = escapeHtml(value);
    if (key !== 'status') return safe || '—';
    const slug = String(value || '').toLowerCase().replace(/[^a-z]+/g, '-');
    return `<span class="board-status board-status-${slug}">${safe || '—'}</span>`;
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r/g, '').split('\n');
    const html = [];
    let listOpen = false;

    const closeList = () => {
      if (!listOpen) return;
      html.push('</div>');
      listOpen = false;
    };

    for (const raw of lines) {
      const line = raw.trimEnd();
      const trimmed = line.trim();
      if (!trimmed) {
        closeList();
        continue;
      }

      const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
      if (heading) {
        closeList();
        const level = Math.min(3, heading[1].length);
        html.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
        continue;
      }

      const bullet = /^-\s+(.+)$/.exec(trimmed);
      if (bullet) {
        if (!listOpen) {
          html.push('<div class="board-list">');
          listOpen = true;
        }
        const kv = /^([^:]+):\s*(.*)$/.exec(bullet[1]);
        if (kv && META_KEYS.has(kv[1].trim().toLowerCase())) {
          const key = kv[1].trim().toLowerCase();
          html.push(`<div class="board-list-item board-meta"><span>${escapeHtml(kv[1].trim())}</span><strong>${renderValue(key, kv[2].trim())}</strong></div>`);
        } else {
          html.push(`<div class="board-list-item">${escapeHtml(bullet[1])}</div>`);
        }
        continue;
      }

      closeList();
      const meta = /^([^:]+):\s*(.*)$/.exec(trimmed);
      if (meta && META_KEYS.has(meta[1].trim().toLowerCase())) {
        const key = meta[1].trim().toLowerCase();
        html.push(`<div class="board-meta"><span>${escapeHtml(meta[1].trim())}</span><strong>${renderValue(key, meta[2].trim())}</strong></div>`);
        continue;
      }

      html.push(`<p>${escapeHtml(trimmed)}</p>`);
    }

    closeList();
    return html.join('');
  }

  async function render(container) {
    if (!container) return;
    container.innerHTML = '<div class="board-view"><div class="board-loading">BOARDを読んでいます…</div></div>';

    if (typeof token !== 'function' || !token()) {
      container.innerHTML = '<div class="board-view"><div class="board-error"><strong>GitHub token が必要です。</strong><p>BOARDはprivateな my-storage-note リポジトリから読み込みます。</p></div></div>';
      return;
    }

    try {
      const payload = await gh(BOARD_PATH, BOARD_REPO);
      if (!payload?.content) throw new Error('BOARD file not found');
      const markdown = decode(payload.content);
      container.innerHTML = `<div class="board-view">${renderMarkdown(markdown)}</div>`;
    } catch (error) {
      console.error(error);
      container.innerHTML = `<div class="board-view"><div class="board-error"><strong>BOARDを読み込めませんでした。</strong><p>${escapeHtml(error?.message || error)}</p><p>保存済みGitHub tokenに plzsayyes3/my-storage-note の読み取り権限があるか確認してください。</p></div></div>`;
    }
  }

  window.COCKPID_BOARD = Object.freeze({ render, path: BOARD_PATH, repo: BOARD_REPO });
})();
