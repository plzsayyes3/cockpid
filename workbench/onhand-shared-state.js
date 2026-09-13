(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const REPO = 'my-storage-note';
  const BRANCH = 'main';
  const TOKEN_KEY = 'zen-note-github-token';
  const HISTORY_KEY = 'cockpid.today-movement.checked.v1';
  const CACHE_KEY = 'cockpid.onhand.shared-state.v1';
  const REMOTE_PATH = 'memory/state/on-hand.json';
  const LOCAL_POLL_MS = 1000;
  const REMOTE_REFRESH_MS = 60000;
  const PUSH_DEBOUNCE_MS = 800;

  let applyingSharedState = false;
  let baselineHistory = readHistory();
  let pushTimer = null;
  let syncPromise = null;
  let pushAgain = false;

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
          recurring: Boolean(value.recurring)
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
      out[id] = {
        status,
        at: value?.at || '',
        title_key: value?.title_key,
        recurring: Boolean(value?.recurring)
      };
    });
    return out;
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
        if (!out[id] || itemTime(value) >= itemTime(out[id])) out[id] = value;
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
        recurring: Boolean(value.recurring)
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
        recurring: Boolean(value.recurring)
      };
    });
    return out;
  }

  const sameObject = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

  function writeCache(items) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      schema_version: 1,
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
    if (response.status === 404) return { sha: null, items: {} };
    if (!response.ok) throw new Error(`ON HAND state read ${response.status}`);
    const payload = await response.json();
    const data = safeJson(decodeUtf8Base64(payload.content), {});
    return { sha: payload.sha || null, items: normalizeSharedItems(data) };
  }

  async function putRemote(items, sha = null) {
    const payload = {
      schema_version: 1,
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
    if (!token()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushSharedState().catch((error) => {
      console.warn('ON HAND shared-state push failed', error);
      document.documentElement.dataset.onhandSync = 'error';
    }), PUSH_DEBOUNCE_MS);
  }

  async function pushSharedState() {
    if (!token()) return;
    if (syncPromise) {
      pushAgain = true;
      return syncPromise;
    }

    syncPromise = (async () => {
      document.documentElement.dataset.onhandSync = 'syncing';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const remote = await fetchRemote();
        if (!remote) return;
        const cacheItems = readCacheItems();
        const merged = mergeItems(remote.items, cacheItems);
        applySharedItems(merged);
        if (sameObject(remote.items, merged)) {
          document.documentElement.dataset.onhandSync = 'ok';
          return;
        }
        try {
          await putRemote(merged, remote.sha);
          document.documentElement.dataset.onhandSync = 'ok';
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
      document.documentElement.dataset.onhandSync = 'local';
      return;
    }
    try {
      const remote = await fetchRemote();
      if (!remote) return;
      const cacheItems = readCacheItems();
      const localItems = historyToShared(readHistory());
      const merged = mergeItems(cacheItems, localItems, remote.items);
      applySharedItems(merged);
      document.documentElement.dataset.onhandSync = 'ok';
      if (!sameObject(remote.items, merged)) schedulePush();
    } catch (error) {
      console.warn('ON HAND shared-state pull failed', error);
      document.documentElement.dataset.onhandSync = 'error';
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
          recurring: Boolean(after.recurring)
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
    schedulePush();
  }

  window.addEventListener('storage', (event) => {
    if (event.key === HISTORY_KEY && !applyingSharedState) setTimeout(detectLocalChanges, 0);
    if (event.key === CACHE_KEY && !applyingSharedState) {
      const merged = mergeItems(readCacheItems(), historyToShared(readHistory()));
      applySharedItems(merged);
    }
  });

  window.addEventListener('focus', () => pullSharedState());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pullSharedState();
  });

  setInterval(detectLocalChanges, LOCAL_POLL_MS);
  setInterval(() => {
    if (!document.hidden) pullSharedState();
  }, REMOTE_REFRESH_MS);

  // Bootstrap: legacy local DONE/SKIP becomes the first shared-state seed.
  const initial = mergeItems(readCacheItems(), historyToShared(baselineHistory));
  applySharedItems(initial);
  pullSharedState();

  window.COCKPID_ON_HAND_SYNC = Object.freeze({
    pull: pullSharedState,
    push: pushSharedState,
    remotePath: REMOTE_PATH,
    cacheKey: CACHE_KEY
  });
})();
