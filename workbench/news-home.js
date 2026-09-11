(() => {
  'use strict';

  const list = document.getElementById('newsHomeList');
  if (!list) return;

  const DATA_URL = 'https://plzsayyes3.github.io/My_Internet_place/data/latest.json';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pickThree(items) {
    const ranked = [...items].sort((a, b) => {
      const scoreDiff = Number(b.rank_score || 0) - Number(a.rank_score || 0);
      if (scoreDiff) return scoreDiff;
      return String(b.published_at || '').localeCompare(String(a.published_at || ''));
    });

    const selected = [];
    const usedSources = new Set();
    for (const item of ranked) {
      const source = String(item.source_id || item.source || '');
      if (source && usedSources.has(source)) continue;
      selected.push(item);
      if (source) usedSources.add(source);
      if (selected.length === 3) return selected;
    }
    for (const item of ranked) {
      if (selected.includes(item)) continue;
      selected.push(item);
      if (selected.length === 3) break;
    }
    return selected;
  }

  async function loadNews() {
    try {
      const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`news ${response.status}`);
      const payload = await response.json();
      const items = Array.isArray(payload?.items) ? pickThree(payload.items) : [];
      if (!items.length) throw new Error('no news');

      list.innerHTML = items.map((item) => `
        <div class="news-home-item">
          <span class="news-home-source">${escapeHtml(item.source || 'NEWS')}</span>
          <span class="news-home-title">${escapeHtml(item.title || 'Untitled')}</span>
        </div>`).join('');
    } catch (error) {
      console.error(error);
      list.innerHTML = '<div class="news-home-empty">ニュースを読み込めませんでした。</div>';
    }
  }

  loadNews();
})();
