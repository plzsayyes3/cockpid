(() => {
  'use strict';

  const $w = (id) => document.getElementById(id);
  const todayList = $w('todayList');
  const captureText = $w('captureText');
  const captureBtn = $w('captureBtn');
  const captureHint = document.querySelector('.capture-actions .quiet');
  let selectedDate = null;
  let calendarLoadSeq = 0;

  function sourceFor(name, fallbackRepo, fallbackDir) {
    return window.COCKPID_SOURCES?.get(name) || { repo: fallbackRepo, dir: fallbackDir };
  }

  function joinPath(dir, child) {
    const base = String(dir || '').replace(/^\/+|\/+$/g, '');
    const tail = String(child || '').replace(/^\/+/, '');
    return base ? `${base}/${tail}` : tail;
  }

  function encodeApiPath(path) {
    return String(path || '').split('/').map(encodeURIComponent).join('/');
  }

  function captureDefaultHint() {
    const source = sourceFor('inbox', 'mynotebook', '00_inbox');
    return `Ctrl / ⌘ + Enter で ${source.repo}/${source.dir} へ直接保存`;
  }

  function syncSourceHints() {
    if (captureHint) captureHint.textContent = captureDefaultHint();
  }

  function nowParts() {
    $w('todayDate').textContent = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
    }).format(new Date());
    $w('todayTime').textContent = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date());
  }

  function jstDateParts() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    return { year: get('year'), month: get('month'), day: get('day') };
  }

  function dateKey(parts) {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  function jstDateKey() {
    return dateKey(jstDateParts());
  }

  function shiftDate(parts, amount) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }

  function dateRelation(parts) {
    return dateKey(parts).localeCompare(jstDateKey());
  }

  function updateSelectedDateLabel() {
    const button = $w('todayDateBtn');
    if (!button || !selectedDate) return;
    const date = new Date(Date.UTC(selectedDate.year, selectedDate.month - 1, selectedDate.day));
    const weekday = new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC', weekday: 'short' }).format(date);
    button.textContent = `${selectedDate.month}/${selectedDate.day}(${weekday})`;
    button.classList.toggle('is-today', dateRelation(selectedDate) === 0);
  }

  function jstClockMinutes() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    return get('hour') * 60 + get('minute');
  }

  function inboxStamp() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
    const get = (type) => parts.find((part) => part.type === type)?.value || '00';
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}${milliseconds}`;
  }

  const encodeUtf8 = (value) => btoa(unescape(encodeURIComponent(value)));
  const timeToMinutes = (value) => {
    const [hour, minute] = String(value || '').split(':').map(Number);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
  };
  const padHour = (hour) => `${String(hour).padStart(2, '0')}:00`;

  function cleanItem(text) {
    const value = text.trim().replace(/^\[([ xX/])\]\s*/, '');
    const match = /^(\d{1,2}:\d{2})(?:\s*(?:-|–|—|〜|~)\s*(\d{1,2}:\d{2}))?\s+(.*)$/.exec(value);
    if (!match) return { time: '', title: value, start: null, end: null };
    const start = timeToMinutes(match[1]);
    let end = match[2] ? timeToMinutes(match[2]) : start + 45;
    if (end == null || end <= start) end = Math.min(start + 45, 24 * 60);
    return {
      time: match[2] ? `${match[1]}–${match[2]}` : match[1],
      title: match[3].trim(),
      start,
      end
    };
  }

  function uniqueCalendarItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = [item.start ?? '', item.end ?? '', item.time || '', item.title || ''].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function renderTodayTimeline(items, day) {
    items = uniqueCalendarItems(items);
    const relation = dateRelation(day);
    const isToday = relation === 0;
    const isPastDay = relation < 0;
    const now = jstClockMinutes();
    const timed = items.filter((item) => Number.isFinite(item.start)).sort((a, b) => a.start - b.start);
    const anytime = items.filter((item) => !Number.isFinite(item.start));
    const anytimeHtml = anytime.length ? `
      <div class="anytime${isPastDay ? ' past' : ''}">
        <span class="anytime-label">ANYTIME</span>
        <div class="anytime-items">${anytime.map((item) => `<span class="anytime-item">${esc(item.title)}</span>`).join('')}</div>
      </div>` : '';

    if (!timed.length) {
      todayList.innerHTML = anytimeHtml || '<div class="empty">この日の予定はまだありません。</div>';
      return;
    }

    let startHour = Math.max(0, Math.floor(timed[0].start / 60) - 1);
    let endHour = Math.min(24, Math.ceil(Math.max(...timed.map((item) => item.end)) / 60) + 1);
    if (endHour - startHour < 6) {
      const missing = 6 - (endHour - startHour);
      startHour = Math.max(0, startHour - Math.ceil(missing / 2));
      endHour = Math.min(24, Math.max(endHour, startHour + 6));
      if (endHour - startHour < 6) startHour = Math.max(0, endHour - 6);
    }

    const startMinutes = startHour * 60;
    const endMinutes = endHour * 60;
    const pxPerMinute = 0.58;
    const height = Math.max(220, Math.round((endMinutes - startMinutes) * pxPerMinute));
    const marks = [];
    for (let minutes = startMinutes; minutes <= endMinutes; minutes += 30) {
      const top = Math.min(height, Math.max(0, Math.round((minutes - startMinutes) * pxPerMinute)));
      if (minutes % 60 === 0) {
        marks.push(`<div class="timeline-hour" style="top:${top}px"><span>${padHour(minutes / 60)}</span></div>`);
      } else {
        marks.push(`<div class="timeline-half" style="top:${top}px"></div>`);
      }
    }

    const events = timed.map((item) => {
      const top = Math.round((item.start - startMinutes) * pxPerMinute);
      const eventHeight = Math.max(28, Math.round((item.end - item.start) * pxPerMinute));
      const past = isPastDay || (isToday && item.end <= now);
      return `<div class="timeline-event${past ? ' past' : ''}" style="top:${top}px;height:${eventHeight}px" title="${esc(item.time)}">
        <span class="timeline-event-time">${esc(item.time)}</span>
        <span class="timeline-event-title">${esc(item.title)}</span>
      </div>`;
    }).join('');

    let pastHeight = 0;
    if (isPastDay) pastHeight = height;
    else if (isToday) pastHeight = Math.min(height, Math.max(0, Math.round((now - startMinutes) * pxPerMinute)));
    const pastHtml = pastHeight > 0 ? `<div class="timeline-past" style="height:${pastHeight}px"></div>` : '';
    const nowHtml = isToday && now >= startMinutes && now <= endMinutes
      ? `<div class="timeline-now" style="top:${Math.round((now - startMinutes) * pxPerMinute)}px"><span>NOW</span></div>`
      : '';

    todayList.innerHTML = `${anytimeHtml}<div class="timeline" style="height:${height}px">${pastHtml}${marks.join('')}<div class="timeline-track">${events}</div>${nowHtml}</div>`;
  }

  async function loadToday({ background = false } = {}) {
    if (!selectedDate) selectedDate = jstDateParts();
    updateSelectedDateLabel();
    const seq = ++calendarLoadSeq;
    if (!token()) {
      if (!background) todayList.innerHTML = '<div class="empty">GitHub token が必要です。</div>';
      return;
    }

    const target = { ...selectedDate };
    const source = sourceFor('techo', 'mynotebook', '02_techo');
    const sourcePath = joinPath(source.dir, `${target.year}-${String(target.month).padStart(2, '0')}.md`);
    if (!background) todayList.innerHTML = '<div class="empty">Techoを読んでいます…</div>';
    try {
      const payload = await gh(sourcePath, source.repo);
      if (seq !== calendarLoadSeq) return;
      if (!payload?.content) throw new Error('no source');
      const lines = decode(payload.content).split(/\r?\n/);
      const heading = new RegExp(`^##\\s+${target.month}月${target.day}日(?:\\([^)]*\\))?\\s*$`);
      let active = false;
      const items = [];
      for (const raw of lines) {
        const line = raw.trimEnd();
        if (heading.test(line)) { active = true; continue; }
        if (active && /^##\s+/.test(line)) break;
        if (!active) continue;
        const match = /^\s*-\s+(.*)$/.exec(raw);
        if (match?.[1]?.trim()) items.push(cleanItem(match[1]));
      }
      renderTodayTimeline(items, target);
    } catch (error) {
      if (seq !== calendarLoadSeq) return;
      console.error(error);
      if (!background) todayList.innerHTML = '<div class="empty">Techoを読み込めませんでした。</div>';
    }
  }

  function moveCalendar(amount) {
    selectedDate = shiftDate(selectedDate || jstDateParts(), amount);
    loadToday();
  }

  function resetCalendarToday() {
    selectedDate = jstDateParts();
    loadToday();
  }


  const CAPTURE_WRITE_TIMEOUT_MS = 20000;
  const CAPTURE_VERIFY_TIMEOUT_MS = 10000;
  const captureOriginalLabel = captureBtn.textContent;
  let captureSaving = false;
  let pendingCapture = null;
  let captureStatusTimer = null;
  let captureLabelTimer = null;

  function captureStatus(message, reset = true) {
    if (!captureHint) return;
    clearTimeout(captureStatusTimer);
    captureHint.textContent = message;
    if (reset) captureStatusTimer = setTimeout(() => {
      captureHint.textContent = captureDefaultHint();
    }, 3500);
  }

  // Aborting a PUT does not prove GitHub rejected it: always verify ambiguous writes.
  async function captureRequest(url, options, timeoutMs) {
    const controller = new AbortController();
    let timeoutId;
    let timedOut = false;
    try {
      return await Promise.race([
        fetch(url, { ...options, signal: controller.signal }),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new Error('通信がタイムアウトしました'));
          }, timeoutMs);
        })
      ]);
    } catch (error) {
      if (timedOut) throw new Error(`通信タイムアウト（${Math.round(timeoutMs / 1000)}秒）`);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function captureUrl(entry) {
    return `https://api.github.com/repos/${OWNER}/${entry.repo}/contents/${encodeApiPath(entry.path)}`;
  }

  function captureHeaders(currentToken) {
    return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${currentToken}` };
  }

  async function captureStoredState(entry, currentToken) {
    const response = await captureRequest(captureUrl(entry), {
      method: 'GET', headers: captureHeaders(currentToken), cache: 'no-store'
    }, CAPTURE_VERIFY_TIMEOUT_MS);
    if (response.status === 404) return 'missing';
    if (!response.ok) throw new Error(`保存確認 ${response.status}`);
    const payload = await response.json();
    if (!payload || typeof payload.content !== 'string') {
      throw new Error('保存確認の応答に本文がありません');
    }
    return payload.content.replace(/\s/g, '') === encodeUtf8(`${entry.text}\n`)
      ? 'saved' : 'different';
  }

  function captureSaved(entry) {
    // Keep any text edited while the save request was in progress.
    const editedDuringSave = captureText.value.trim() !== entry.text;
    if (!editedDuringSave) captureText.value = '';
    pendingCapture = null;
    try { window.COCKPID_MEMO_ROUTE?.recordMemo(entry.name); }
    catch (error) { console.warn('memo route metadata could not be recorded', error); }
    captureBtn.textContent = '保存済み ✓';
    captureStatus(editedDuringSave
      ? `保存しました · ${entry.name}（入力中の変更は未保存です）`
      : `保存しました · ${entry.name}`);
    window.COCKPID_RESIDENT?.complete?.('capture-save');
    clearTimeout(captureLabelTimer);
    captureLabelTimer = setTimeout(() => { captureBtn.textContent = captureOriginalLabel; }, 1600);
  }

  async function saveCaptureDirect() {
    // The shortcut bypasses disabled button state, so guard concurrent calls in code.
    if (captureSaving) return;
    const text = captureText.value.trim();
    if (!text) return captureText.focus();
    const currentToken = token();
    if (!currentToken) return captureStatus('GitHub token が必要です');

    const source = sourceFor('inbox', 'mynotebook', '00_inbox');
    const reusePending = pendingCapture && pendingCapture.text === text &&
      pendingCapture.repo === source.repo && pendingCapture.dir === source.dir;
    const entry = reusePending ? pendingCapture : {
      text, repo: source.repo, dir: source.dir, name: `${inboxStamp()}.md`
    };
    if (!reusePending) entry.path = joinPath(source.dir, entry.name);
    pendingCapture = entry;
    captureSaving = true;
    let writeAttempted = false;
    clearTimeout(captureLabelTimer);
    captureBtn.disabled = true;
    captureBtn.textContent = reusePending ? '保存結果を確認中…' : '保存中…';
    captureStatus(`${source.repo}/${source.dir} へ保存しています…`, false);
    window.COCKPID_RESIDENT?.working?.('capture-save');
    try {
      if (reusePending) {
        const prior = await captureStoredState(entry, currentToken);
        if (prior === 'saved') {
          captureSaved(entry);
          return;
        }
        if (prior === 'different') {
          pendingCapture = null;
          throw new Error('同名ファイルに異なる内容があります。もう一度保存してください。');
        }
      }
      writeAttempted = true;
      const response = await captureRequest(captureUrl(entry), {
        method: 'PUT',
        headers: { ...captureHeaders(currentToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `cockpid workbench: capture ${entry.name}`,
          content: encodeUtf8(`${text}\n`)
        })
      }, CAPTURE_WRITE_TIMEOUT_MS);
      if (!response.ok) throw new Error(`${source.repo} write ${response.status}`);
      captureSaved(entry);
    } catch (error) {
      console.error('capture save', error);
      let state = 'unknown';
      if (writeAttempted) {
        try { state = await captureStoredState(entry, currentToken); }
        catch (verificationError) {
          console.warn('capture verification unavailable', verificationError);
        }
        if (state === 'saved') {
          captureSaved(entry);
          return;
        }
      }
      if (state === 'different') pendingCapture = null;
      captureBtn.textContent = state === 'different' ? '別名で再保存' : '再確認して保存';
      captureStatus(state === 'different'
        ? '同名ファイルに別の内容があります。次の保存では新しい名前を使用します。'
        : `保存結果を確認できません（${error.message}）。文章は保持しました。再試行時は同じ保存先を確認します。`, false);
      window.COCKPID_RESIDENT?.error?.('capture-save');
    } finally {
      captureSaving = false;
      captureBtn.disabled = false;
    }
  }

  captureBtn.addEventListener('click', saveCaptureDirect);
  $w('prevDate')?.addEventListener('click', () => moveCalendar(-1));
  $w('nextDate')?.addEventListener('click', () => moveCalendar(1));
  $w('todayDateBtn')?.addEventListener('click', resetCalendarToday);
  captureText.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      saveCaptureDirect();
    }
  });
  window.addEventListener('cockpid:sources-changed', () => {
    syncSourceHints();
    loadToday();
  });

  selectedDate = jstDateParts();
  syncSourceHints();
  nowParts();
  setInterval(nowParts, 30000);
  setInterval(() => loadToday({ background: true }), 300000);
  loadToday();
})();
