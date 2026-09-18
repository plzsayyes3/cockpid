(() => {
  'use strict';

  const core = window.COCKPID_ONHAND_CORE;
  if (!core) {
    console.error('ON HAND core is missing');
    return;
  }

  const buckets = core.BUCKETS;
  const targets = {
    task: { count: document.getElementById('fullDoCount'), list: document.getElementById('fullDoItems') },
    check: { count: document.getElementById('fullCheckCount'), list: document.getElementById('fullCheckItems') },
    keep: { count: document.getElementById('fullKeepCount'), list: document.getElementById('fullKeepItems') }
  };
  const sourceRange = document.getElementById('sourceRange');
  const pools = { task: [], check: [], keep: [] };
  let filter = 'all';
  let history = core.readHistory();
  let feedbackTimer = null;

  const itemById = (bucket, id) => pools[bucket].find((item) => core.itemId(item) === id) || null;
  const bucketForId = (id) => buckets.find((bucket) => Boolean(itemById(bucket, id))) || null;
  const stateOf = (item) => core.stateFor(item, history);
  const statusOf = (item) => stateOf(item)?.status || 'open';

  function timeOf(value) {
    try { return value ? new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : ''; }
    catch (_) { return ''; }
  }

  function skipUntilText(value) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo', weekday: 'short', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
      });
    } catch (_) { return ''; }
  }

  function feedback(message, isError = false) {
    let node = document.getElementById('onhandSkipFeedback');
    if (!node) {
      node = document.createElement('div');
      node.id = 'onhandSkipFeedback';
      node.className = 'skip-feedback';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.toggle('error', isError);
    node.classList.add('is-visible');
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => node.classList.remove('is-visible'), 2600);
  }

  function matchFilter(item) {
    const status = statusOf(item);
    if (filter === 'all') return status !== 'skip';
    return status === filter;
  }

  function row(bucket, item) {
    const id = core.itemId(item);
    const state = stateOf(item);
    const status = state?.status || 'open';
    const title = item.title || item.summary || 'Untitled';
    const time = timeOf(state?.at);
    const skipUntil = status === 'skip' ? skipUntilText(state?.skip_until) : '';
    const canonical = Boolean(item._isCanonicalTask);
    const sourceLabel = canonical ? 'SHARED TASK' : item._type;
    const checked = status === 'done';
    const disabled = status === 'skip' || (canonical && checked);
    return `<div class="item${checked ? ' is-done' : ''}${status === 'skip' ? ' is-skip' : ''}" data-row-id="${core.esc(id)}"${canonical ? ` data-canonical-task="true" data-task-id="${core.esc(item._canonicalTaskId)}"` : ''}>
      <input type="checkbox" class="done-box" data-id="${core.esc(id)}" data-bucket="${bucket}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} aria-label="${canonical ? 'Taskを完了' : 'Handled'}">
      <div class="item-main"><span class="item-title">${core.esc(title)}</span><div class="item-meta"><span>[${core.esc(sourceLabel)}]</span><span>${core.esc(item._date || '')}</span>${status !== 'open' ? `<span class="status ${status}">${status === 'done' ? (canonical ? 'COMPLETED' : 'HANDLED') : 'SKIP'}${time ? ` ${core.esc(time)}` : ''}</span>` : ''}${skipUntil ? `<span class="skip-until">再表示 ${core.esc(skipUntil)}</span>` : ''}</div></div>
      <button class="skip-btn" data-id="${core.esc(id)}" data-bucket="${bucket}" ${checked ? 'disabled' : ''}>${status === 'skip' ? 'UNDO' : 'SKIP'}</button>
    </div>`;
  }

  function renderBucket(bucket) {
    const all = [...pools[bucket]].sort((a, b) => String(b._date || '').localeCompare(String(a._date || '')));
    const openCount = all.filter((item) => statusOf(item) === 'open').length;
    targets[bucket].count.textContent = `${openCount} OPEN · ${all.length} ALL`;
    const shown = all.filter(matchFilter);
    targets[bucket].list.innerHTML = shown.length ? shown.map((item) => row(bucket, item)).join('') : '<div class="empty">該当する項目はありません。</div>';
  }

  function renderAll() {
    core.ensureSkipDeadlines(buckets.flatMap((bucket) => pools[bucket]), history);
    buckets.forEach(renderBucket);
  }

  async function completeCanonical(bucket, item, input) {
    input.disabled = true;
    feedback('Shared Taskを完了中…');
    try {
      await core.completeCanonicalTask(item._canonicalTaskId);
      core.setLocalStatus(item, 'done', history);
      feedback('Shared Taskを完了しました');
      renderBucket(bucket);
    } catch (error) {
      console.error('Shared Task completion failed', error);
      input.checked = false;
      input.disabled = false;
      feedback(`完了保存に失敗: ${error.message}`, true);
    }
  }

  function restoreAfterScheduling(input) {
    input.checked = false;
    input.disabled = false;
    const rowNode = input.closest('.item[data-row-id]');
    rowNode?.querySelectorAll('.onhand-send-btn,.onhand-route-btn,.skip-btn').forEach((button) => { button.disabled = false; });
    const status = rowNode?.querySelector('.onhand-route-status');
    if (status) {
      status.textContent = '送信済み · Taskは未完了';
      status.classList.remove('error');
    }
  }

  async function boot() {
    if (!core.hasToken()) {
      sourceRange.textContent = 'ON HAND · TOKEN REQUIRED';
      Object.values(targets).forEach((target) => {
        target.count.textContent = '—';
        target.list.innerHTML = '<div class="empty">GitHub token が必要です。</div>';
      });
      return;
    }
    const loaded = await core.loadAllItems();
    history = core.readHistory();
    core.migrateHistoryForItems(loaded.items, history);
    core.ensureSkipDeadlines(loaded.items, history);
    buckets.forEach((bucket) => { pools[bucket].length = 0; });
    loaded.items.forEach((item) => pools[core.classify(item._type, item)].push(item));
    sourceRange.textContent = `${loaded.start} – ${loaded.end} · ${loaded.tasksLoadFailed ? 'TASK READ ERROR' : `${loaded.tasksLoaded} TASKS`}${loaded.auditLoaded ? ' + 3 MONTH AUDIT' : ''}${loaded.curated ? ' · CURATED' : ''}`;
    renderAll();
  }

  document.querySelector('.filters')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((node) => node.classList.toggle('is-active', node === button));
    renderAll();
  });

  document.querySelector('.onhand-grid')?.addEventListener('change', (event) => {
    const input = event.target.closest('.done-box[data-id]');
    if (!input) return;
    const bucket = input.dataset.bucket;
    const item = itemById(bucket, input.dataset.id);
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
    renderBucket(bucket);
  });

  document.querySelector('.onhand-grid')?.addEventListener('click', (event) => {
    const button = event.target.closest('.skip-btn[data-id]');
    if (!button) return;
    const bucket = button.dataset.bucket;
    const item = itemById(bucket, button.dataset.id);
    if (!item) return;
    const next = statusOf(item) === 'skip' ? null : 'skip';
    const message = core.setLocalStatus(item, next, history);
    if (message) feedback(message);
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
    sourceRange.textContent = 'ON HAND · ERROR';
  });
})();
