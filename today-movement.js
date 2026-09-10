(() => {
  'use strict';

  const TYPES = ['action', 'question', 'idea', 'theme', 'hypothesis'];
  const targets = {
    do: { count: document.getElementById('moveDoCount'), list: document.getElementById('moveDoItems') },
    check: { count: document.getElementById('moveCheckCount'), list: document.getElementById('moveCheckItems') },
    think: { count: document.getElementById('moveThinkCount'), list: document.getElementById('moveThinkItems') }
  };
  const source = document.getElementById('movementDate');
  if (!targets.do.list || !targets.check.list || !targets.think.list) return;

  const dateName = /^\d{4}-\d{2}-\d{2}\.json$/;
  const todayKey = (() => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  })();

  function classify(type, item) {
    const text = `${item?.title || ''} ${item?.summary || ''}`;
    if (type === 'question') return 'check';
    if (type === 'idea' || type === 'theme' || type === 'hypothesis') return 'think';
    if (/(確認|状況|対象|進捗|チェック|把握|照合|レビュー|聞く|調べる|見直す)/.test(text)) return 'check';
    if (/(考え|検討|整理|構想|方針|目的|設計|見極め|判断|振り返)/.test(text)) return 'think';
    return 'do';
  }

  function unique(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = String(item.title || item.summary || '').trim().replace(/\s+/g, ' ');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function render(bucket, items) {
    const target = targets[bucket];
    const cleaned = unique(items);
    target.count.textContent = String(cleaned.length);
    if (!cleaned.length) {
      target.list.innerHTML = '<div class="movement-empty">—</div>';
      return;
    }
    target.list.innerHTML = cleaned.slice(0, 2).map((item) => {
      const title = item.title || item.summary || 'Untitled';
      return `<div class="movement-item" title="${esc(title)}"><span class="movement-item-title">${esc(title)}</span><span class="movement-item-type">[${esc(item._type)}]</span></div>`;
    }).join('');
  }

  async function latestAnalysis() {
    const directories = await Promise.all(TYPES.map(async (type) => {
      try {
        const entries = await gh(`extracted/${type}`, 'my-storage-note');
        return { type, entries: Array.isArray(entries) ? entries : [] };
      } catch (error) {
        console.error(error);
        return { type, entries: [] };
      }
    }));

    const dates = directories.flatMap(({ entries }) => entries
      .filter((entry) => entry?.type === 'file' && dateName.test(entry.name))
      .map((entry) => entry.name.slice(0, 10)))
      .filter((date) => date <= todayKey)
      .sort((a, b) => b.localeCompare(a));

    const latest = dates[0];
    if (!latest) return null;

    const available = new Map(directories.map(({ type, entries }) => [type, new Set(entries.map((entry) => entry.name))]));
    const payloads = await Promise.all(TYPES.map(async (type) => {
      if (!available.get(type)?.has(`${latest}.json`)) return { type, items: [] };
      try {
        const payload = await gh(`extracted/${type}/${latest}.json`, 'my-storage-note');
        if (!payload?.content) return { type, items: [] };
        const data = JSON.parse(decode(payload.content));
        return { type, items: Array.isArray(data?.items) ? data.items : [] };
      } catch (error) {
        console.error(error);
        return { type, items: [] };
      }
    }));
    return { date: latest, payloads };
  }

  async function loadMovement() {
    if (!token()) {
      source.textContent = 'ANALYSIS OFF';
      Object.values(targets).forEach((target) => {
        target.count.textContent = '—';
        target.list.innerHTML = '<div class="movement-empty">token required</div>';
      });
      return;
    }

    source.textContent = 'ANALYSIS …';
    const result = await latestAnalysis();
    if (!result) {
      source.textContent = 'NO ANALYSIS';
      render('do', []); render('check', []); render('think', []);
      return;
    }

    const buckets = { do: [], check: [], think: [] };
    result.payloads.forEach(({ type, items }) => {
      items.forEach((item) => {
        const enriched = { ...item, _type: type };
        buckets[classify(type, enriched)].push(enriched);
      });
    });

    render('do', buckets.do);
    render('check', buckets.check);
    render('think', buckets.think);
    source.textContent = `ANALYSIS ${result.date.slice(5).replace('-', '.')}`;
  }

  loadMovement().catch((error) => {
    console.error(error);
    source.textContent = 'ANALYSIS ERROR';
  });
})();
