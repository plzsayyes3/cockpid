const CALENDAR_CFG = { repo: 'mynotebook', dir: '02_techo', ref: 'main' };

const state = {
  year: jstParts().year,
  month: jstParts().month,
  loading: false
};

const byId = (id) => document.getElementById(id);

function pad(n) {
  return String(n).padStart(2, '0');
}

function jstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function monthKey(year = state.year, month = state.month) {
  return `${year}-${pad(month)}`;
}

function sourcePath(year = state.year, month = state.month) {
  return `${CALENDAR_CFG.dir}/${monthKey(year, month)}.md`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function displayText(value) {
  return String(value || '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1');
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
  if (!timeMatch) {
    return { title: displayText(text), time: '', task, checked };
  }

  return {
    title: displayText(timeMatch[3].trim()),
    time: timeMatch[2] ? `${timeMatch[1]}–${timeMatch[2]}` : timeMatch[1],
    task,
    checked
  };
}

function parseTechoMarkdown(markdown, year, month) {
  const days = new Map();
  const monthUndated = [];
  const weekUndated = new Map();
  let currentDay = null;
  let currentWeek = null;
  let section = 'none';

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd();

    const monthHeading = /^#\s+(\d{4})年(\d{1,2})月\s*$/.exec(line);
    if (monthHeading) {
      currentDay = null;
      currentWeek = null;
      section = 'none';
      continue;
    }

    const weekHeading = /^##\s+week(\d+)\s*$/i.exec(line);
    if (weekHeading) {
      currentDay = null;
      currentWeek = Number(weekHeading[1]);
      section = 'week';
      continue;
    }

    const dayHeading = /^##\s+(\d{1,2})月(\d{1,2})日(?:\([^)]*\))?\s*$/.exec(line);
    if (dayHeading) {
      const headingMonth = Number(dayHeading[1]);
      const day = Number(dayHeading[2]);
      currentDay = headingMonth === month ? day : null;
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

    if (/^#{1,6}\s+/.test(line)) {
      currentDay = null;
      section = 'none';
      continue;
    }

    const listMatch = /^\s*-\s+(.*)$/.exec(rawLine);
    if (!listMatch || !listMatch[1].trim()) continue;

    if (section === 'day' && currentDay) {
      days.get(currentDay).push(parseItem(listMatch[1]));
    } else if (section === 'month-undated') {
      monthUndated.push(parseItem(listMatch[1]));
    } else if (section === 'week-undated' && currentWeek != null) {
      weekUndated.get(currentWeek).push(parseItem(listMatch[1]));
    }
  }

  return { year, month, days, monthUndated, weekUndated };
}

async function fetchMonthMarkdown(year, month) {
  const path = sourcePath(year, month);
  const payload = await gh(path, CALENDAR_CFG.repo);
  if (!payload) throw new Error(`SOURCE_NOT_FOUND:${path}`);
  if (!payload.content) throw new Error(`SOURCE_EMPTY:${path}`);
  return decode(payload.content);
}

function setStatus(kind, title, detail) {
  const led = byId('statusLed');
  const titleEl = byId('statusTitle');
  const detailEl = byId('statusDetail');
  led.classList.toggle('warn', kind !== 'ok');
  led.classList.toggle('loading', kind === 'loading');
  titleEl.textContent = title;
  detailEl.textContent = detail || '';
}

function renderMonthHeader() {
  byId('monthTitle').textContent = `${state.year}年${state.month}月`;
  const path = sourcePath();
  byId('sourcePath').textContent = `${CALENDAR_CFG.repo}/${path}`;
  byId('sourceLink').href = `https://github.com/${OWNER}/${CALENDAR_CFG.repo}/blob/${CALENDAR_CFG.ref}/${path}`;
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function itemAttrs(item) {
  if (!item.time) return '';
  return ` data-time="${escapeHtml(item.time)}" title="${escapeHtml(item.time)}" tabindex="0"`;
}

function renderEvent(item, className = 'event') {
  return `
    <div class="${className}${item.checked ? ' checked' : ''}${item.task ? ' task' : ''}"${itemAttrs(item)}>
      <span class="event-title">${escapeHtml(item.title)}</span>
    </div>`;
}

function renderWeekUndated(items, week) {
  const content = items.length ? items.map((item) => renderEvent(item, 'week-undated-item')).join('') : '';
  return `
    <aside class="week-undated-cell${items.length ? ' has-items' : ''}" aria-label="week${week} 日付未定">
      <div class="week-undated-label">week${week}<span>日付未定</span></div>
      <div class="week-undated-items">${content}</div>
    </aside>`;
}

function renderCalendar(data) {
  renderMonthHeader();
  renderUndated(data.monthUndated);

  const grid = byId('calendarGrid');
  const today = jstParts();
  const firstDow = new Date(Date.UTC(state.year, state.month - 1, 1)).getUTCDay();
  const offset = (firstDow + 6) % 7;
  const daysInMonth = new Date(Date.UTC(state.year, state.month, 0)).getUTCDate();
  const totalDayCells = Math.ceil((offset + daysInMonth) / 7) * 7;
  const rows = totalDayCells / 7;
  const gridStart = new Date(Date.UTC(state.year, state.month - 1, 1 - offset));
  const cells = [];

  for (let row = 0; row < rows; row += 1) {
    const monday = new Date(gridStart);
    monday.setUTCDate(gridStart.getUTCDate() + row * 7);
    const week = isoWeek(monday);
    cells.push(renderWeekUndated(data.weekUndated.get(week) || [], week));

    for (let col = 0; col < 7; col += 1) {
      const index = row * 7 + col;
      const day = index - offset + 1;
      if (day < 1 || day > daysInMonth) {
        cells.push('<div class="day-cell empty" aria-hidden="true"></div>');
        continue;
      }

      const items = data.days.get(day) || [];
      const isToday = today.year === state.year && today.month === state.month && today.day === day;
      const events = items.length ? items.map((item) => renderEvent(item)).join('') : '';

      cells.push(`
        <section class="day-cell${isToday ? ' today' : ''}" aria-label="${state.month}月${day}日">
          <div class="day-number">${day}${isToday ? '<span class="today-label">TODAY</span>' : ''}</div>
          <div class="events">${events}</div>
        </section>`);
    }
  }

  grid.innerHTML = cells.join('');
}

function renderUndated(items) {
  const section = byId('undatedSection');
  const list = byId('undatedList');
  if (!items.length) {
    section.hidden = true;
    list.innerHTML = '';
    return;
  }

  section.hidden = false;
  list.innerHTML = items.map((item) => renderEvent(item, 'undated-item')).join('');
}

function renderEmpty(message) {
  byId('calendarGrid').innerHTML = `<div class="calendar-message">${escapeHtml(message)}</div>`;
  byId('undatedSection').hidden = true;
}

async function loadMonth() {
  if (state.loading) return;
  state.loading = true;
  renderMonthHeader();

  if (!token()) {
    setStatus('warn', 'TOKEN REQUIRED', 'COCKPIDの接続設定でGitHub tokenを保存してください');
    renderEmpty('GitHub token がありません。index.html の「接続設定」から既存 token を保存してください。');
    state.loading = false;
    return;
  }

  setStatus('loading', 'READING TECHO', sourcePath());

  try {
    const markdown = await fetchMonthMarkdown(state.year, state.month);
    const parsed = parseTechoMarkdown(markdown, state.year, state.month);
    renderCalendar(parsed);
    const dayCount = [...parsed.days.values()].reduce((sum, items) => sum + items.length, 0);
    const weekUndatedCount = [...parsed.weekUndated.values()].reduce((sum, items) => sum + items.length, 0);
    setStatus('ok', 'SOURCE LIVE', `${sourcePath()} · ${dayCount + parsed.monthUndated.length + weekUndatedCount} items`);
  } catch (error) {
    console.error(error);
    const message = String(error?.message || error);
    if (message.startsWith('SOURCE_NOT_FOUND:')) {
      setStatus('warn', 'SOURCE NOT FOUND', `${sourcePath()} または token の repo 権限を確認`);
      renderEmpty(`${sourcePath()} を取得できません。月ファイルが未作成か、token に mynotebook の Contents: Read 権限がありません。`);
    } else {
      setStatus('warn', 'READ ERROR', message);
      renderEmpty('Techo Markdown の取得に失敗しました。');
    }
  } finally {
    state.loading = false;
  }
}

function moveMonth(delta) {
  const next = new Date(Date.UTC(state.year, state.month - 1 + delta, 1));
  state.year = next.getUTCFullYear();
  state.month = next.getUTCMonth() + 1;
  loadMonth();
}

byId('prevMonth').addEventListener('click', () => moveMonth(-1));
byId('nextMonth').addEventListener('click', () => moveMonth(1));
byId('todayBtn').addEventListener('click', () => {
  const today = jstParts();
  state.year = today.year;
  state.month = today.month;
  loadMonth();
});

loadMonth();
