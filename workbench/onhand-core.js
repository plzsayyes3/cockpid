(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const REPO = 'my-storage-note';
  const BRANCH = 'main';
  const TOKEN_KEY = 'zen-note-github-token';
  const HISTORY_KEY = 'cockpid.today-movement.checked.v1';
  const AUDIT_NAME = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})-work-home-task-audit\.json$/;
  const TYPES = ['action', 'question', 'idea', 'theme', 'hypothesis'];
  const BUCKETS = ['task', 'check', 'keep'];
  const WEEKLY_SKIP_TYPES = new Set(['idea', 'theme', 'hypothesis']);
  const LEGACY_MODES = new Set(['do', 'task', 'check', 'keep']);
  const MAX_RETRIES = 3;

  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const hasToken = () => Boolean(token());
  const decode = (value) => {
    const binary = atob(String(value || '').replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  };
  const encode = (value) => {
    const bytes = new TextEncoder().encode(String(value ?? ''));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

  async function gh(path, repo = REPO) {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/${path}?ref=${BRANCH}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token()}` },
      cache: 'no-store'
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${repo} read ${response.status}`);
    return response.json();
  }

  async function put(path, text, sha, message, repo = REPO) {
    const body = { message, branch: BRANCH, content: encode(text) };
    if (sha) body.sha = sha;
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (response.status === 409 || response.status === 422) {
      const error = new Error(`${repo} conflict ${response.status}`);
      error.conflict = true;
      throw error;
    }
    if (!response.ok) throw new Error(`${repo} write ${response.status}`);
    return response.json();
  }

  function jstParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    return { year: get('year'), month: get('month'), day: get('day') };
  }

  function key(parts) {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  function shift(parts, delta) {
    const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + delta));
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
  }

  function jstMidnightIso(parts) {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, -9, 0, 0)).toISOString();
  }

  function nowJstIso() {
    const shifted = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('Z', '+09:00');
    return shifted;
  }

  const today = () => key(jstParts());
  const weekStart = () => key(shift(jstParts(), -6));

  function normalizeMode(mode) {
    const value = String(mode || '').toLowerCase();
    if (value === 'do' || value === 'task') return 'task';
    if (value === 'check' || value === 'keep') return value;
    return null;
  }

  function classify(type, item) {
    const explicit = normalizeMode(item?.mode);
    if (explicit) return explicit;
    if (item?._isCanonicalTask) return 'task';
    const text = `${item?.title || ''} ${item?.summary || ''}`;
    if (type === 'question') return 'check';
    if (type === 'idea' || type === 'theme') return 'keep';
    if (type === 'hypothesis') return /(考え|検討|整理|構想|方針|設計|判断|振り返)/.test(text) ? 'keep' : 'check';
    if (/(確認|状況|対象|進捗|チェック|把握|照合|レビュー|聞く|調べる|見直す)/.test(text)) return 'check';
    if (/(考え|検討|整理|構想|方針|目的|設計|見極め|判断|振り返)/.test(text)) return 'keep';
    return 'task';
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
          ...(value.status === 'skip' && value.skip_until ? { skip_until: value.skip_until } : {})
        };
      } else if (value?.checked_at) {
        out[id] = { status: 'done', at: value.checked_at, title_key: value.title_key, recurring: Boolean(value.recurring) };
      }
    });
    return out;
  }

  function readHistory() {
    try { return normalizeHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}')); }
    catch (_) { return {}; }
  }

  function writeHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(normalizeHistory(history)));
    window.dispatchEvent(new Event('cockpid:onhand-history-written'));
  }

  function historyFromText(text) {
    try { return normalizeHistory(JSON.parse(text || '{}')); }
    catch (_) { return {}; }
  }

  function isExpiredSkip(state, now = Date.now()) {
    if (state?.status !== 'skip' || !state.skip_until) return false;
    const until = Date.parse(state.skip_until);
    return Number.isFinite(until) && now >= until;
  }

  function skipPlan(bucket, item, from = new Date()) {
    const parts = jstParts(from);
    const weekly = bucket === 'keep' || WEEKLY_SKIP_TYPES.has(item?._type);
    if (weekly) {
      const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
      const daysUntilSunday = weekday === 0 ? 7 : 7 - weekday;
      return { until: jstMidnightIso(shift(parts, daysUntilSunday)), feedback: '日曜 00:00 に再表示' };
    }
    return { until: jstMidnightIso(shift(parts, 1)), feedback: '明日 00:00 に再表示' };
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
    return clean(item?.title || item?.summary || '');
  }

  function canonicalCoverId(item) {
    const keyValue = titleKey(item);
    return keyValue ? `cover:${hashId(keyValue)}` : '';
  }

  function candidateSourceDate(item) {
    const raw = String(item?._date || item?.last_seen || item?.first_seen || item?.date || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  }

  function canonicalCoverState(item, history) {
    if (item?._isCanonicalTask) return null;
    const coverId = canonicalCoverId(item);
    if (!coverId) return null;
    const cover = history?.[coverId];
    if (cover?.status !== 'done') return null;
    const coveredAt = Date.parse(cover.at || '');
    if (!Number.isFinite(coveredAt)) return null;
    const sourceDate = candidateSourceDate(item);
    if (!sourceDate) return cover;
    const coveredDate = key(jstParts(new Date(coveredAt)));
    return sourceDate <= coveredDate ? cover : null;
  }

  function areaContextOf(item, areaView) {
    const resolver = window.COCKPID_AREA_CONTEXT || window.AreaContext;
    return resolver?.resolve ? resolver.resolve(item, areaView) : { area: null, project: null, assignment: null };
  }

  function legacyItemId(item) {
    return hashId(`${item._date}|${item._type}|${item.title || item.summary || ''}`);
  }

  function itemId(item) {
    if (item?._isCanonicalTask && item?._canonicalTaskId) return `task:${item._canonicalTaskId}`;
    return item?._isRecurring ? legacyItemId(item) : hashId(`v2|${item._type}|${titleKey(item)}`);
  }

  function migrateHistoryForItems(items, history) {
    let changed = false;
    items.filter((item) => !item._isCanonicalTask).forEach((item) => {
      const nextId = itemId(item);
      const oldId = legacyItemId(item);
      if (nextId === oldId || history[nextId] || !history[oldId]) return;
      history[nextId] = { ...history[oldId], title_key: titleKey(item), recurring: Boolean(item._isRecurring) };
      delete history[oldId];
      changed = true;
    });
    if (changed) writeHistory(history);
    return changed;
  }

  function ensureSkipDeadlines(items, history) {
    let changed = false;
    items.forEach((item) => {
      const id = itemId(item);
      const state = history[id];
      if (state?.status !== 'skip') return;
      if (state.skip_until && Number.isFinite(Date.parse(state.skip_until))) return;
      const from = state.at && Number.isFinite(Date.parse(state.at)) ? new Date(state.at) : new Date();
      state.skip_until = skipPlan(classify(item._type, item), item, from).until;
      changed = true;
    });
    Object.entries(history).forEach(([id, state]) => {
      if (!isExpiredSkip(state)) return;
      delete history[id];
      changed = true;
    });
    if (changed) writeHistory(history);
    return changed;
  }

  function stateFor(item, history) {
    const covered = canonicalCoverState(item, history);
    if (covered) return covered;
    const state = history[itemId(item)] || null;
    if (isExpiredSkip(state)) return null;
    if (item?._isCanonicalTask && state?.status === 'done') {
      const touched = Date.parse(item.last_touched || item.created_at || '');
      const handled = Date.parse(state.at || '');
      if (Number.isFinite(touched) && Number.isFinite(handled) && touched > handled) return null;
    }
    return state;
  }

  function setLocalStatus(item, status, history) {
    const id = itemId(item);
    if (status === 'done') {
      const at = new Date().toISOString();
      history[id] = {
        status: 'done', at, title_key: titleKey(item), recurring: Boolean(item?._isRecurring)
      };
      if (item?._isCanonicalTask) {
        const coverId = canonicalCoverId(item);
        if (coverId) {
          history[coverId] = {
            status: 'done', at, title_key: titleKey(item), recurring: false
          };
        }
      }
    } else if (status === 'skip') {
      const plan = skipPlan(classify(item._type, item), item);
      history[id] = {
        status: 'skip', at: new Date().toISOString(), skip_until: plan.until,
        title_key: titleKey(item), recurring: Boolean(item?._isRecurring)
      };
    } else {
      delete history[id];
    }
    writeHistory(history);
    return status === 'skip' ? skipPlan(classify(item._type, item), item).feedback : '';
  }

  function mergeByPriority(...groups) {
    const seenTitles = new Set();
    const seenOccurrences = new Set();
    const seenCanonicalIds = new Set();
    const canonicalByTitle = new Map();
    const merged = [];
    groups.flat().forEach((item) => {
      const keyValue = titleKey(item);
      if (!keyValue) return;

      if (item?._isCanonicalTask) {
        const canonicalId = String(item._canonicalTaskId || item.id || '');
        if (!canonicalId || seenCanonicalIds.has(canonicalId)) return;
        seenCanonicalIds.add(canonicalId);
        seenTitles.add(keyValue);
        if (!canonicalByTitle.has(keyValue)) canonicalByTitle.set(keyValue, item);
        merged.push(item);
        return;
      }

      const canonical = canonicalByTitle.get(keyValue);
      if (canonical) return;

      if (item?._isRecurring) {
        const occurrenceId = legacyItemId(item);
        if (seenOccurrences.has(occurrenceId)) return;
        seenOccurrences.add(occurrenceId);
        merged.push(item);
        return;
      }

      if (seenTitles.has(keyValue)) return;
      seenTitles.add(keyValue);
      merged.push(item);
    });
    return merged;
  }

  async function loadCanonicalTasks() {
    try {
      const payload = await gh('views/tasks.json');
      if (!payload?.content) throw new Error('views/tasks.json を読めません');
      const data = JSON.parse(decode(payload.content));
      return (Array.isArray(data?.tasks) ? data.tasks : [])
        .filter((task) => !task?.completed && task?.id && titleKey(task))
        .map((task) => ({
          ...task,
          mode: normalizeMode(task.mode) || 'task',
          _type: 'task',
          _date: String(task.last_touched || task.created_at || today()).slice(0, 10),
          _source: 'shared-task',
          _canonicalTaskId: task.id,
          _isCanonicalTask: true,
          _isRecurring: false
        }));
    } catch (error) {
      console.error('ON HAND Shared Task load failed', error);
      return null;
    }
  }

  async function loadCuratedWeek() {
    try {
      const payload = await gh(`memory/indexes/movement/${weekStart()}_${today()}.json`);
      if (!payload?.content) return null;
      const data = JSON.parse(decode(payload.content));
      if (!Array.isArray(data?.items)) return null;
      return data.items.map((item) => ({ ...item, _type: item.type || 'idea', _date: item.date || today(), _source: 'week' }));
    } catch (error) {
      console.error('ON HAND curated load failed', error);
      return null;
    }
  }

  async function loadLegacySevenDays() {
    const start = weekStart();
    const end = today();
    const failedTypes = new Set();
    const directories = await Promise.all(TYPES.map(async (type) => {
      try {
        const entries = await gh(`memory/extracted/${type}`);
        return { type, entries: Array.isArray(entries) ? entries : [] };
      } catch (error) {
        console.error(`ON HAND recent ${type} index load failed`, error);
        failedTypes.add(type);
        return { type, entries: [] };
      }
    }));
    const files = [];
    directories.forEach(({ type, entries }) => entries.forEach((entry) => {
      if (entry?.type !== 'file' || !/^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name)) return;
      const date = entry.name.slice(0, 10);
      if (date >= start && date <= end) files.push({ type, date, path: `memory/extracted/${type}/${entry.name}` });
    }));
    const groups = await Promise.all(files.map(async (file) => {
      try {
        const payload = await gh(file.path);
        if (!payload?.content) {
          failedTypes.add(file.type);
          return [];
        }
        const data = JSON.parse(decode(payload.content));
        return (Array.isArray(data?.items) ? data.items : []).map((item) => ({
          ...item, _type: file.type, _date: file.date, _source: 'legacy'
        }));
      } catch (error) {
        console.error(`ON HAND recent ${file.type} file load failed`, error);
        failedTypes.add(file.type);
        return [];
      }
    }));
    return { items: groups.flat(), failedTypes: [...failedTypes] };
  }

  async function latestAuditPath() {
    try {
      const entries = await gh('memory/indexes/movement');
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
      throw error;
    }
  }

  async function loadAudit() {
    try {
      const path = await latestAuditPath();
      if (!path) return { items: [], recurringTitles: new Set(), loaded: false, failed: false };
      const payload = await gh(path);
      if (!payload?.content) return { items: [], recurringTitles: new Set(), loaded: false, failed: true };
      const data = JSON.parse(decode(payload.content));
      if (!Array.isArray(data?.items)) return { items: [], recurringTitles: new Set(), loaded: false, failed: true };
      const recurringTitles = new Set((Array.isArray(data?.recurring_work) ? data.recurring_work : []).map(titleKey).filter(Boolean));
      const items = data.items
        .filter((item) => String(item?.state_at_last_source || '').toLowerCase() !== 'completed')
        .filter((item) => LEGACY_MODES.has(String(item?.mode || '').toLowerCase()))
        .map((item) => ({
          ...item,
          mode: normalizeMode(item.mode) || item.mode,
          _type: item.type || 'action',
          _date: item.last_seen || item.first_seen || today(),
          _source: 'audit'
        }));
      return { items, recurringTitles, loaded: true, failed: false };
    } catch (error) {
      console.error('ON HAND audit load failed', error);
      return { items: [], recurringTitles: new Set(), loaded: false, failed: true };
    }
  }

  async function loadAllItems() {
    const [taskResult, curated, audit] = await Promise.all([loadCanonicalTasks(), loadCuratedWeek(), loadAudit()]);
    const tasks = Array.isArray(taskResult) ? taskResult : [];
    const legacyResult = curated?.length ? { items: [], failedTypes: [] } : await loadLegacySevenDays();
    const weekItems = curated?.length
      ? curated
      : [...legacyResult.items].sort((a, b) => String(b?._date || '').localeCompare(String(a?._date || '')));

    const recurringTitles = new Set(audit.recurringTitles);
    [...weekItems, ...audit.items].forEach((item) => {
      if (item?.recurring || item?.cadence) {
        const keyValue = titleKey(item);
        if (keyValue) recurringTitles.add(keyValue);
      }
    });

    const prepare = (item) => ({
      ...item,
      mode: normalizeMode(item.mode) || item.mode,
      _isRecurring: Boolean(item._isCanonicalTask ? false : recurringTitles.has(titleKey(item)))
    });

    const candidates = mergeByPriority(
      tasks.map(prepare),
      weekItems.map(prepare),
      audit.items.map(prepare)
    );

    return {
      items: candidates,
      tasksLoaded: tasks.length,
      tasksLoadFailed: taskResult === null,
      auditLoaded: audit.loaded,
      auditLoadFailed: Boolean(audit.failed),
      recentLoadFailedTypes: legacyResult.failedTypes,
      partialData: Boolean(audit.failed || legacyResult.failedTypes.length),
      curated: Boolean(curated?.length),
      start: weekStart(),
      end: today()
    };
  }

  function mutateTaskCompletion(text, taskId) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const escapedId = String(taskId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idPattern = new RegExp(`^(\\s*)-\\s+id:\\s*${escapedId}\\s*$`);
    const start = lines.findIndex((line) => idPattern.test(line));
    if (start < 0) throw new Error('Shared Taskが見つかりません');

    const taskIndent = lines[start].match(idPattern)?.[1] || '';
    const fieldIndent = `${taskIndent}  `;
    const nextTaskPattern = new RegExp(`^${taskIndent}-\\s+id:\\s*`);
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      if (nextTaskPattern.test(lines[i]) || /^series:\s*/.test(lines[i])) { end = i; break; }
    }

    const completedPattern = new RegExp(`^${fieldIndent}completed:\\s*(true|false)\\s*$`);
    const completedIndex = lines.slice(start, end).findIndex((line) => completedPattern.test(line));
    if (completedIndex < 0) throw new Error('Shared Taskのcompletedフィールドがありません');
    const absoluteCompleted = start + completedIndex;
    if (/true\s*$/.test(lines[absoluteCompleted])) return { duplicate: true, text };
    lines[absoluteCompleted] = `${fieldIndent}completed: true`;

    const touchedPattern = new RegExp(`^${fieldIndent}last_touched:\\s*`);
    const touchedIndex = lines.slice(start, end).findIndex((line) => touchedPattern.test(line));
    if (touchedIndex >= 0) lines[start + touchedIndex] = `${fieldIndent}last_touched: ${nowJstIso()}`;
    return { duplicate: false, text: `${lines.join('\n').replace(/\s+$/, '')}\n` };
  }
  async function completeCanonicalTask(taskId) {
    if (!hasToken()) throw new Error('GitHub token が必要です');
    const path = 'objects/tasks/current.yml';
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const current = await gh(path);
      if (!current?.content) throw new Error('Shared Task正本を読めません');
      const result = mutateTaskCompletion(decode(current.content), taskId);
      if (result.duplicate) return { duplicate: true };
      try {
        await put(path, result.text, current.sha, `tasks: complete ${taskId}`);
        return { duplicate: false };
      } catch (error) {
        if (!error.conflict || attempt === MAX_RETRIES - 1) throw error;
      }
    }
    throw new Error('Shared Task更新の競合を解消できませんでした');
  }

  window.COCKPID_ONHAND_CORE = Object.freeze({
    BUCKETS,
    HISTORY_KEY,
    esc,
    clean,
    hasToken,
    readFile: gh,
    writeFile: put,
    today,
    weekStart,
    classify,
    normalizeMode,
    titleKey,
    areaContextOf,
    itemId,
    readHistory,
    writeHistory,
    historyFromText,
    migrateHistoryForItems,
    ensureSkipDeadlines,
    stateFor,
    setLocalStatus,
    isExpiredSkip,
    skipPlan,
    loadAllItems,
    completeCanonicalTask
  });
})();
