(() => {
  'use strict';

  const $w = (id) => document.getElementById(id);
  const todayList = $w('todayList');
  const captureText = $w('captureText');
  const captureBtn = $w('captureBtn');
  const captureHint = document.querySelector('.capture-actions .quiet');
  let selectedDate = null;
  let calendarLoadSeq = 0;

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
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || '00';
    return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
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

  function renderTodayTimeline(items, day) {
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
    if (!background) todayList.innerHTML = '<div class="empty">Techoを読んでいます…</div>';
    try {
      const payload = await gh(`02_techo/${target.year}-${String(target.month).padStart(2, '0')}.md`, 'mynotebook');
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

  function captureStatus(message, reset = true) {
    if (!captureHint) return;
    captureHint.textContent = message;
    if (reset) setTimeout(() => { captureHint.textContent = 'Ctrl / ⌘ + Enter で 00_inbox へ直接保存'; }, 2200);
  }

  async function saveCaptureDirect() {
    const text = captureText.value.trim();
    if (!text) return captureText.focus();
    const currentToken = token();
    if (!currentToken) return captureStatus('GitHub token が必要です');

    const name = `${inboxStamp()}.md`;
    const path = `00_inbox/${name}`;
    const originalLabel = captureBtn.textContent;
    captureBtn.disabled = true;
    captureBtn.textContent = '保存中…';
    captureStatus('00_inbox へ保存しています…', false);
    try {
      const response = await fetch(`https://api.github.com/repos/${OWNER}/mynotebook/contents/${path}`, {
        method: 'PUT',
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `cockpid workbench: capture ${name}`, content: encodeUtf8(`${text}\n`) })
      });
      if (!response.ok) throw new Error(`mynotebook write ${response.status}`);
      captureText.value = '';
      captureBtn.textContent = '保存済み ✓';
      captureStatus(`保存しました · ${name}`);
      setTimeout(() => { captureBtn.textContent = originalLabel; }, 1400);
    } catch (error) {
      console.error(error);
      captureBtn.textContent = '保存失敗';
      captureStatus(String(error?.message || error));
      setTimeout(() => { captureBtn.textContent = originalLabel; }, 1800);
    } finally {
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

  selectedDate = jstDateParts();
  nowParts();
  setInterval(nowParts, 30000);
  setInterval(() => loadToday({ background: true }), 300000);
  loadToday();
})();
