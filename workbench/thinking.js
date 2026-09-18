(() => {
  'use strict';

  const TYPES = ['idea', 'theme', 'question', 'hypothesis', 'action'];
  const AUDIT_NAME = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})-work-home-task-audit\.json$/;
  const RECENT_DAYS = 14;
  const FALLBACK_DAYS = 14;

  const status = document.getElementById('thinkingStatus');
  const summary = document.getElementById('thinkingSummary');
  const search = document.getElementById('thinkingSearch');
  const tabs = [...document.querySelectorAll('[data-type]')];
  const lists = {
    recent: document.getElementById('recentList'),
    recurring: document.getElementById('recurringList'),
    old: document.getElementById('oldList')
  };
  const counts = {
    recent: document.getElementById('recentCount'),
    recurring: document.getElementById('recurringCount'),
    old: document.getElementById('oldCount')
  };

  const state = { type: 'all', query: '', sections: { recent: [], recurring: [], old: [] }, warnings: [] };

  const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
  const titleKey = (value) => clean(value?.title ?? value).toLowerCase();
  const escText = (value) => esc(String(value ?? ''));
  const todayKey = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || '00';
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const dateMinus = (days) => {
    const [y,m,d] = todayKey().split('-').map(Number);
    const date = new Date(Date.UTC(y,m-1,d-days));
    return date.toISOString().slice(0,10);
  };
  const mondayKey = () => {
    const [y,m,d] = todayKey().split('-').map(Number);
    const date = new Date(Date.UTC(y,m-1,d));
    const offset = (date.getUTCDay()+6)%7;
    date.setUTCDate(date.getUTCDate()-offset);
    return date.toISOString().slice(0,10);
  };

  function normalizeItem(item, fallback = {}) {
    return {
      ...item,
      _type: String(item?._type || item?.type || fallback.type || 'idea').toLowerCase(),
      _date: String(item?._date || item?.date || item?.last_seen || item?.first_seen || fallback.date || todayKey()).slice(0,10),
      _source: item?._source || fallback.source || 'recent',
      source_path: item?.source_path || fallback.sourcePath || ''
    };
  }

  async function loadCuratedWeek() {
    try {
      const path = `memory/indexes/movement/${mondayKey()}_${todayKey()}.json`;
      const payload = await gh(path, 'my-storage-note');
      if (!payload?.content) return null;
      const data = JSON.parse(decode(payload.content));
      if (!Array.isArray(data?.items)) return null;
      return data.items.map((item) => normalizeItem(item, { source: 'week' }));
    } catch (error) {
      console.warn('[Thinking] curated week unavailable', error);
      return null;
    }
  }

  async function loadRecentFallback() {
    const cutoff = dateMinus(FALLBACK_DAYS - 1);
    const warnings = new Set();
    const files = [];

    await Promise.all(TYPES.map(async (type) => {
      try {
        const entries = await gh(`memory/extracted/${type}`, 'my-storage-note');
        (Array.isArray(entries) ? entries : []).forEach((entry) => {
          if (entry?.type !== 'file' || !/^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name)) return;
          const date = entry.name.slice(0,10);
          if (date >= cutoff && date <= todayKey()) files.push({ type, date, path: entry.path });
        });
      } catch (error) {
        warnings.add(type);
        console.warn('[Thinking] recent directory failed', type, error);
      }
    }));

    const groups = await Promise.all(files.map(async (file) => {
      try {
        const payload = await gh(file.path, 'my-storage-note');
        if (!payload?.content) throw new Error('content missing');
        const data = JSON.parse(decode(payload.content));
        const sourcePath = data?.source?.path || '';
        return (Array.isArray(data?.items) ? data.items : []).map((item) =>
          normalizeItem(item, { type: file.type, date: file.date, source: 'recent', sourcePath })
        );
      } catch (error) {
        warnings.add(file.type);
        console.warn('[Thinking] recent file failed', file.path, error);
        return [];
      }
    }));

    return { items: groups.flat(), warnings: [...warnings] };
  }

  async function latestAuditPath() {
    const entries = await gh('memory/indexes/movement', 'my-storage-note');
    const matches = (Array.isArray(entries) ? entries : [])
      .filter((entry) => entry?.type === 'file' && AUDIT_NAME.test(entry.name))
      .sort((a,b) => b.name.localeCompare(a.name));
    return matches[0]?.path || '';
  }

  async function loadAudit() {
    try {
      const path = await latestAuditPath();
      if (!path) return { items: [], recurring: new Set(), loaded: false };
      const payload = await gh(path, 'my-storage-note');
      if (!payload?.content) throw new Error('audit content missing');
      const data = JSON.parse(decode(payload.content));
      const items = (Array.isArray(data?.items) ? data.items : [])
        .filter((item) => String(item?.state_at_last_source || '').toLowerCase() !== 'completed')
        .map((item) => normalizeItem(item, { source: 'audit' }));
      const recurring = new Set((Array.isArray(data?.recurring_work) ? data.recurring_work : []).map(titleKey).filter(Boolean));
      return { items, recurring, loaded: true };
    } catch (error) {
      console.warn('[Thinking] audit unavailable', error);
      state.warnings.push('audit');
      return { items: [], recurring: new Set(), loaded: false };
    }
  }

  function dedupeLatest(items) {
    const map = new Map();
    [...items].sort((a,b) => String(b._date).localeCompare(String(a._date))).forEach((item) => {
      const key = `${item._type}|${titleKey(item)}`;
      if (!titleKey(item) || map.has(key)) return;
      map.set(key, item);
    });
    return [...map.values()];
  }

  function occurrenceCounts(items) {
    const counts = new Map();
    items.forEach((item) => {
      const key = titleKey(item);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }

  function buildSections(recentItems, audit) {
    const recentCutoff = dateMinus(RECENT_DAYS - 1);
    const recentAll = recentItems.filter((item) => item._date >= recentCutoff);
    const recent = dedupeLatest(recentAll).sort((a,b) => b._date.localeCompare(a._date));
    const recentKeys = new Set(recent.map(titleKey));
    const occurrences = occurrenceCounts(recentItems);
    const recurringCandidates = [...recentItems, ...audit.items].filter((item) => {
      const key = titleKey(item);
      return key && (audit.recurring.has(key) || occurrences.get(key) > 1 || item.recurring || item.cadence);
    });
    const recurring = dedupeLatest(recurringCandidates)
      .map((item) => ({ ...item, _occurrences: Math.max(occurrences.get(titleKey(item)) || 0, audit.recurring.has(titleKey(item)) ? 2 : 0) }))
      .sort((a,b) => String(b._date).localeCompare(String(a._date)));
    const old = dedupeLatest(audit.items.filter((item) =>
      item._date < recentCutoff && !recentKeys.has(titleKey(item))
    )).sort((a,b) => String(b._date).localeCompare(String(a._date)));

    state.sections = { recent, recurring, old };
  }

  function sourceUrl(item) {
    const path = String(item?.source_path || '').replace(/^\/+/, '');
    return path ? `https://github.com/plzsayyes3/mynotebook/blob/main/${path.split('/').map(encodeURIComponent).join('/')}` : '';
  }

  function typeLabel(type) {
    return ({idea:'IDEA',theme:'THEME',question:'QUESTION',hypothesis:'HYPOTHESIS',action:'ACTION'})[type] || String(type || '').toUpperCase();
  }

  function modeLabel(mode) {
    const value = String(mode || '').toLowerCase();
    if (value === 'do') return 'TASK';
    return value ? value.toUpperCase() : '—';
  }

  function cardHtml(item) {
    const source = sourceUrl(item);
    const recurrence = item._occurrences > 1 ? ` · ${item._occurrences}x` : '';
    const entity = Array.isArray(item.entities) && item.entities[0]?.name ? item.entities[0].name : '';
    return `<article class="thinking-card">
      <div class="card-top">
        <span class="type-badge" data-type="${escText(item._type)}">${escText(typeLabel(item._type))}</span>
        <span class="card-meta">${escText(item._date)}${escText(recurrence)}</span>
        <span class="mode-badge">${escText(modeLabel(item.mode))}</span>
      </div>
      <h3>${escText(item.title || item.summary || 'Untitled')}</h3>
      ${item.summary ? `<p class="card-summary">${escText(item.summary)}</p>` : ''}
      <div class="card-meta">
        ${entity ? `<span>${escText(entity)}</span>` : ''}
        ${item.confidence != null ? `<span>confidence ${Math.round(Number(item.confidence) * 100)}%</span>` : ''}
      </div>
      <div class="card-actions">
        ${source ? `<a class="card-source" href="${escText(source)}" target="_blank" rel="noopener noreferrer">SOURCE ↗</a>` : '<span></span>'}
        <button class="card-action" type="button" data-open-onhand>判断する →</button>
      </div>
    </article>`;
  }

  function matches(item) {
    if (state.type !== 'all' && item._type !== state.type) return false;
    if (!state.query) return true;
    const haystack = [item.title,item.summary,item.evidence,item._type,item.mode]
      .join(' ').toLowerCase();
    return haystack.includes(state.query);
  }

  function renderSection(name) {
    const items = state.sections[name].filter(matches);
    counts[name].textContent = String(items.length);
    const section = lists[name].closest('.thinking-section');
    section?.classList.toggle('is-empty', !items.length);
    lists[name].innerHTML = items.length
      ? items.map(cardHtml).join('')
      : '<div class="thinking-empty">該当する項目はありません。</div>';
  }

  function renderSummary() {
    const totals = Object.fromEntries(TYPES.map((type) => [type, 0]));
    const seen = new Set();
    Object.values(state.sections).flat().forEach((item) => {
      const key = `${item._type}|${titleKey(item)}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (totals[item._type] != null) totals[item._type] += 1;
    });
    summary.innerHTML = TYPES.map((type) =>
      `<span class="summary-chip"><span>${typeLabel(type)}</span><b>${totals[type]}</b></span>`
    ).join('');
  }

  function render() {
    renderSection('recent');
    renderSection('recurring');
    renderSection('old');
    renderSummary();
  }

  function openOnHand() {
    try {
      if (window.parent !== window && window.parent.COCKPID_ROUTER?.openApp) {
        window.parent.COCKPID_ROUTER.openApp('onhand');
        return;
      }
    } catch (_) {}
    window.location.href = 'onhand.html';
  }

  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('[data-type]');
    if (tab) {
      state.type = tab.dataset.type || 'all';
      tabs.forEach((button) => button.classList.toggle('active', button === tab));
      render();
      return;
    }
    if (event.target.closest?.('[data-open-onhand]')) openOnHand();
  });

  search.addEventListener('input', () => {
    state.query = clean(search.value).toLowerCase();
    render();
  });

  async function boot() {
    if (!token()) {
      status.textContent = 'TOKEN REQUIRED';
      status.classList.add('error');
      Object.values(lists).forEach((list) => { list.innerHTML = '<div class="thinking-empty">Workbench SettingsでGitHub tokenを設定してください。</div>'; });
      return;
    }

    try {
      status.textContent = 'READING…';
      state.warnings = [];
      const [curated, audit] = await Promise.all([loadCuratedWeek(), loadAudit()]);
      let recentItems = curated;
      if (!recentItems?.length) {
        const fallback = await loadRecentFallback();
        recentItems = fallback.items;
        state.warnings.push(...fallback.warnings.map((type) => `recent:${type}`));
      }
      buildSections(recentItems || [], audit);
      render();
      status.textContent = state.warnings.length
        ? `PARTIAL · ${state.warnings.join(', ')}`
        : `${state.sections.recent.length} RECENT · ${state.sections.recurring.length} RECURRING`;
      status.classList.toggle('error', Boolean(state.warnings.length));
    } catch (error) {
      console.error('[Thinking] boot failed', error);
      status.textContent = 'READ ERROR';
      status.classList.add('error');
      Object.values(lists).forEach((list) => { list.innerHTML = '<div class="thinking-empty">Thinking dataを読み込めませんでした。</div>'; });
    }
  }

  boot();
})();