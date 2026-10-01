(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const REPO = 'my-storage-note';
  const BRANCH = 'main';
  const TOKEN_KEY = 'zen-note-github-token';
  const MAX_RETRIES = 3;
  const dock = document.querySelector('.dock');

  const token = () => {
    try { return localStorage.getItem(TOKEN_KEY) || ''; }
    catch (_) { return ''; }
  };

  const headers = () => {
    const value = token();
    return {
      Accept: 'application/vnd.github+json',
      ...(value ? { Authorization: `Bearer ${value}` } : {})
    };
  };

  const clamp = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(1, n));
  };

  const width = (value) => {
    const v = clamp(value);
    return v == null ? '0%' : `${(v * 100).toFixed(3)}%`;
  };

  function encodeUtf8(value) {
    const bytes = new TextEncoder().encode(String(value));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function decodeUtf8(value) {
    const binary = atob(String(value || '').replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  const apiPath = (path) => String(path || '').split('/').map(encodeURIComponent).join('/');

  function jstParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return {
      year: get('year'), month: get('month'), day: get('day'),
      hour: get('hour'), minute: get('minute'), second: get('second')
    };
  }

  function dateKey(date = new Date()) {
    const p = jstParts(date);
    return `${p.year}-${p.month}-${p.day}`;
  }

  function jstIsoNow(date = new Date()) {
    const p = jstParts(date);
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${ms}+09:00`;
  }

  function createGauge(config) {
    const {
      kind, dir, compactId, currentId, ghostId, sheetId, backdropId, closeId,
      rangeId, previewId, editorGhostId, saveId, statusId, dockSelector,
      cssBottomVar, dockGap
    } = config;

    const compact = document.getElementById(compactId);
    const compactCurrent = document.getElementById(currentId);
    const compactGhost = document.getElementById(ghostId);
    const sheet = document.getElementById(sheetId);
    const backdrop = document.getElementById(backdropId);
    const closeButton = document.getElementById(closeId);
    const range = document.getElementById(rangeId);
    const preview = document.getElementById(previewId);
    const editorGhost = document.getElementById(editorGhostId);
    const saveButton = document.getElementById(saveId);
    const status = document.getElementById(statusId);
    const dockLayer = document.querySelector(dockSelector);

    if (!compact || !sheet || !range || !saveButton || !dockLayer) return null;

    let currentEntry = null;
    let previousEntry = null;
    let saving = false;
    let dockResizeObserver = null;

    const pathFor = (key) => `${dir}/${key}.json`;

    function normalizeEntries(payload) {
      const entries = Array.isArray(payload?.entries) ? payload.entries : [];
      return entries
        .map((entry) => ({
          id: String(entry?.id || ''),
          at: String(entry?.at || ''),
          value: clamp(entry?.value)
        }))
        .filter((entry) => entry.at && entry.value != null)
        .sort((a, b) => a.at.localeCompare(b.at));
    }

    async function getContent(path) {
      const response = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${apiPath(path)}?ref=${encodeURIComponent(BRANCH)}`,
        { headers: headers(), cache: 'no-store' }
      );
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`READ ${response.status}`);
      return response.json();
    }

    async function readDay(key) {
      const file = await getContent(pathFor(key));
      if (!file) return { sha: null, payload: { schema_version: 1, date: key, entries: [] } };
      let payload = {};
      try { payload = JSON.parse(decodeUtf8(file.content)); }
      catch (_) { throw new Error(`${kind} LOG FORMAT ERROR`); }
      return {
        sha: file.sha || null,
        payload: {
          schema_version: 1,
          date: key,
          updated_at: String(payload?.updated_at || ''),
          entries: normalizeEntries(payload)
        }
      };
    }

    async function recentDateFiles(today) {
      const response = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${apiPath(dir)}?ref=${encodeURIComponent(BRANCH)}`,
        { headers: headers(), cache: 'no-store' }
      );
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`LIST ${response.status}`);
      const items = await response.json();
      return (Array.isArray(items) ? items : [])
        .map((item) => String(item?.name || ''))
        .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
        .map((name) => name.slice(0, 10))
        .filter((key) => key <= today)
        .sort((a, b) => b.localeCompare(a));
    }

    async function loadHistory() {
      if (!token()) {
        currentEntry = null;
        previousEntry = null;
        renderCompact();
        return;
      }

      const today = dateKey();
      const keys = await recentDateFiles(today);
      const ordered = keys.includes(today) ? keys : [today, ...keys];
      const latest = [];

      for (const key of ordered) {
        if (latest.length >= 2) break;
        const day = await readDay(key);
        const entries = normalizeEntries(day.payload).reverse();
        for (const entry of entries) {
          latest.push(entry);
          if (latest.length >= 2) break;
        }
      }

      currentEntry = latest[0] || null;
      previousEntry = latest[1] || null;
      renderCompact();
    }

    function syncDockPosition() {
      if (!dock) return;
      const rect = dock.getBoundingClientRect();
      if (!Number.isFinite(rect.top)) return;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const bottom = Math.max(12, Math.round(viewportHeight - rect.top + dockGap));
      dockLayer.style.setProperty(cssBottomVar, `${bottom}px`);
    }

    function renderCompact() {
      compact.classList.toggle('has-value', Boolean(currentEntry));
      compact.classList.toggle('has-ghost', Boolean(previousEntry));
      compactCurrent.style.width = width(currentEntry?.value);
      compactGhost.style.width = width(previousEntry?.value);
    }

    function renderEditor() {
      const value = clamp(Number(range.value) / 1000) ?? .5;
      preview.style.width = width(value);
      editorGhost.style.width = width(currentEntry?.value);
      editorGhost.style.opacity = currentEntry ? '1' : '0';
    }

    const setStatus = (message) => { if (status) status.textContent = message; };

    function openEditor() {
      range.value = String(Math.round((currentEntry?.value ?? .5) * 1000));
      renderEditor();
      setStatus(token() ? 'TOUCH THE BAR' : 'TOKEN REQUIRED');
      sheet.classList.add('open');
      sheet.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => range.focus({ preventScroll: true }));
    }

    function closeEditor() {
      if (saving) return;
      sheet.classList.remove('open');
      sheet.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      compact.focus({ preventScroll: true });
    }

    function entryId(at) {
      if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
      return `${kind.toLowerCase()}-${at.replace(/\D/g, '')}-${Math.random().toString(36).slice(2, 8)}`;
    }

    async function append(value) {
      const key = dateKey();
      const at = jstIsoNow();
      const id = entryId(at);
      const entry = { id, at, value: Number(value.toFixed(3)) };
      let lastError = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
        try {
          const day = await readDay(key);
          const entries = normalizeEntries(day.payload);
          if (!entries.some((item) => item.id === id)) entries.push(entry);
          entries.sort((a, b) => a.at.localeCompare(b.at));

          const payload = {
            schema_version: 1,
            date: key,
            updated_at: at,
            entries
          };
          const body = {
            message: `cockpid ${kind.toLowerCase()}: log ${key}`,
            content: encodeUtf8(`${JSON.stringify(payload, null, 2)}\n`),
            branch: BRANCH,
            ...(day.sha ? { sha: day.sha } : {})
          };
          const response = await fetch(
            `https://api.github.com/repos/${OWNER}/${REPO}/contents/${apiPath(pathFor(key))}`,
            {
              method: 'PUT',
              headers: { ...headers(), 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            }
          );

          if (response.ok) return entry;
          if ((response.status === 409 || response.status === 422) && attempt < MAX_RETRIES - 1) {
            await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
            continue;
          }
          throw new Error(`WRITE ${response.status}`);
        } catch (error) {
          lastError = error;
          if (attempt >= MAX_RETRIES - 1) break;
        }
      }
      throw lastError || new Error('WRITE FAILED');
    }

    async function save() {
      if (saving) return;
      if (!token()) {
        setStatus('TOKEN REQUIRED · SETTINGS');
        return;
      }
      const value = clamp(Number(range.value) / 1000);
      if (value == null) return;

      saving = true;
      sheet.classList.add('saving');
      saveButton.disabled = true;
      setStatus('SAVING…');

      const oldCurrent = currentEntry;
      try {
        const saved = await append(value);
        previousEntry = oldCurrent;
        currentEntry = saved;
        renderCompact();
        setStatus('SAVED');
        setTimeout(() => {
          saving = false;
          sheet.classList.remove('saving');
          saveButton.disabled = false;
          closeEditor();
        }, 420);
      } catch (error) {
        console.error(`[${kind}]`, error);
        setStatus(`SAVE ERROR · ${String(error?.message || error)}`);
        saving = false;
        sheet.classList.remove('saving');
        saveButton.disabled = false;
      }
    }

    compact.addEventListener('click', openEditor);
    backdrop?.addEventListener('click', closeEditor);
    closeButton?.addEventListener('click', closeEditor);
    range.addEventListener('input', renderEditor);
    saveButton.addEventListener('click', save);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && sheet.classList.contains('open')) closeEditor();
    });
    window.addEventListener('storage', (event) => {
      if (event.key === TOKEN_KEY) loadHistory().catch((error) => console.error(`[${kind}]`, error));
    });
    window.addEventListener('resize', syncDockPosition, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(syncDockPosition, 80), { passive: true });
    window.visualViewport?.addEventListener('resize', syncDockPosition, { passive: true });
    if (dock && 'ResizeObserver' in window) {
      dockResizeObserver = new ResizeObserver(syncDockPosition);
      dockResizeObserver.observe(dock);
    }

    syncDockPosition();
    renderCompact();
    loadHistory().catch((error) => {
      console.error(`[${kind}]`, error);
      renderCompact();
    });

    return Object.freeze({ refresh: loadHistory, open: openEditor });
  }

  window.COCKPID_HP = createGauge({
    kind: 'HP',
    dir: 'app-state/cockpid/hp',
    compactId: 'hpCompact',
    currentId: 'hpCompactCurrent',
    ghostId: 'hpCompactGhost',
    sheetId: 'hpSheet',
    backdropId: 'hpSheetBackdrop',
    closeId: 'hpClose',
    rangeId: 'hpRange',
    previewId: 'hpPreview',
    editorGhostId: 'hpEditorGhost',
    saveId: 'hpSave',
    statusId: 'hpStatus',
    dockSelector: '.hp-dock',
    cssBottomVar: '--hp-dock-bottom',
    dockGap: 36
  });

  window.COCKPID_MP = createGauge({
    kind: 'MP',
    dir: 'app-state/cockpid/mp',
    compactId: 'mpCompact',
    currentId: 'mpCompactCurrent',
    ghostId: 'mpCompactGhost',
    sheetId: 'mpSheet',
    backdropId: 'mpSheetBackdrop',
    closeId: 'mpClose',
    rangeId: 'mpRange',
    previewId: 'mpPreview',
    editorGhostId: 'mpEditorGhost',
    saveId: 'mpSave',
    statusId: 'mpStatus',
    dockSelector: '.mp-dock',
    cssBottomVar: '--mp-dock-bottom',
    dockGap: 10
  });
})();
