(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const REPO = 'my-storage-note';
  const BRANCH = 'main';
  const TOKEN_KEY = 'zen-note-github-token';
  const HISTORY_KEY = 'cockpid.today-movement.checked.v1';
  const CACHE_KEY = 'cockpid.onhand.shared-state.v1';
  const RESET_MARKER_KEY = 'cockpid.onhand.shared-state.reset.v2';
  const RESET_MARKER_VALUE = '2026-09-13T05:32:00.000Z';
  const RESET_CUTOFF_MS = Date.parse(RESET_MARKER_VALUE);
  const REMOTE_PATH = 'memory/state/on-hand.json';
  const LOCAL_POLL_MS = 1000;
  const REMOTE_REFRESH_MS = 60000;
  const PUSH_DEBOUNCE_MS = 800;

  function resetLegacyLocalStateOnce() {
    if (localStorage.getItem(RESET_MARKER_KEY) === RESET_MARKER_VALUE) return false;
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(CACHE_KEY);
    localStorage.setItem(RESET_MARKER_KEY, RESET_MARKER_VALUE);
    return true;
  }

  const resetApplied = resetLegacyLocalStateOnce();
  let applyingSharedState = false;
  let baselineHistory = readHistory();
  let pushTimer = null;
  let syncPromise = null;
  let pushAgain = false;
  let hasPendingChanges = false;
  let statusNode = null;

  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const nowIso = () => new Date().toISOString();

  function safeJson(text, fallback = {}) {
    try { return JSON.parse(text || ''); }
    catch (_) { return fallback; }
  }

  function readJsonStorage(key, fallback = {}) {
    return safeJson(localStorage.getItem(key), fallback);
  }

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
          ...(value.status === 'skip' && value.skip_until ? { skip_until:value.skip_until } : {})
        };
      } else if (value?.checked_at) {
        out[id] = {
          status: 'done',
          at: value.checked_at,
          title_key: value.title_key,
          recurring: Boolean(value.recurring)
        };
      }
    });
    return out;
  }

  function readHistory() {
    return normalizeHistory(readJsonStorage(HISTORY_KEY, {}));
  }

  function normalizeSharedItems(raw) {
    const source = raw?.items && typeof raw.items === 'object' ? raw.items : raw;
    const out = {};
    if (!source || typeof source !== 'object') return out;
    Object.entries(source).forEach(([id, value]) => {
      let status = value?.status;
      if (status === 'done') status = 'handled';
      if (status === 'skip') status = 'skipped';
      if (!['open', 'handled', 'skipped'].includes(status)) return;
      let at = value?.at || '';
      const parsedAt = Date.parse(at);
      if (Number.isFinite(parsedAt) && parsedAt < RESET_CUTOFF_MS) return;

      let skipUntil = value?.skip_until || '';
      const parsedSkipUntil = Date.parse(skipUntil);
      if (status === 'skipped' && Number.isFinite(parsedSkipUntil) && Date.now() >= parsedSkipUntil) {
        status = 'open';
        at = new Date(parsedSkipUntil).toISOString();
        skipUntil = '';
      }

      out[id] = {
        status,
        at,
        title_key: value?.title_key,
        recurring: Boolean(value?.recurring),
        ...(status === 'skipped' && skipUntil ? { skip_until:skipUntil } : {})
      };
    });
    return out;
  }

  function hasExpiredSharedSkip(raw, now = Date.now()) {
    const source = raw?.items && typeof raw.items === 'object' ? raw.items : raw;
    if (!source || typeof source !== 'object') return false;
    return Object.values(source).some((value) => {
      let status = value?.status;
      if (status === 'skip') status = 'skipped';
      if (status !== 'skipped' || !value?.skip_until) return false;
      const until = Date.parse(value.skip_until);
      return Number.isFinite(until) && now >= until;
    });
  }

  function readCacheItems() {
    return normalizeSharedItems(readJsonStorage(CACHE_KEY, {}));
  }

  function itemTime(value) {
    const parsed = Date.parse(value?.at || '');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function mergeItems(...groups) {
    const out = {};
    groups.forEach((group) => {
      Object.entries(normalizeSharedItems(group)).forEach(([id, value]) => {
        if (!out[id]) {
          out[id] = value;
          return;
        }
        const nextTime = itemTime(value);
        const currentTime = itemTime(out[id]);
        if (nextTime > currentTime || (nextTime === currentTime && (value.skip_until || !out[id].skip_until))) out[id] = value;
      });
    });
    return out;
  }

  function historyToShared(history) {
    const out = {};
    Object.entries(normalizeHistory(history)).forEach(([id, value]) => {
      out[id] = {
        status: value.status === 'skip' ? 'skipped' : 'handled',
        at: value.at || nowIso(),
        title_key: value.title_key,
        recurring: Boolean(value.recurring),
        ...(value.status === 'skip' && value.skip_until ? { skip_until:value.skip_until } : {})
      };
    });
    return out;
  }

  function sharedToHistory(items) {
    const out = {};
    Object.entries(normalizeSharedItems(items)).forEach(([id, value]) => {
      if (value.status === 'open') return;
      out[id] = {
        status: value.status === 'skipped' ? 'skip' : 'done',
        at: value.at,
        title_key: value.title_key,
        recurring: Boolean(value.recurring),
        ...(value.status === 'skipped' && value.skip_until ? { skip_until:value.skip_until } : {})
      };
    });
    return out;
  }

  const sameObject = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

  function installStatusUi() {
    if (document.getElementById('onhandSaveState')) {
      statusNode = document.getElementById('onhandSaveState');
      return;
    }
    const style = document.createElement('style');
    style.id = 'onhand-shared-state-style';
    style.textContent = `
      .onhand-save-state{display:inline-flex;align-items:center;white-space:nowrap;padding:5px 9px;border:1px solid #d9ddd7;background:rgba(255,255,255,.9);color:#6b7069;border-radius:999px;font:700 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em;backdrop-filter:blur(8px)}
      .onhand-save-state.dirty{color:#9a682f}.onhand-save-state.syncing{color:#2f5d50}.onhand-save-state.error{color:#b24b45}.onhand-save-state.local{color:#7a7d77}
      .movement-tools .onhand-save-state{margin-right:2px}.filters .onhand-save-state{margin-right:2px}
      @media(max-width:640px){.onhand-save-state{padding:4px 7px;font-size:9px}}
    `;
    document.head.appendChild(style);
    statusNode = document.createElement('span');
    statusNode.id = 'onhandSaveState';
    statusNode.className = 'onhand-save-state';
    statusNode.setAttribute('role', 'status');
    statusNode.setAttribute('aria-live', 'polite');
    const target = document.querySelector('.movement-tools') || document.querySelector('.filters');
    if (target) target.prepend(statusNode);
  }

  function setSaveState(kind, detail = '') {
    installStatusUi();
    document.documentElement.dataset.onhandSync = kind;
    if (!statusNode) return;
    const labels = {
      saved: '保存済み',
      dirty: '未保存',
      syncing: '同期中',
      error: '保存失敗',
      local: 'ローカルのみ'
    };
    statusNode.textContent = labels[kind] || labels.local;
    statusNode.className = `onhand-save-state${kind === 'saved' ? '' : ` ${kind}`}`;
    statusNode.title = detail || (kind === 'saved' ? 'ON HANDのチェック状態は共有先へ保存されています。' : '');
  }

  function markDirty() {
    hasPendingChanges = true;
    setSaveState(token() ? 'dirty' : 'local', token() ? '共有先への保存待ちです。' : 'GitHub tokenがないため共有保存されていません。');
  }

  function markSaved() {
    hasPendingChanges = false;
    setSaveState('saved');
  }

  function writeCache(items) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      schema_version: 1,
      reset_at: RESET_MARKER_VALUE,
      updated_at: nowIso(),
      items: normalizeSharedItems(items)
    }));
  }

  function dispatchHistoryChange(oldValue, newValue) {
    try {
      window.dispatchEvent(new StorageEvent('storage', {
        key: HISTORY_KEY,
        oldValue,
        newValue,
        storageArea: localStorage,
        url: location.href
      }));
    } catch (_) {
      window.dispatchEvent(new Event('cockpid:onhand-state'));
    }
  }

  function applySharedItems(items) {
    const normalized = normalizeSharedItems(items);
    const nextHistory = sharedToHistory(normalized);
    const currentHistory = readHistory();
    writeCache(normalized);

    if (!sameObject(currentHistory, nextHistory)) {
      const oldValue = localStorage.getItem(HISTORY_KEY);
      const newValue = JSON.stringify(nextHistory);
      applyingSharedState = true;
      localStorage.setItem(HISTORY_KEY, newValue);
      baselineHistory = nextHistory;
      dispatchHistoryChange(oldValue, newValue);
      applyingSharedState = false;
    } else {
      baselineHistory = currentHistory;
    }
  }

  function encodeUtf8Base64(value) {
    const bytes = new TextEncoder().encode(String(value ?? ''));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function decodeUtf8Base64(value) {
    const binary = atob(String(value || '').replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  }

  async function fetchRemote() {
    if (!token()) return null;
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${REMOTE_PATH}?ref=${BRANCH}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token()}`
      },
      cache: 'no-store'
    });
    if (response.status === 404) return { sha: null, items: {}, hasExpiredSkip: false };
    if (!response.ok) throw new Error(`ON HAND state read ${response.status}`);
    const payload = await response.json();
    const data = safeJson(decodeUtf8Base64(payload.content), {});
    return {
      sha: payload.sha || null,
      items: normalizeSharedItems(data),
      hasExpiredSkip: hasExpiredSharedSkip(data)
    };
  }

  async function putRemote(items, sha = null) {
    const payload = {
      schema_version: 1,
      reset_at: RESET_MARKER_VALUE,
      updated_at: nowIso(),
      items: normalizeSharedItems(items)
    };
    const body = {
      message: 'cockpid: sync ON HAND state',
      content: encodeUtf8Base64(`${JSON.stringify(payload, null, 2)}\n`),
      branch: BRANCH
    };
    if (sha) body.sha = sha;

    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${REMOTE_PATH}`, {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (response.status === 409 || response.status === 422) {
      const error = new Error(`ON HAND state conflict ${response.status}`);
      error.conflict = true;
      throw error;
    }
    if (!response.ok) throw new Error(`ON HAND state write ${response.status}`);
    return response.json();
  }

  function schedulePush() {
    if (!token()) {
      setSaveState('local', 'GitHub tokenがないため共有保存されていません。');
      return;
    }
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushSharedState().catch((error) => {
      console.warn('ON HAND shared-state push failed', error);
      hasPendingChanges = true;
      setSaveState('error', error.message);
    }), PUSH_DEBOUNCE_MS);
  }

  async function pushSharedState() {
    if (!token()) {
      setSaveState('local', 'GitHub tokenがないため共有保存されていません。');
      return;
    }
    if (syncPromise) {
      pushAgain = true;
      return syncPromise;
    }

    syncPromise = (async () => {
      setSaveState('syncing');
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const remote = await fetchRemote();
        if (!remote) return;
        const cacheItems = readCacheItems();
        const merged = mergeItems(remote.items, cacheItems);
        applySharedItems(merged);
        if (sameObject(remote.items, merged) && !remote.hasExpiredSkip) {
          markSaved();
          return;
        }
        try {
          await putRemote(merged, remote.sha);
          markSaved();
          return;
        } catch (error) {
          if (!error.conflict || attempt === 2) throw error;
        }
      }
    })().finally(() => {
      syncPromise = null;
      if (pushAgain) {
        pushAgain = false;
        schedulePush();
      }
    });
    return syncPromise;
  }

  async function pullSharedState() {
    if (!token()) {
      setSaveState('local', 'GitHub tokenがないため共有保存されていません。');
      return;
    }
    try {
      if (!hasPendingChanges) setSaveState('syncing');
      const remote = await fetchRemote();
      if (!remote) return;
      const cacheItems = readCacheItems();
      const localItems = historyToShared(readHistory());
      const merged = mergeItems(cacheItems, localItems, remote.items);
      applySharedItems(merged);
      if (!sameObject(remote.items, merged) || remote.hasExpiredSkip) {
        hasPendingChanges = true;
        setSaveState('dirty', '共有先への保存待ちです。');
        schedulePush();
      } else {
        markSaved();
      }
    } catch (error) {
      console.warn('ON HAND shared-state pull failed', error);
      setSaveState('error', error.message);
    }
  }

  function detectLocalChanges() {
    if (applyingSharedState) return;
    const current = readHistory();
    const ids = new Set([...Object.keys(baselineHistory), ...Object.keys(current)]);
    const changes = {};
    let changed = false;

    ids.forEach((id) => {
      const before = baselineHistory[id] || null;
      const after = current[id] || null;
      if (sameObject(before, after)) return;
      changed = true;
      if (after) {
        changes[id] = {
          status: after.status === 'skip' ? 'skipped' : 'handled',
          at: after.at || nowIso(),
          title_key: after.title_key,
          recurring: Boolean(after.recurring),
          ...(after.status === 'skip' && after.skip_until ? { skip_until:after.skip_until } : {})
        };
      } else {
        const cached = readCacheItems()[id] || before || {};
        changes[id] = {
          status: 'open',
          at: nowIso(),
          title_key: cached.title_key,
          recurring: Boolean(cached.recurring)
        };
      }
    });

    baselineHistory = current;
    if (!changed) return;
    const merged = mergeItems(readCacheItems(), changes);
    writeCache(merged);
    markDirty();
    schedulePush();
  }

  function scheduleImmediateDetection(event) {
    if (!event.target?.closest?.('.done-box,.skip-btn,.movement-done,.movement-skip')) return;
    setTimeout(detectLocalChanges, 0);
  }

  window.addEventListener('storage', (event) => {
    if (event.key === HISTORY_KEY && !applyingSharedState) setTimeout(detectLocalChanges, 0);
    if (event.key === CACHE_KEY && !applyingSharedState) {
      const merged = mergeItems(readCacheItems(), historyToShared(readHistory()));
      applySharedItems(merged);
    }
  });

  document.addEventListener('change', scheduleImmediateDetection);
  document.addEventListener('click', scheduleImmediateDetection);
  window.addEventListener('focus', () => pullSharedState());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pullSharedState();
  });

  setInterval(detectLocalChanges, LOCAL_POLL_MS);
  setInterval(() => {
    if (!document.hidden) pullSharedState();
  }, REMOTE_REFRESH_MS);

  installStatusUi();
  if (resetApplied) setSaveState(token() ? 'syncing' : 'local', '旧ローカル状態をリセットしました。');

  // Bootstrap from the shared-state cache only. Legacy local DONE/SKIP is intentionally not seeded.
  const initial = readCacheItems();
  applySharedItems(initial);
  pullSharedState();

  window.COCKPID_ON_HAND_SYNC = Object.freeze({
    pull: pullSharedState,
    push: pushSharedState,
    remotePath: REMOTE_PATH,
    cacheKey: CACHE_KEY,
    resetMarker: RESET_MARKER_VALUE,
    status: () => document.documentElement.dataset.onhandSync || 'local'
  });
})();