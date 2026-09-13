(() => {
  'use strict';

  const TYPES = ['action', 'question', 'idea', 'theme', 'hypothesis'];
  const MODES = new Set(['do', 'check', 'keep']);
  const WEEKLY_SKIP_TYPES = new Set(['idea', 'theme', 'hypothesis']);
  const HISTORY_KEY = 'cockpid.today-movement.checked.v1';
  const AUDIT_NAME = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})-work-home-task-audit\.json$/;
  const DISPLAY_LIMIT = 2;
  const buckets = ['do', 'check', 'keep'];
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
  let skipFeedbackTimer = null;

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

  function jstMidnightIso(parts) {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, -9, 0, 0)).toISOString();
  }

  function skipPlan(bucket, item, from = new Date()) {
    const parts = jstDateParts(from);
    const weekly = bucket === 'keep' || WEEKLY_SKIP_TYPES.has(item?._type);
    if (weekly) {
      const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
      const daysUntilSunday = weekday === 0 ? 7 : 7 - weekday;
      return { until: jstMidnightIso(shiftDays(parts, daysUntilSunday)), feedback: '日曜 00:00 に再表示' };
    }
    return { until: jstMidnightIso(shiftDays(parts, 1)), feedback: '明日 00:00 に再表示' };
  }

  const todayKey = dateKey(jstDateParts());
  const weekStartKey = dateKey(shiftDays(jstDateParts(), -6));

  function normalizeHistory(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.entries(raw).forEach(([id, value]) => {
      if (value?.status === 'done' || value?.status === 'skip') {
        out[id] = {
          status: value.status,
          at: value.at || value.checked_at || '',
          title_key: value.title_key,
          recurring: Boolean(value.recurring),
          ...(value.status === 'skip' && value.skip_until ? { skip_until: value.skip_until } : {})
        };
      } else if (value?.checked_at) out[id] = { status: 'done', at: value.checked_at, title_key: value.title_key, recurring: Boolean(value.recurring) };
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

  function isExpiredSkip(state, now = Date.now()) {
    if (state?.status !== 'skip' || !state.skip_until) return false;
    const until = Date.parse(state.skip_until);
    return Number.isFinite(until) && now >= until;
  }

  function expireHistorySkips() {
    let changed = false;
    Object.entries(history).forEach(([id, state]) => {
      if (!isExpiredSkip(state)) return;
      delete history[id];
      changed = true;
    });
    if (changed) writeHistory();
    return changed;
  }

  function hashId(seed) {
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

  function legacyItemId(item) {
    return hashId(`${item._date}|${item._type}|${item.title || item.summary || ''}`);
  }

  function itemId(item) {
    return item?._isRecurring ? legacyItemId(item) : hashId(`v2|${item._type}|${titleKey(item)}`);
  }

  function migrateHistoryForItems(items) {
    let changed = false;
    items.forEach((item) => {
      const nextId = itemId(item);
      const oldId = legacyItemId(item);
      if (nextId === oldId || history[nextId] || !history[oldId]) return;
      history[nextId] = { ...history[oldId], title_key: titleKey(item), recurring: Boolean(item._isRecurring) };
      delete history[oldId];
      changed = true;
    });
    if (changed) writeHistory();
  }

  function classify(type, item) {
    if (MODES.has(item?.mode)) return item.mode;
    const text = `${item?.title || ''} ${item?.summary || ''}`;
    if (type === 'question') return 'check';
    if (type === 'idea' || type === 'theme') return 'keep';
    if (type === 'hypothesis') return /(考え|検討|整理|構想|方針|設計|判断|振り返)/.test(text) ? 'keep' : 'check';
    if (/(確認|状況|対象|進捗|チェック|把握|照合|レビュー|聞く|調べる|見直す)/.test(text)) return 'check';
    if (/(考え|検討|整理|構想|方針|目的|設計|見極め|判断|振り返)/.test(text)) return 'keep';
    return 'do';
  }

  function mergeByPriority(...groups) {
    const seen = new Set();
    const merged = [];
    groups.flat().forEach((item) => {
      const key = titleKey(item);
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    });
    return merged;
  }

  const unique = (items) => mergeByPriority(items);

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  const poolItems = (bucket) => unique(pools[bucket]);
  const openItems = (bucket) => poolItems(bucket).filter((item) => !history[itemId(item)] || isExpiredSkip(history[itemId(item)]));
  const itemById = (bucket, id) => poolItems(bucket).find((item) => itemId(item) === id) || null;
  const bucketForId = (id) => buckets.find((bucket) => Boolean(itemById(bucket, id))) || null;

  function ensureSkipDeadlines() {
    let changed = false;
    buckets.forEach((bucket) => pools[bucket].forEach((item) => {
      const id = itemId(item);
      const state = history[id];
      if (state?.status !== 'skip' || (state.skip_until && Number.isFinite(Date.parse(state.skip_until)))) return;
      const from = state.at && Number.isFinite(Date.parse(state.at)) ? new Date(state.at) : new Date();
      state.skip_until = skipPlan(bucket, item, from).until;
      changed = true;
    }));
    if (changed) writeHistory();
    expireHistorySkips();
  }

  function showSkipFeedback(message) {
    if (!source) return;
    const previous = source.textContent;
    source.textContent = message;
    clearTimeout(skipFeedbackTimer);
    skipFeedbackTimer = setTimeout(() => {
      if (source.textContent === message) source.textContent = previous;
    }, 2400);
  }

  function splitOpenBySource(bucket) {
    const primary = [];
    const audit = [];
    openItems(bucket).forEach((item) => (item._source === 'audit' ? audit : primary).push(item));
    return { primary, audit };
  }

  function rebuildQueue(bucket) {
    const { primary, audit } = splitOpenBySource(bucket);
    queues[bucket] = [...shuffle(primary), ...shuffle(audit)].map(itemId);
  }

  function syncQueue(bucket) {
    const { primary, audit } = splitOpenBySource(bucket);
    const openIds = new Set([...primary, ...audit].map(itemId));
    const primaryIds = new Set(primary.map(itemId));
    const auditIds = new Set(audit.map(itemId));
    const existingPrimary = queues[bucket].filter((id) => openIds.has(id) && primaryIds.has(id));
    const existingAudit = queues[bucket].filter((id) => openIds.has(id) && auditIds.has(id));
    const queued = new Set([...existingPrimary, ...existingAudit]);
    primary.forEach((item) => { const id = itemId(item); if (!queued.has(id)) { existingPrimary.push(id); queued.add(id); } });
    audit.forEach((item) => { const id = itemId(item); if (!queued.has(id)) { existingAudit.push(id); queued.add(id); } });
    queues[bucket] = [...existingPrimary, ...existingAudit];
  }

  function emptyRow(label = '候補なし') {
    return `<div class="movement-item movement-item-empty"><input type="checkbox" disabled><span class="movement-item-body"><span class="movement-item-title">${esc(label)}</span></span></div>`;
  }

  function clearRow() {
    return '<div class="movement-item movement-item-empty"><input type="checkbox" checked disabled><span class="movement-item-body"><span class="movement-item-title">CLEAR</span><span class="movement-item-meta"><span>すべて処理済み</span></span></span></div>';
  }

  function formatTime(value) {
    if (!value) return '';
    try { return new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return ''; }
  }

  function rowHtml(bucket, item, processed = false) {
    const id = itemId(item);
    const state = history[id] || null;
    const title = item.title || item.summary || 'Untitled';
    const status = isExpiredSkip(state) ? '' : (state?.status || '');
    const time = formatTime(state?.at);
    const isDone = status === 'done';
    const isSkip = status === 'skip';
    const statusText = isDone ? 'DONE' : isSkip ? 'SKIP' : '';
    return `<div class="movement-item${processed ? ' is-processed' : ''}${isDone ? ' is-done' : ''}${isSkip ? ' is-skip' : ''}" data-movement-row="${id}" title="${esc(title)}">
      <input class="movement-done" type="checkbox" data-movement-id="${id}" data-bucket="${bucket}" aria-label="Done" ${isDone ? 'checked' : ''} ${isSkip ? 'disabled' : ''}>
      <span class="movement-item-body"><span class="movement-item-title">${esc(title)}</span><span class="movement-item-meta"><span class="movement-item-type">[${esc(item._type)}]</span><span>${esc(String(item._date || '').slice(5).replace('-', '.'))}${statusText ? ` · ${statusText}` : ''}${time ? ` ${esc(time)}` : ''}</span></span></span>
      <button class="movement-skip" type="button" data-skip-id="${id}" data-bucket="${bucket}" ${isDone ? 'disabled' : ''}>${isSkip ? 'UNDO' : 'SKIP'}</button>
    </div>`;
  }

  function renderBucket(bucket) {
    const target = targets[bucket];
    target.list.classList.remove('movement-loading');
    expireHistorySkips();
    syncQueue(bucket);
    target.count.textContent = String(openItems(bucket).length);
    const visible = queues[bucket].slice(0, DISPLAY_LIMIT).map((id) => itemById(bucket, id)).filter(Boolean);
    if (visible.length) {
      target.list.innerHTML = visible.map((item) => rowHtml(bucket, item)).join('');
      return;
    }
    target.list.innerHTML = poolItems(bucket).length ? clearRow() : emptyRow();
  }

  function renderAll({ randomize = false } = {}) {
    buckets.forEach((bucket) => {
      if (randomize || !queues[bucket].length) rebuildQueue(bucket);
      renderBucket(bucket);
    });
  }

  function setStatus(bucket, id, status) {
    const item = itemById(bucket, id);
    if (status === 'done') {
      history[id] = { status, at: new Date().toISOString(), title_key: item ? titleKey(item) : undefined, recurring: Boolean(item?._isRecurring) };
      queues[bucket] = queues[bucket].filter((queuedId) => queuedId !== id);
    } else if (status === 'skip') {
      const plan = skipPlan(bucket, item);
      history[id] = { status, at: new Date().toISOString(), skip_until: plan.until, title_key: item ? titleKey(item) : undefined, recurring: Boolean(item?._isRecurring) };
      queues[bucket] = queues[bucket].filter((queuedId) => queuedId !== id);
      showSkipFeedback(plan.feedback);
    } else {
      delete history[id];
      if (!queues[bucket].includes(id)) queues[bucket].push(id);
    }
    writeHistory();
    renderBucket(bucket);
  }

  async function loadCuratedWeek() {
    try {
      const payload = await gh(`memory/indexes/movement/${weekStartKey}_${todayKey}.json`, 'my-storage-note');
      if (!payload?.content) return null;
      const data = JSON.parse(decode(payload.content));
      if (!Array.isArray(data?.items)) return null;
      return data.items.map((item) => ({ ...item, _type: item.type || 'idea', _date: item.date || todayKey, _source: 'week' }));
    } catch (error) {
      console.error('ON HAND curated load failed', error);
      return null;
    }
  }

  async function loadLegacySevenDays() {
    const directories = await Promise.all(TYPES.map(async (type) => {
      try {
        const entries = await gh(`memory/extracted/${type}`, 'my-storage-note');
        return { type, entries: Array.isArray(entries) ? entries : [] };
      } catch (error) {
        console.error(error);
        return { type, entries: [] };
      }
    }));
    const files = [];
    directories.forEach(({ type, entries }) => entries.forEach((entry) => {
      if (entry?.type !== 'file' || !dateName.test(entry.name)) return;
      const date = entry.name.slice(0, 10);
      if (date >= weekStartKey && date <= todayKey) files.push({ type, date, path: `memory/extracted/${type}/${entry.name}` });
    }));
    const payloads = await Promise.all(files.map(async (file) => {
      try {
        const payload = await gh(file.path, 'my-storage-note');
        if (!payload?.content) return [];
        const data = JSON.parse(decode(payload.content));
        return (Array.isArray(data?.items) ? data.items : []).map((item) => ({ ...item, _type: file.type, _date: file.date, _source: 'legacy' }));
      } catch (error) {
        console.error(error);
        return [];
      }
    }));
    return payloads.flat();
  }

  async function loadSevenDays() {
    const curated = await loadCuratedWeek();
    return curated?.length ? { items: curated, curated: true } : { items: await loadLegacySevenDays(), curated: false };
  }

  async function latestAuditPath() {
    try {
      const entries = await gh('memory/indexes/movement', 'my-storage-note');
      if (!Array.isArray(entries)) return null;
      const matches = entries.filter((entry) => entry?.type === 'file' && AUDIT_NAME.test(entry.name));
      matches.sort((a, b) => {
        const am = a.name.match(AUDIT_NAME);
        const bm = b.name.match(AUDIT_NAME);
        return (bm?.[2] || '').localeCompare(am?.[2] || '') || (bm?.[1] || '').localeCompare(am?.[1] || '');
      });
      return matches[0]?.path || null;
    } catch (error) {
      console.error('ON HAND audit index load failed', error);
      return null;
    }
  }

  async function loadAudit() {
    try {
      const path = await latestAuditPath();
      if (!path) return { items: [], recurringTitles: new Set(), loaded: false, path: null };
      const payload = await gh(path, 'my-storage-note');
      if (!payload?.content) return { items: [], recurringTitles: new Set(), loaded: false, path };
      const data = JSON.parse(decode(payload.content));
      if (!Array.isArray(data?.items)) return { items: [], recurringTitles: new Set(), loaded: false, path };
      const recurringTitles = new Set((Array.isArray(data?.recurring_work) ? data.recurring_work : []).map(titleKey).filter(Boolean));
      const items = data.items
        .filter((item) => String(item?.state_at_last_source || '').toLowerCase() !== 'completed')
        .filter((item) => MODES.has(item?.mode))
        .map((item) => ({ ...item, _type: item.type || 'action', _date: item.last_seen || item.first_seen || todayKey, _source: 'audit' }));
      return { items, recurringTitles, loaded: true, path };
    } catch (error) {
      console.error('ON HAND audit load failed', error);
      return { items: [], recurringTitles: new Set(), loaded: false, path: null };
    }
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

    source.textContent = 'ON HAND · LOADING';
    const [week, audit] = await Promise.all([loadSevenDays(), loadAudit()]);
    const items = mergeByPriority(week.items, audit.items).map((item) => ({
      ...item,
      _isRecurring: Boolean(item.recurring || item.cadence || audit.recurringTitles.has(titleKey(item)))
    }));
    migrateHistoryForItems(items);
    buckets.forEach((bucket) => { pools[bucket].length = 0; queues[bucket].length = 0; });
    items.forEach((item) => pools[classify(item._type, item)].push(item));
    ensureSkipDeadlines();
    renderAll({ randomize: true });
    const range = `${weekStartKey.slice(5).replace('-', '.')}–${todayKey.slice(5).replace('-', '.')}`;
    const auditLabel = audit.loaded ? ' + 3M' : '';
    source.textContent = `${range}${auditLabel}${week.curated ? ' · CURATED' : ''}`;
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

  window.addEventListener('storage', (event) => {
    if (event.key !== HISTORY_KEY) return;
    const previous = historyFromText(event.oldValue);
    history = historyFromText(event.newValue);
    ensureSkipDeadlines();
    const changed = new Set([...Object.keys(previous), ...Object.keys(history)].filter((id) => JSON.stringify(previous[id] || null) !== JSON.stringify(history[id] || null)));
    const affected = new Set([...changed].map(bucketForId).filter(Boolean));
    affected.forEach(renderBucket);
  });

  boot().catch((error) => {
    console.error(error);
    source.textContent = 'ON HAND · ERROR';
  });
})();
