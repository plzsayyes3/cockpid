(() => {
  'use strict';

  const TYPES = ['action', 'question', 'idea', 'theme', 'hypothesis'];
  const MODES = new Set(['do', 'check', 'keep']);
  const HISTORY_KEY = 'cockpid.today-movement.checked.v1';
  const DISPLAY_LIMIT = 2;
  const targets = {
    do: { count: document.getElementById('moveDoCount'), list: document.getElementById('moveDoItems') },
    check: { count: document.getElementById('moveCheckCount'), list: document.getElementById('moveCheckItems') },
    keep: { count: document.getElementById('moveThinkCount'), list: document.getElementById('moveThinkItems') }
  };
  const source = document.getElementById('movementDate');
  const randomButton = document.getElementById('movementRandom');
  const root = document.querySelector('.movement-object');
  if (!targets.do.list || !targets.check.list || !targets.keep.list || !root) return;

  const dateName = /^\d{4}-\d{2}-\d{2}\.json$/;
  const pools = { do: [], check: [], keep: [] };
  const queues = { do: [], check: [], keep: [] };
  let history = readHistory();

  function jstDateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    return { year: get('year'), month: get('month'), day: get('day') };
  }

  function dateKey(parts) {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  function shiftDays(parts, delta) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + delta));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }

  const todayKey = dateKey(jstDateParts());
  const weekStartKey = dateKey(shiftDays(jstDateParts(), -6));

  function readHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
      if (!raw || typeof raw !== 'object') return {};
      const migrated = {};
      Object.entries(raw).forEach(([id, value]) => {
        if (value?.status === 'done' || value?.status === 'skip') {
          migrated[id] = value;
        } else if (value?.checked_at) {
          migrated[id] = { status: 'done', at: value.checked_at };
        }
      });
      return migrated;
    } catch (_) {
      return {};
    }
  }

  function writeHistory() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function itemId(item) {
    const seed = `${item._date}|${item._type}|${item.title || item.summary || ''}`;
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `m${(hash >>> 0).toString(36)}`;
  }

  function classify(type, item) {
    if (MODES.has(item?.mode)) return item.mode;
    const text = `${item?.title || ''} ${item?.summary || ''}`;
    if (type === 'question' || type === 'hypothesis') return 'check';
    if (type === 'idea' || type === 'theme') return 'keep';
    if (/(確認|状況|対象|進捗|チェック|把握|照合|レビュー|聞く|調べる|見直す)/.test(text)) return 'check';
    if (/(考え|検討|整理|構想|方針|目的|設計|見極め|判断|振り返)/.test(text)) return 'keep';
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

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function poolItems(bucket) {
    return unique(pools[bucket]);
  }

  function openItems(bucket) {
    return poolItems(bucket).filter((item) => !history[itemId(item)]);
  }

  function itemById(bucket, id) {
    return poolItems(bucket).find((item) => itemId(item) === id) || null;
  }

  function rebuildQueue(bucket) {
    queues[bucket] = shuffle(openItems(bucket)).map(itemId);
  }

  function syncQueue(bucket) {
    const open = openItems(bucket);
    const openIds = new Set(open.map(itemId));
    queues[bucket] = queues[bucket].filter((id) => openIds.has(id));
    open.forEach((item) => {
      const id = itemId(item);
      if (!queues[bucket].includes(id)) queues[bucket].push(id);
    });
  }

  function emptyRow(label = '候補なし') {
    return `<div class="movement-item movement-item-empty"><input type="checkbox" disabled><span class="movement-item-body"><span class="movement-item-title">${esc(label)}</span></span></div>`;
  }

  function formatTime(value) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }

  function rowHtml(bucket, item, processed = false) {
    const id = itemId(item);
    const state = history[id] || null;
    const title = item.title || item.summary || 'Untitled';
    const status = state?.status || '';
    const time = formatTime(state?.at);
    const isDone = status === 'done';
    const isSkip = status === 'skip';
    const statusText = isDone ? 'DONE' : isSkip ? 'SKIP' : '';
    const skipLabel = isSkip ? 'UNDO' : 'SKIP';
    return `<div class="movement-item${processed ? ' is-processed' : ''}${isDone ? ' is-done' : ''}${isSkip ? ' is-skip' : ''}" data-movement-row="${id}" title="${esc(title)}">
      <input class="movement-done" type="checkbox" data-movement-id="${id}" data-bucket="${bucket}" aria-label="Done" ${isDone ? 'checked' : ''} ${isSkip ? 'disabled' : ''}>
      <span class="movement-item-body">
        <span class="movement-item-title">${esc(title)}</span>
        <span class="movement-item-meta"><span class="movement-item-type">[${esc(item._type)}]</span><span>${esc(item._date.slice(5).replace('-', '.'))}${statusText ? ` · ${statusText}` : ''}${time ? ` ${esc(time)}` : ''}</span></span>
      </span>
      <button class="movement-skip" type="button" data-skip-id="${id}" data-bucket="${bucket}" ${isDone ? 'disabled' : ''}>${skipLabel}</button>
    </div>`;
  }

  function recentProcessed(bucket) {
    return poolItems(bucket)
      .filter((item) => history[itemId(item)])
      .sort((a, b) => String(history[itemId(b)]?.at || '').localeCompare(String(history[itemId(a)]?.at || '')))
      .slice(0, DISPLAY_LIMIT);
  }

  function renderBucket(bucket) {
    const target = targets[bucket];
    target.list.classList.remove('movement-loading');
    syncQueue(bucket);
    const open = openItems(bucket);
    target.count.textContent = String(open.length);

    const visible = queues[bucket]
      .slice(0, DISPLAY_LIMIT)
      .map((id) => itemById(bucket, id))
      .filter(Boolean);

    if (visible.length) {
      target.list.innerHTML = visible.map((item) => rowHtml(bucket, item)).join('');
      return;
    }

    const processed = recentProcessed(bucket);
    target.list.innerHTML = processed.length
      ? processed.map((item) => rowHtml(bucket, item, true)).join('')
      : emptyRow();
  }

  function renderAll({ randomize = false } = {}) {
    ['do', 'check', 'keep'].forEach((bucket) => {
      if (randomize || !queues[bucket].length) rebuildQueue(bucket);
      renderBucket(bucket);
    });
  }

  function setStatus(bucket, id, status) {
    if (status === 'done' || status === 'skip') {
      history[id] = { status, at: new Date().toISOString() };
      queues[bucket] = queues[bucket].filter((queuedId) => queuedId !== id);
    } else {
      delete history[id];
      if (!queues[bucket].includes(id)) queues[bucket].push(id);
    }
    writeHistory();
    renderBucket(bucket);
  }

  async function loadCuratedWeek() {
    const path = `indexes/movement/${weekStartKey}_${todayKey}.json`;
    try {
      const payload = await gh(path, 'my-storage-note');
      if (!payload?.content) return null;
      const data = JSON.parse(decode(payload.content));
      if (!Array.isArray(data?.items)) return null;
      return data.items.map((item) => ({
        ...item,
        _type: item.type || 'idea',
        _date: item.date || todayKey
      }));
    } catch (_) {
      return null;
    }
  }

  async function loadLegacySevenDays() {
    const directories = await Promise.all(TYPES.map(async (type) => {
      try {
        const entries = await gh(`extracted/${type}`, 'my-storage-note');
        return { type, entries: Array.isArray(entries) ? entries : [] };
      } catch (error) {
        console.error(error);
        return { type, entries: [] };
      }
    }));

    const files = [];
    directories.forEach(({ type, entries }) => {
      entries.forEach((entry) => {
        if (entry?.type !== 'file' || !dateName.test(entry.name)) return;
        const date = entry.name.slice(0, 10);
        if (date < weekStartKey || date > todayKey) return;
        files.push({ type, date, path: `extracted/${type}/${entry.name}` });
      });
    });

    const payloads = await Promise.all(files.map(async (file) => {
      try {
        const payload = await gh(file.path, 'my-storage-note');
        if (!payload?.content) return [];
        const data = JSON.parse(decode(payload.content));
        return (Array.isArray(data?.items) ? data.items : []).map((item) => ({ ...item, _type: file.type, _date: file.date }));
      } catch (error) {
        console.error(error);
        return [];
      }
    }));

    return payloads.flat();
  }

  async function loadSevenDays() {
    const curated = await loadCuratedWeek();
    if (curated?.length) return { items: curated, curated: true };
    return { items: await loadLegacySevenDays(), curated: false };
  }

  async function boot() {
    if (!token()) {
      source.textContent = '7 DAYS · ANALYSIS OFF';
      Object.values(targets).forEach((target) => {
        target.list.classList.remove('movement-loading');
        target.count.textContent = '—';
        target.list.innerHTML = emptyRow('token required');
      });
      return;
    }

    source.textContent = '7 DAYS · LOADING';
    const result = await loadSevenDays();
    pools.do.length = pools.check.length = pools.keep.length = 0;
    result.items.forEach((item) => pools[classify(item._type, item)].push(item));
    renderAll({ randomize: true });
    const range = `${weekStartKey.slice(5).replace('-', '.')}–${todayKey.slice(5).replace('-', '.')}`;
    source.textContent = result.curated ? `${range} · CURATED` : range;
  }

  randomButton?.addEventListener('click', () => renderAll({ randomize: true }));

  root.addEventListener('change', (event) => {
    const input = event.target.closest?.('.movement-done[data-movement-id]');
    if (!input) return;
    setStatus(input.dataset.bucket, input.dataset.movementId, input.checked ? 'done' : null);
  });

  root.addEventListener('click', (event) => {
    const button = event.target.closest?.('.movement-skip[data-skip-id]');
    if (!button) return;
    event.preventDefault();
    const id = button.dataset.skipId;
    const bucket = button.dataset.bucket;
    setStatus(bucket, id, history[id]?.status === 'skip' ? null : 'skip');
  });

  boot().catch((error) => {
    console.error(error);
    source.textContent = '7 DAYS · ERROR';
  });
})();