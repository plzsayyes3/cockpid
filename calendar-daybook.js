(() => {
  'use strict';

  const CFG = { repo: 'mynotebook', dir: '02_techo' };
  const $ = (id) => document.getElementById(id);
  const monthCache = new Map();
  const viewContent = $('viewContent');
  const todayContent = $('todayContent');
  const anchorInput = $('anchorDate');
  const sourceStatus = $('sourceStatus');
  let renderSeq = 0;

  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  }
  function textOnly(value) {
    return String(value || '')
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1');
  }

  function jstParts() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
    return { year: get('year'), month: get('month'), day: get('day') };
  }
  function toDate(parts) { return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)); }
  function fromDate(date) { return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }; }
  function dateKey(parts) { return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`; }
  function monthKey(parts) { return `${parts.year}-${pad(parts.month)}`; }
  function addDays(parts, amount) {
    const d = toDate(parts); d.setUTCDate(d.getUTCDate() + amount); return fromDate(d);
  }
  function shiftMonth(parts, amount) {
    const target = new Date(Date.UTC(parts.year, parts.month - 1 + amount, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(parts.day, last));
    return fromDate(target);
  }
  function weekday(parts, long = false) {
    return new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC', weekday: long ? 'long' : 'short' }).format(toDate(parts));
  }
  function formatDate(parts) { return `${parts.month}/${parts.day}(${weekday(parts)})`; }
  function sameDate(a, b) { return dateKey(a) === dateKey(b); }
  function clockMinutes() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
    return get('hour') * 60 + get('minute');
  }

  function parseItem(raw) {
    let text = raw.trim();
    let checked = false;
    let task = false;
    const taskMatch = /^\[([ xX/])\]\s*(.*)$/.exec(text);
    if (taskMatch) {
      task = true;
      checked = /[xX]/.test(taskMatch[1]);
      text = taskMatch[2].trim();
    }
    const timeMatch = /^(\d{1,2}:\d{2})(?:\s*(?:-|–|—|〜|~)\s*(\d{1,2}:\d{2}))?\s+(.*)$/.exec(text);
    if (!timeMatch) return { title: textOnly(text), time: '', start: null, end: null, task, checked };
    const toMinutes = (value) => {
      const [h, m] = value.split(':').map(Number);
      return h * 60 + m;
    };
    const start = toMinutes(timeMatch[1]);
    let end = timeMatch[2] ? toMinutes(timeMatch[2]) : start + 45;
    if (end <= start) end = Math.min(1440, start + 45);
    return {
      title: textOnly(timeMatch[3].trim()),
      time: timeMatch[2] ? `${timeMatch[1]}–${timeMatch[2]}` : timeMatch[1],
      start, end, task, checked
    };
  }

  function parseMonth(markdown, year, month) {
    const days = new Map();
    const monthUndated = [];
    const weekUndated = new Map();
    let currentDay = null;
    let currentWeek = null;
    let section = 'none';
    for (const rawLine of markdown.split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      const weekHeading = /^##\s+week(\d+)\s*$/i.exec(line);
      if (weekHeading) {
        currentDay = null; currentWeek = Number(weekHeading[1]); section = 'week'; continue;
      }
      const dayHeading = /^##\s+(\d{1,2})月(\d{1,2})日(?:\([^)]*\))?\s*$/.exec(line);
      if (dayHeading) {
        const headingMonth = Number(dayHeading[1]);
        currentDay = headingMonth === month ? Number(dayHeading[2]) : null;
        section = currentDay ? 'day' : 'none';
        if (currentDay && !days.has(currentDay)) days.set(currentDay, []);
        continue;
      }
      if (/^###\s+日付未定\s*$/.test(line)) {
        currentDay = null;
        section = currentWeek == null ? 'month-undated' : 'week-undated';
        if (section === 'week-undated' && !weekUndated.has(currentWeek)) weekUndated.set(currentWeek, []);
        continue;
      }
      if (/^#\s+\d{4}年\d{1,2}月\s*$/.test(line)) {
        currentDay = null; currentWeek = null; section = 'none'; continue;
      }
      if (/^#{1,6}\s+/.test(line)) { currentDay = null; section = 'none'; continue; }
      const listMatch = /^\s*-\s+(.*)$/.exec(rawLine);
      if (!listMatch?.[1]?.trim()) continue;
      const item = parseItem(listMatch[1]);
      if (section === 'day' && currentDay) days.get(currentDay).push(item);
      else if (section === 'month-undated') monthUndated.push(item);
      else if (section === 'week-undated' && currentWeek != null) weekUndated.get(currentWeek).push(item);
    }
    return { year, month, days, monthUndated, weekUndated };
  }

  async function loadMonth(parts) {
    const key = monthKey(parts);
    if (monthCache.has(key)) return monthCache.get(key);
    const promise = (async () => {
      const path = `${CFG.dir}/${key}.md`;
      try {
        const payload = await gh(path, CFG.repo);
        if (!payload?.content) return { year: parts.year, month: parts.month, days: new Map(), monthUndated: [], weekUndated: new Map(), missing: true };
        return parseMonth(decode(payload.content), parts.year, parts.month);
      } catch (error) {
        console.error(error);
        return { year: parts.year, month: parts.month, days: new Map(), monthUndated: [], weekUndated: new Map(), error: true };
      }
    })();
    monthCache.set(key, promise);
    return promise;
  }

  async function itemsFor(parts) {
    const data = await loadMonth(parts);
    return data.days.get(parts.day) || [];
  }

  function dayTimelineHtml(parts, items, mode) {
    const allDay = items.filter((item) => item.start == null);
    const timed = items.filter((item) => Number.isFinite(item.start)).sort((a, b) => a.start - b.start);
    const allDayHtml = `
      <div class="all-day-strip">
        <div class="strip-label">ALL DAY</div>
        <div class="strip-items">${allDay.length ? allDay.map((item) => `<div class="strip-item${item.checked ? ' checked' : ''}">${esc(item.title)}</div>`).join('') : '<span class="quiet-empty">—</span>'}</div>
      </div>`;
    const hourHeight = 38;
    const totalHeight = 24 * hourHeight;
    const marks = Array.from({ length: 25 }, (_, hour) => {
      const top = hour * hourHeight;
      return `<div class="day-hour" style="top:${top}px"><span>${pad(hour)}:00</span></div>`;
    }).join('');
    const events = timed.map((item) => {
      const top = Math.round((item.start / 60) * hourHeight);
      const height = Math.max(24, Math.round(((item.end - item.start) / 60) * hourHeight));
      return `<div class="day-event${item.checked ? ' checked' : ''}" style="top:${top}px;height:${height}px" title="${esc(item.time)}">
        <span class="day-event-time">${esc(item.time)}</span><span class="day-event-title">${esc(item.title)}</span>
      </div>`;
    }).join('');
    const today = jstParts();
    const now = sameDate(parts, today) ? clockMinutes() : null;
    const nowHtml = now == null ? '' : `<div class="day-now" style="top:${Math.round((now / 60) * hourHeight)}px"><span>NOW</span></div>`;
    return `${allDayHtml}<div class="day-timeline" data-mode="${mode}" style="height:${totalHeight}px">${marks}<div class="day-track">${events}</div>${nowHtml}</div>`;
  }

  async function renderLeft() {
    const today = jstParts();
    $('todayDateLabel').textContent = `${today.year}.${pad(today.month)}.${pad(today.day)} ${weekday(today)}`;
    if (!token()) {
      todayContent.innerHTML = '<div class="message">GitHub token が必要です。</div>';
      return;
    }
    todayContent.innerHTML = '<div class="message">READING TODAY…</div>';
    const items = await itemsFor(today);
    todayContent.innerHTML = dayTimelineHtml(today, items, 'today');
    requestAnimationFrame(() => {
      const now = clockMinutes();
      todayContent.scrollTop = Math.max(0, (now / 60) * 38 - todayContent.clientHeight * 0.32);
    });
  }

  function weekStart(parts) {
    const d = toDate(parts);
    const offset = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - offset);
    return fromDate(d);
  }

  async function renderWeek(anchor, seq) {
    const start = weekStart(anchor);
    const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const monthKeys = [...new Set(dates.map(monthKey))];
    await Promise.all(monthKeys.map((key) => {
      const [year, month] = key.split('-').map(Number);
      return loadMonth({ year, month, day: 1 });
    }));
    if (seq !== renderSeq) return;
    const today = jstParts();
    const columns = [];
    for (const date of dates) {
      const items = await itemsFor(date);
      columns.push(`<button class="week-day${sameDate(date, today) ? ' is-today' : ''}" data-date="${dateKey(date)}">
        <div class="week-day-head"><span>${weekday(date)}</span><b>${date.month}/${date.day}</b></div>
        <div class="week-items">${items.length ? items.map((item) => `<div class="week-item${item.checked ? ' checked' : ''}"><span>${item.time || 'ALL DAY'}</span>${esc(item.title)}</div>`).join('') : '<div class="week-empty">—</div>'}</div>
      </button>`);
    }
    viewContent.innerHTML = `<div class="week-scroll"><div class="week-grid">${columns.join('')}</div></div>`;
  }

  async function renderMonth(anchor, seq) {
    const data = await loadMonth(anchor);
    if (seq !== renderSeq) return;
    const first = new Date(Date.UTC(anchor.year, anchor.month - 1, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(anchor.year, anchor.month, 0)).getUTCDate();
    const today = jstParts();
    const cells = [];
    for (let i = 0; i < offset; i += 1) cells.push('<div class="month-cell outside"></div>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = { year: anchor.year, month: anchor.month, day };
      const items = data.days.get(day) || [];
      const shown = items.slice(0, 2).map((item) => `<div class="month-item"><span>${item.time || ''}</span>${esc(item.title)}</div>`).join('');
      const more = items.length > 2 ? `<div class="month-more">+${items.length - 2}</div>` : '';
      cells.push(`<button class="month-cell${sameDate(date, today) ? ' is-today' : ''}" data-date="${dateKey(date)}"><b>${day}</b>${shown}${more}</button>`);
    }
    while (cells.length % 7) cells.push('<div class="month-cell outside"></div>');
    viewContent.innerHTML = `<div class="month-scroll"><div class="month-grid"><div class="month-weekday">月</div><div class="month-weekday">火</div><div class="month-weekday">水</div><div class="month-weekday">木</div><div class="month-weekday">金</div><div class="month-weekday">土</div><div class="month-weekday">日</div>${cells.join('')}</div></div>`;
  }

  const state = {
    view: 'day',
    anchor: addDays(jstParts(), 1)
  };

  function syncControls() {
    document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
    anchorInput.value = dateKey(state.anchor);
    const label = $('rightDateLabel');
    if (state.view === 'day') label.textContent = formatDate(state.anchor);
    else if (state.view === 'week') {
      const start = weekStart(state.anchor); const end = addDays(start, 6);
      label.textContent = `${start.month}/${start.day} – ${end.month}/${end.day}`;
    } else label.textContent = `${state.anchor.year}.${pad(state.anchor.month)}`;
  }

  async function renderRight() {
    const seq = ++renderSeq;
    syncControls();
    if (!token()) {
      viewContent.innerHTML = '<div class="message">GitHub token が必要です。</div>';
      sourceStatus.textContent = 'TOKEN REQUIRED';
      return;
    }
    sourceStatus.textContent = 'READING';
    viewContent.innerHTML = '<div class="message">READING VIEW…</div>';
    if (state.view === 'day') {
      const items = await itemsFor(state.anchor);
      if (seq !== renderSeq) return;
      viewContent.innerHTML = dayTimelineHtml(state.anchor, items, 'other');
      requestAnimationFrame(() => { viewContent.scrollTop = 0; });
    } else if (state.view === 'week') {
      await renderWeek(state.anchor, seq);
    } else {
      await renderMonth(state.anchor, seq);
    }
    if (seq === renderSeq) sourceStatus.textContent = 'TECHO LIVE';
  }

  function parseDateInput(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
  }

  function move(amount) {
    if (state.view === 'day') state.anchor = addDays(state.anchor, amount);
    else if (state.view === 'week') state.anchor = addDays(state.anchor, amount * 7);
    else state.anchor = shiftMonth(state.anchor, amount);
    renderRight();
  }

  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
    state.view = button.dataset.view;
    renderRight();
  }));
  $('prevView').addEventListener('click', () => move(-1));
  $('nextView').addEventListener('click', () => move(1));
  anchorInput.addEventListener('change', () => {
    const parsed = parseDateInput(anchorInput.value);
    if (!parsed) return;
    state.anchor = parsed;
    renderRight();
  });
  viewContent.addEventListener('click', (event) => {
    const target = event.target.closest?.('[data-date]');
    if (!target) return;
    const parsed = parseDateInput(target.dataset.date);
    if (!parsed) return;
    state.anchor = parsed;
    state.view = 'day';
    renderRight();
  });

  renderLeft();
  renderRight();
})();
