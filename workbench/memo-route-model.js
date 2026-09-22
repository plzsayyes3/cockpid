(() => {
  'use strict';

  const STORAGE_KEY = 'cockpid.memo-routes.v1';
  const BRANCHES = Object.freeze([
    Object.freeze({ key: 'project', label: 'Project' }),
    Object.freeze({ key: 'assignment', label: 'Assignment' }),
    Object.freeze({ key: 'task', label: 'Task' }),
    Object.freeze({ key: 'reference', label: 'Reference' }),
    Object.freeze({ key: 'principle', label: 'Principle' }),
  ]);
  const branchByKey = new Map(BRANCHES.map((branch) => [branch.key, branch]));

  function storeOrDefault(store) {
    if (store) return store;
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    return null;
  }

  function branchTypes() {
    return BRANCHES.map((branch) => ({ ...branch }));
  }

  function selectArea(area) {
    const areaId = String(area?.id || '').trim();
    if (!areaId) return null;
    return { areaId, areaTitle: String(area?.title || areaId).trim(), branch: null };
  }

  function selectBranch(area, key, record = null) {
    const selectedArea = selectArea(area);
    const branch = branchByKey.get(String(key || '').trim().toLowerCase());
    if (!selectedArea || !branch) return null;
    const recordId = String(record?.id || '').trim();
    const recordTitle = String(record?.title || record?.name || '').trim();
    return {
      ...selectedArea,
      branch: branch.key,
      label: branch.label,
      ...(recordId ? { recordId } : {}),
      ...(recordTitle ? { recordTitle } : {}),
    };
  }

  function validRoute(value) {
    if (!value || typeof value !== 'object') return null;
    const route = selectBranch(
      { id: value.areaId, title: value.areaTitle },
      value.branch,
      value.recordId ? { id: value.recordId, title: value.recordTitle } : null
    );
    return route && route.areaId === String(value.areaId || '').trim() ? route : null;
  }

  function readState(store) {
    const target = storeOrDefault(store);
    if (!target) return { current: null, memos: {} };
    try {
      const parsed = JSON.parse(target.getItem(STORAGE_KEY) || '{}');
      const memos = parsed?.memos && typeof parsed.memos === 'object' && !Array.isArray(parsed.memos)
        ? Object.fromEntries(Object.entries(parsed.memos).map(([name, route]) => [name, validRoute(route)]).filter(([, route]) => route))
        : {};
      return { current: validRoute(parsed?.current), memos };
    } catch (_) {
      return { current: null, memos: {} };
    }
  }

  function writeState(state, store) {
    const target = storeOrDefault(store);
    if (!target) return;
    target.setItem(STORAGE_KEY, JSON.stringify({ version: 1, current: state.current, memos: state.memos }));
  }

  function setCurrent(route, store) {
    const normalized = validRoute(route);
    if (!normalized) return null;
    const state = readState(store);
    state.current = normalized;
    writeState(state, store);
    return normalized;
  }

  function current(store) {
    return readState(store).current;
  }

  function recordMemo(fileName, store, route = null) {
    const name = String(fileName || '').trim();
    const selected = validRoute(route) || current(store);
    if (!name || !selected) return null;
    const state = readState(store);
    state.current = selected;
    state.memos[name] = selected;
    writeState(state, store);
    return selected;
  }

  function forMemo(fileName, store) {
    return readState(store).memos[String(fileName || '').trim()] || null;
  }

  function displayLabel(route) {
    const selected = validRoute(route);
    if (!selected) return '';
    const record = selected.recordTitle ? ` · ${selected.recordTitle}` : '';
    return `${selected.areaTitle} · ${selected.label}${record}`;
  }

  function memoContent(content) {
    return String(content ?? '');
  }

  const api = {
    STORAGE_KEY,
    branchTypes,
    selectArea,
    selectBranch,
    setCurrent,
    current,
    recordMemo,
    forMemo,
    displayLabel,
    memoContent,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.COCKPID_MEMO_ROUTE = Object.freeze(api);
})();
