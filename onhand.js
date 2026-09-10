(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const REPO = 'my-storage-note';
  const TOKEN_KEY = 'zen-note-github-token';
  const HISTORY_KEY = 'cockpid.today-movement.checked.v1';
  const AUDIT_PATH = 'indexes/movement/2026-06-10_2026-09-10-work-home-task-audit.json';
  const TYPES = ['action', 'question', 'idea', 'theme', 'hypothesis'];
  const MODES = new Set(['do', 'check', 'keep']);
  const buckets = ['do', 'check', 'keep'];
  const targets = {
    do: { count: document.getElementById('fullDoCount'), list: document.getElementById('fullDoItems') },
    check: { count: document.getElementById('fullCheckCount'), list: document.getElementById('fullCheckItems') },
    keep: { count: document.getElementById('fullKeepCount'), list: document.getElementById('fullKeepItems') }
  };
  const sourceRange = document.getElementById('sourceRange');
  const pools = { do: [], check: [], keep: [] };
  let filter = 'all';
  let history = readHistory();

  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const decode = (v) => {
    const b = atob(String(v || '').replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
  };

  async function gh(path) {
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=main`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token()}` }
    });
    if (r.status === 404) return null;
    if (!r.ok) throw Error(`GitHub ${r.status}`);
    return r.json();
  }

  function jstParts() {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
    const get = (t) => Number(p.find((x) => x.type === t)?.value || 0);
    return { year:get('year'), month:get('month'), day:get('day') };
  }

  function key(p) { return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`; }
  function shift(p, d) {
    const x = new Date(Date.UTC(p.year, p.month - 1, p.day + d));
    return { year:x.getUTCFullYear(), month:x.getUTCMonth() + 1, day:x.getUTCDate() };
  }

  const today = key(jstParts());
  const start = key(shift(jstParts(), -6));

  function normalizeHistory(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.entries(raw).forEach(([id, v]) => {
      if (v?.status === 'done' || v?.status === 'skip') out[id] = v;
      else if (v?.checked_at) out[id] = { status:'done', at:v.checked_at };
    });
    return out;
  }

  function readHistory() {
    try { return normalizeHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}')); }
    catch (_) { return {}; }
  }

  function historyFromText(text) {
    try { return normalizeHistory(JSON.parse(text || '{}')); }
    catch (_) { return {}; }
  }

  function writeHistory() { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }

  function itemId(item) {
    const seed = `${item._date}|${item._type}|${item.title || item.summary || ''}`;
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `m${(hash >>> 0).toString(36)}`;
  }

  function titleKey(item) {
    return String(item?.title || item?.summary || '').trim().replace(/\s+/g, ' ');
  }

  function classify(type, item) {
    if (MODES.has(item?.mode)) return item.mode;
    const text = `${item?.title || ''} ${item?.summary || ''}`;
    if (type === 'question') return 'check';
    if (type === 'idea' || type === 'theme') return 'keep';
    if (type === 'hypothesis') {
      if (/(考え|検討|整理|構想|方針|設計|判断|振り返)/.test(text)) return 'keep';
      return 'check';
    }
    if (/(確認|状況|対象|進捗|チェック|把握|照合|レビュー|聞く|調べる|見直す)/.test(text)) return 'check';
    if (/(考え|検討|整理|構想|方針|目的|設計|見極め|判断|振り返)/.test(text)) return 'keep';
    return 'do';
  }

  function mergeByPriority(...groups) {
    const seen = new Set();
    const merged = [];
    groups.flat().forEach((item) => {
      const k = titleKey(item);
      if (!k || seen.has(k)) return;
      seen.add(k);
      merged.push(item);
    });
    return merged;
  }

  function unique(items) { return mergeByPriority(items); }
  function statusOf(item) { return history[itemId(item)]?.status || 'open'; }
  function matchFilter(item) { return filter === 'all' || statusOf(item) === filter; }
  function timeOf(v) {
    try { return v ? new Date(v).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' }) : ''; }
    catch (_) { return ''; }
  }

  function bucketForId(id) {
    return buckets.find((bucket) => pools[bucket].some((item) => itemId(item) === id)) || null;
  }

  function row(bucket, item) {
    const id = itemId(item);
    const state = history[id] || null;
    const status = state?.status || 'open';
    const title = item.title || item.summary || 'Untitled';
    const time = timeOf(state?.at);
    return `<div class="item${status === 'done' ? ' is-done' : ''}${status === 'skip' ? ' is-skip' : ''}" data-row-id="${id}">
      <input type="checkbox" class="done-box" data-id="${id}" data-bucket="${bucket}" ${status === 'done' ? 'checked' : ''} ${status === 'skip' ? 'disabled' : ''} aria-label="Done">
      <div class="item-main"><span class="item-title">${esc(title)}</span><div class="item-meta"><span>[${esc(item._type)}]</span><span>${esc(item._date)}</span>${status !== 'open' ? `<span class="status ${status}">${status.toUpperCase()}${time ? ` ${esc(time)}` : ''}</span>` : ''}</div></div>
      <button class="skip-btn" data-id="${id}" data-bucket="${bucket}" ${status === 'done' ? 'disabled' : ''}>${status === 'skip' ? 'UNDO' : 'SKIP'}</button>
    </div>`;
  }

  function renderBucket(bucket) {
    const all = unique(pools[bucket]).sort((a, b) => String(b._date).localeCompare(String(a._date)));
    const openCount = all.filter((item) => statusOf(item) === 'open').length;
    targets[bucket].count.textContent = `${openCount} OPEN · ${all.length} ALL`;
    const shown = all.filter(matchFilter);
    targets[bucket].list.innerHTML = shown.length ? shown.map((item) => row(bucket, item)).join('') : '<div class="empty">該当する項目はありません。</div>';
  }

  function renderAll() { buckets.forEach(renderBucket); }

  function setStatus(bucket, id, status) {
    if (status === 'done' || status === 'skip') history[id] = { status, at:new Date().toISOString() };
    else delete history[id];
    writeHistory();
    renderBucket(bucket);
  }

  async function loadCurated() {
    try {
      const p = await gh(`indexes/movement/${start}_${today}.json`);
      if (!p?.content) return null;
      const data = JSON.parse(decode(p.content));
      if (!Array.isArray(data?.items)) return null;
      return data.items.map((item) => ({ ...item, _type:item.type || 'idea', _date:item.date || today, _source:'week' }));
    } catch (error) {
      console.error('ON HAND curated load failed', error);
      return null;
    }
  }

  async function loadLegacy() {
    const directories = await Promise.all(TYPES.map(async (type) => {
      try {
        const entries = await gh(`extracted/${type}`);
        return { type, entries:Array.isArray(entries) ? entries : [] };
      } catch (error) {
        console.error(error);
        return { type, entries:[] };
      }
    }));

    const files = [];
    directories.forEach(({ type, entries }) => entries.forEach((entry) => {
      if (entry?.type !== 'file' || !/^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name)) return;
      const date = entry.name.slice(0, 10);
      if (date < start || date > today) return;
      files.push({ type, date, path:`extracted/${type}/${entry.name}` });
    }));

    const groups = await Promise.all(files.map(async (file) => {
      try {
        const p = await gh(file.path);
        if (!p?.content) return [];
        const data = JSON.parse(decode(p.content));
        return (Array.isArray(data?.items) ? data.items : []).map((item) => ({ ...item, _type:file.type, _date:file.date, _source:'legacy' }));
      } catch (error) {
        console.error(error);
        return [];
      }
    }));
    return groups.flat();
  }

  async function loadSevenDays() {
    const curated = await loadCurated();
    if (curated?.length) return { items:curated, curated:true };
    return { items:await loadLegacy(), curated:false };
  }

  async function loadAudit() {
    try {
      const p = await gh(AUDIT_PATH);
      if (!p?.content) return { items:[], loaded:false };
      const data = JSON.parse(decode(p.content));
      if (!Array.isArray(data?.items)) return { items:[], loaded:false };
      const items = data.items
        .filter((item) => String(item?.state_at_last_source || '').toLowerCase() !== 'completed')
        .filter((item) => MODES.has(item?.mode))
        .map((item) => ({ ...item, _type:item.type || 'action', _date:item.last_seen || item.first_seen || today, _source:'audit' }));
      return { items, loaded:true };
    } catch (error) {
      console.error('ON HAND audit load failed', error);
      return { items:[], loaded:false };
    }
  }

  async function boot() {
    if (!token()) {
      sourceRange.textContent = 'ON HAND · TOKEN REQUIRED';
      Object.values(targets).forEach((t) => {
        t.count.textContent = '—';
        t.list.innerHTML = '<div class="empty">GitHub token が必要です。</div>';
      });
      return;
    }

    const [week, audit] = await Promise.all([loadSevenDays(), loadAudit()]);
    const items = mergeByPriority(week.items, audit.items);
    buckets.forEach((bucket) => { pools[bucket].length = 0; });
    items.forEach((item) => pools[classify(item._type, item)].push(item));
    sourceRange.textContent = `${start} – ${today}${audit.loaded ? ' + 3 MONTH AUDIT' : ''}${week.curated ? ' · CURATED' : ''}`;
    renderAll();
  }

  document.querySelector('.filters')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('is-active', x === button));
    renderAll();
  });

  document.querySelector('.onhand-grid')?.addEventListener('change', (event) => {
    const input = event.target.closest('.done-box[data-id]');
    if (!input) return;
    setStatus(input.dataset.bucket, input.dataset.id, input.checked ? 'done' : null);
  });

  document.querySelector('.onhand-grid')?.addEventListener('click', (event) => {
    const button = event.target.closest('.skip-btn[data-id]');
    if (!button) return;
    const id = button.dataset.id;
    const bucket = button.dataset.bucket;
    setStatus(bucket, id, history[id]?.status === 'skip' ? null : 'skip');
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== HISTORY_KEY) return;
    const previous = historyFromText(event.oldValue);
    history = historyFromText(event.newValue);
    const changed = new Set([...Object.keys(previous), ...Object.keys(history)].filter((id) => JSON.stringify(previous[id] || null) !== JSON.stringify(history[id] || null)));
    const affected = new Set([...changed].map(bucketForId).filter(Boolean));
    affected.forEach(renderBucket);
  });

  boot().catch((error) => {
    console.error(error);
    sourceRange.textContent = 'ON HAND · ERROR';
  });
})();