(() => {
  'use strict';

  const core = window.COCKPID_ONHAND_CORE;
  if (!core) {
    console.error('ON HAND core is missing');
    return;
  }

  const DISPLAY_LIMIT = 2;
  const buckets = core.BUCKETS;
  const targets = {
    task: { count: document.getElementById('moveDoCount'), list: document.getElementById('moveDoItems') },
    check: { count: document.getElementById('moveCheckCount'), list: document.getElementById('moveCheckItems') },
    keep: { count: document.getElementById('moveThinkCount'), list: document.getElementById('moveThinkItems') }
  };
  const source = document.getElementById('movementDate');
  const randomButton = document.getElementById('movementRandom');
  const root = document.querySelector('.movement-object');
  if (!targets.task.list || !targets.check.list || !targets.keep.list || !root) return;

  const pools = { task: [], check: [], keep: [] };
  const queues = { task: [], check: [], keep: [] };
  let history = core.readHistory();
  let feedbackTimer = null;
  let feedbackBase = '';

  const stateOf = (item) => core.stateFor(item, history);
  const statusOf = (item) => stateOf(item)?.status || 'open';
  const poolItems = (bucket) => [...pools[bucket]];
  const openItems = (bucket) => poolItems(bucket).filter((item) => statusOf(item) === 'open');
  const itemById = (bucket, id) => poolItems(bucket).find((item) => core.itemId(item) === id) || null;
  const bucketForId = (id) => buckets.find((bucket) => Boolean(itemById(bucket, id))) || null;

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function splitOpenBySource(bucket) {
    const canonical = [];
    const primary = [];
    const audit = [];
    openItems(bucket).forEach((item) => {
      if (item._isCanonicalTask) canonical.push(item);
      else if (item._source === 'audit') audit.push(item);
      else primary.push(item);
    });
    return { canonical, primary, audit };
  }

  function interleave(canonicalIds, candidateIds) {
    const mixed = [];
    const max = Math.max(canonicalIds.length, candidateIds.length);
    for (let i = 0; i < max; i += 1) {
      if (candidateIds[i]) mixed.push(candidateIds[i]);
      if (canonicalIds[i]) mixed.push(canonicalIds[i]);
    }
    return mixed;
  }

  function stableIds(items, existingIds = [], randomize = false) {
    const ids = items.map(core.itemId);
    if (randomize) return shuffle(ids);
    const allowed = new Set(ids);
    const kept = existingIds.filter((id) => allowed.has(id));
    const seen = new Set(kept);
    ids.forEach((id) => {
      if (!seen.has(id)) {
        kept.push(id);
        seen.add(id);
      }
    });
    return kept;
  }

  function rebuildQueue(bucket) {
    const { canonical, primary, audit } = splitOpenBySource(bucket);
    const canonicalIds = stableIds(canonical, [], true);
    const candidateIds = [
      ...stableIds(primary, [], true),
      ...stableIds(audit, [], true)
    ];
    queues[bucket] = interleave(canonicalIds, candidateIds);
  }

  function syncQueue(bucket) {
    const { canonical, primary, audit } = splitOpenBySource(bucket);
    const existing = queues[bucket];
    const canonicalIds = stableIds(canonical, existing);
    const primaryIds = stableIds(primary, existing);
    const auditIds = stableIds(audit, existing);
    queues[bucket] = interleave(canonicalIds, [...primaryIds, ...auditIds]);
  }

  function emptyRow(label = '候補なし') {
    return `<div class="movement-item movement-item-empty"><input type="checkbox" disabled><span class="movement-item-body"><span class="movement-item-title">${core.esc(label)}</span></span></div>`;
  }

  function clearRow() {
    return '<div class="movement-item movement-item-empty"><input type="checkbox" checked disabled><span class="movement-item-body"><span class="movement-item-title">CLEAR</span><span class="movement-item-meta"><span>すべて処理済み</span></span></span></div>';
  }

  function formatTime(value) {
    if (!value) return '';
    try { return new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return ''; }
  }

  function rowHtml(bucket, item) {
    const id = core.itemId(item);
    const state = stateOf(item);
    const title = item.title || item.summary || 'Untitled';
    const status = state?.status || '';
    const time = formatTime(state?.at);
    const canonical = Boolean(item._isCanonicalTask);
    const sourceLabel = canonical ? 'TASK' : item._type;
    return `<div class="movement-item${status === 'done' ? ' is-done' : ''}${status === 'skip' ? ' is-skip' : ''}" data-movement-row="${core.esc(id)}"${canonical ? ` data-canonical-task="true" data-task-id="${core.esc(item._canonicalTaskId)}"` : ''} title="${core.esc(title)}">
      <input class="movement-done" type="checkbox" data-movement-id="${core.esc(id)}" data-bucket="${bucket}" aria-label="${canonical ? 'Taskを完了' : 'Handled'}" ${status === 'done' ? 'checked' : ''} ${status === 'skip' || (canonical && status === 'done') ? 'disabled' : ''}>
      <span class="movement-item-body"><span class="movement-item-title">${core.esc(title)}</span><span class="movement-item-meta"><span class="movement-item-type">[${core.esc(sourceLabel)}]</span><span>${core.esc(String(item._date || '').slice(5).replace('-', '.'))}${status ? ` · ${status === 'done' ? (canonical ? 'COMPLETED' : 'HANDLED') : 'SKIP'}` : ''}${time ? ` ${core.esc(time)}` : ''}</span></span></span>
      <button class="movement-skip" type="button" data-skip-id="${core.esc(id)}" data-bucket="${bucket}" ${status === 'done' ? 'disabled' : ''}>${status === 'skip' ? 'UNDO' : 'SKIP'}</button>
    </div>`;
  }

  function renderBucket(bucket) {
    const target = targets[bucket];
    target.list.classList.remove('movement-loading');
    core.ensureSkipDeadlines(buckets.flatMap((name) => pools[name]), history);
    syncQueue(bucket);
    target.count.textContent = String(openItems(bucket).length);
    const visible = queues[bucket].slice(0, DISPLAY_LIMIT).map((id) => itemById(bucket, id)).filter(Boolean);
    if (visible.length) {
      target.list.innerHTML = visible.map((item) => rowHtml(bucket, item)).join('');
      return;
    }
    const all = poolItems(bucket);
    if (!all.length) {
      target.list.innerHTML = emptyRow();
      return;
    }
    const hasSkipped = all.some((item) => statusOf(item) === 'skip');
    target.list.innerHTML = hasSkipped ? emptyRow('SKIP中 · 再表示待ち') : clearRow();
  }

  function renderAll({ randomize = false } = {}) {
    buckets.forEach((bucket) => {
      if (randomize || !queues[bucket].length) rebuildQueue(bucket);
      renderBucket(bucket);
    });
  }

  function showFeedback(message) {
    if (!source) return;
    if (!feedbackTimer) feedbackBase = source.textContent;
    source.textContent = message;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      if (source.textContent === message) source.textContent = feedbackBase;
      feedbackTimer = null;
      feedbackBase = '';
    }, 2600);
  }

  async function completeCanonical(bucket, item, input) {
    input.disabled = true;
    showFeedback('Shared Taskを完了中…');
    try {
      await core.completeCanonicalTask(item._canonicalTaskId);
      core.setLocalStatus(item, 'done', history);
      queues[bucket] = queues[bucket].filter((id) => id !== core.itemId(item));
      showFeedback('Shared Taskを完了しました');
      renderBucket(bucket);
    } catch (error) {
      console.error('Shared Task completion failed', error);
      input.checked = false;
      input.disabled = false;
      showFeedback(`完了保存に失敗: ${error.message}`);
    }
  }

  function restoreAfterScheduling(input) {
    input.checked = false;
    input.disabled = false;
    const rowNode = input.closest('.movement-item[data-movement-row]');
    rowNode?.querySelectorAll('.onhand-send-btn,.onhand-route-btn,.movement-skip').forEach((button) => { button.disabled = false; });
    const status = rowNode?.querySelector('.onhand-route-status');
    if (status) {
      status.textContent = '送信済み · Taskは未完了';
      status.classList.remove('error');
    }
  }

  async function boot() {
    if (!core.hasToken()) {
      source.textContent = '7 DAYS · ANALYSIS OFF';
      Object.values(targets).forEach((target) => {
        target.list.classList.remove('movement-loading');
        target.count.textContent = '—';
        target.list.innerHTML = emptyRow('token required');
      });
      return;
    }

    source.textContent = 'ON HAND · LOADING';
    const loaded = await core.loadAllItems();
    history = core.readHistory();
    core.migrateHistoryForItems(loaded.items, history);
    core.ensureSkipDeadlines(loaded.items, history);
    buckets.forEach((bucket) => { pools[bucket].length = 0; queues[bucket].length = 0; });
    loaded.items.forEach((item) => pools[core.classify(item._type, item)].push(item));
    renderAll({ randomize: true });
    const range = `${loaded.start.slice(5).replace('-', '.')}–${loaded.end.slice(5).replace('-', '.')}`;
    source.textContent = `${range} · ${loaded.tasksLoaded} TASKS${loaded.auditLoaded ? ' + 3M' : ''}${loaded.curated ? ' · CURATED' : ''}`;
  }

  randomButton?.addEventListener('click', () => renderAll({ randomize: true }));

  root.addEventListener('change', (event) => {
    const input = event.target.closest?.('.movement-done[data-movement-id]');
    if (!input) return;
    const bucket = input.dataset.bucket;
    const item = itemById(bucket, input.dataset.movementId);
    if (!item) return;
    if (item._isCanonicalTask) {
      if (!event.isTrusted) {
        restoreAfterScheduling(input);
        return;
      }
      if (input.checked) completeCanonical(bucket, item, input);
      return;
    }
    core.setLocalStatus(item, input.checked ? 'done' : null, history);
    queues[bucket] = queues[bucket].filter((id) => id !== core.itemId(item));
    renderBucket(bucket);
  });

  root.addEventListener('click', (event) => {
    const button = event.target.closest?.('.movement-skip[data-skip-id]');
    if (!button) return;
    event.preventDefault();
    const bucket = button.dataset.bucket;
    const item = itemById(bucket, button.dataset.skipId);
    if (!item) return;
    const next = statusOf(item) === 'skip' ? null : 'skip';
    const message = core.setLocalStatus(item, next, history);
    queues[bucket] = queues[bucket].filter((id) => id !== core.itemId(item));
    if (message) showFeedback(message);
    renderBucket(bucket);
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== core.HISTORY_KEY) return;
    const previous = core.historyFromText(event.oldValue);
    history = core.historyFromText(event.newValue);
    core.ensureSkipDeadlines(buckets.flatMap((bucket) => pools[bucket]), history);
    const changed = new Set([...Object.keys(previous), ...Object.keys(history)].filter((id) => JSON.stringify(previous[id] || null) !== JSON.stringify(history[id] || null)));
    const affected = new Set([...changed].map(bucketForId).filter(Boolean));
    affected.forEach(renderBucket);
  });

  window.addEventListener('cockpid:onhand-state', () => {
    history = core.readHistory();
    renderAll();
  });

  boot().catch((error) => {
    console.error(error);
    source.textContent = 'ON HAND · ERROR';
  });
})();
