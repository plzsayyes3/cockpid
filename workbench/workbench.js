(() => {
  const $w = (id) => document.getElementById(id);
  const appWindow = $w('appWindow');
  const appTitle = $w('appTitle');
  const appContent = $w('appContent');
  const todayList = $w('todayList');
  const captureText = $w('captureText');
  const captureBtn = $w('captureBtn');
  const captureHint = document.querySelector('.capture-actions .quiet');
  const pet = $w('pet');
  const petSay = $w('petSay');
  const previewMode = location.pathname.includes('/workbench/');
  const PET_POSITION_KEY = 'cockpid.workbench.pet.position.v1';
  let latestHint = '';
  let petTimer = null;
  let petDrag = null;
  let selectedDate = null;
  let calendarLoadSeq = 0;

  const apps = {
    calendar: { title: '1 / CALENDAR', type: 'iframe', src: previewMode ? '../calendar.html' : 'calendar.html' },
    tasks: { title: '2 / TASKS', type: 'placeholder', text: 'Task workspace is under construction.' },
    zen: { title: '3 / ZEN', type: 'iframe', src: 'https://plzsayyes3.github.io/zen-note/' },
    news: { title: '4 / NEWS', type: 'placeholder', text: 'News room is under construction.' },
    advice: { title: '5 / AI ADVICE', type: 'iframe', src: 'advice.html' },
    system: { title: 'SYSTEM / LEGACY COCKPIT', type: 'iframe', src: previewMode ? '../index.html' : 'system.html' },
    secret: { title: '9 / ???', type: 'game' }
  };

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
    const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  function dateRelation(parts) {
    return dateKey(parts).localeCompare(jstDateKey());
  }

  function updateSelectedDateLabel() {
    const button = $w('todayDateBtn');
    if (!button || !selectedDate) return;
    const d = new Date(Date.UTC(selectedDate.year, selectedDate.month - 1, selectedDate.day));
    const weekday = new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC', weekday: 'short' }).format(d);
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
    const t = selectedDate;
    if (!background) todayList.innerHTML = '<div class="empty">Techoを読んでいます…</div>';
    try {
      const payload = await gh(`02_techo/${t.year}-${String(t.month).padStart(2, '0')}.md`, 'mynotebook');
      if (seq !== calendarLoadSeq) return;
      if (!payload?.content) throw new Error('no source');
      const lines = decode(payload.content).split(/\r?\n/);
      const heading = new RegExp(`^##\\s+${t.month}月${t.day}日(?:\\([^)]*\\))?\\s*$`);
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
      renderTodayTimeline(items, t);
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

  async function loadPetHint() {
    const currentToken = token();
    if (!currentToken) return;
    try {
      const response = await fetch(`https://api.github.com/repos/${OWNER}/my-storage-note/contents/extracted/idea?ref=main`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${currentToken}`
        }
      });
      if (!response.ok) throw new Error(`idea index ${response.status}`);
      const entries = await response.json();
      const todayName = `${jstDateKey()}.json`;
      const latest = (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry.type === 'file' && /^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name) && entry.name <= todayName)
        .sort((a, b) => b.name.localeCompare(a.name))[0];
      if (!latest) return;

      const payload = await gh(latest.path, 'my-storage-note');
      if (!payload?.content) return;
      const data = JSON.parse(decode(payload.content));
      const item = Array.isArray(data?.items) ? data.items[0] : null;
      latestHint = item?.title || item?.summary || '';
    } catch (error) {
      console.error(error);
    }
  }

  function openApp(name) {
    const app = apps[name];
    if (!app) return;
    appTitle.textContent = app.title;
    if (app.type === 'iframe') {
      appContent.innerHTML = `<iframe src="${app.src}" title="${app.title}"></iframe>`;
    } else if (app.type === 'game') {
      appContent.innerHTML = '<div class="under-construction"><div><strong>SECRET DESK</strong><p>仕事をしないための場所。</p><button class="ghost-btn" id="fortuneBtn">今日の謎を引く</button><div class="game-result" id="gameResult"></div></div></div>';
      $w('fortuneBtn').addEventListener('click', () => {
        const lines = ['5分だけ遠回りする。', '昔のノートを1ページだけ開く。', '今日は効率を1つ捨てる。', 'いちばんくだらない案を残す。', '机の上の物を1つだけ動かす。'];
        $w('gameResult').textContent = lines[Math.floor(Math.random() * lines.length)];
      });
    } else {
      appContent.innerHTML = `<div class="under-construction"><div><strong>UNDER CONSTRUCTION</strong><p>${app.text}</p></div></div>`;
    }
    appWindow.classList.add('open');
    appWindow.setAttribute('aria-hidden', 'false');
  }

  function closeApp() {
    appWindow.classList.remove('open');
    appWindow.setAttribute('aria-hidden', 'true');
    appContent.innerHTML = '';
  }

  function speakPet(message) {
    petSay.textContent = message;
    petSay.classList.add('show');
    clearTimeout(petTimer);
    petTimer = setTimeout(() => petSay.classList.remove('show'), 5200);
  }

  function petMessage() {
    if (latestHint) {
      speakPet(`これ、まだ気になる？ 「${latestHint.slice(0, 100)}${latestHint.length > 100 ? '…' : ''}」`);
      return;
    }
    speakPet('まだ静か。書いたものがたまったら、ここから何か持ってくる。');
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

  function clampPetPosition(x, y) {
    const margin = 8;
    const width = pet.offsetWidth || 72;
    const height = pet.offsetHeight || 82;
    return {
      x: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - width - margin)),
      y: Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - height - margin))
    };
  }

  function setPetPosition(x, y, remember = false) {
    const pos = clampPetPosition(x, y);
    pet.style.left = `${pos.x}px`;
    pet.style.top = `${pos.y}px`;
    pet.style.right = 'auto';
    pet.style.bottom = 'auto';
    if (remember) localStorage.setItem(PET_POSITION_KEY, JSON.stringify(pos));
  }

  function restorePetPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(PET_POSITION_KEY) || 'null');
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) setPetPosition(saved.x, saved.y);
    } catch (_) {}
  }

  function endPetDrag(event) {
    if (!petDrag || event.pointerId !== petDrag.id) return;
    const moved = petDrag.moved;
    try { pet.releasePointerCapture(event.pointerId); } catch (_) {}
    pet.classList.remove('dragging');
    const rect = pet.getBoundingClientRect();
    if (moved) setPetPosition(rect.left, rect.top, true);
    else petMessage();
    petDrag = null;
  }

  pet.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = pet.getBoundingClientRect();
    petDrag = { id: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, startX: event.clientX, startY: event.clientY, moved: false };
    pet.setPointerCapture(event.pointerId);
    pet.classList.add('dragging');
    event.preventDefault();
  });
  pet.addEventListener('pointermove', (event) => {
    if (!petDrag || event.pointerId !== petDrag.id) return;
    if (Math.hypot(event.clientX - petDrag.startX, event.clientY - petDrag.startY) > 4) petDrag.moved = true;
    setPetPosition(event.clientX - petDrag.offsetX, event.clientY - petDrag.offsetY);
  });
  pet.addEventListener('pointerup', endPetDrag);
  pet.addEventListener('pointercancel', endPetDrag);

  document.querySelectorAll('[data-app]').forEach((button) => button.addEventListener('click', () => openApp(button.dataset.app)));
  $w('appClose').addEventListener('click', closeApp);
  captureBtn.addEventListener('click', saveCaptureDirect);
  $w('systemOpen').addEventListener('click', () => openApp('system'));
  $w('prevDate').addEventListener('click', () => moveCalendar(-1));
  $w('nextDate').addEventListener('click', () => moveCalendar(1));
  $w('todayDateBtn').addEventListener('click', resetCalendarToday);
  captureText.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); saveCaptureDirect(); }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && appWindow.classList.contains('open')) return closeApp();
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    const map = { '1': 'calendar', '2': 'tasks', '3': 'zen', '4': 'news', '5': 'advice', '9': 'secret' };
    if (map[event.key]) openApp(map[event.key]);
  });
  window.addEventListener('resize', () => {
    if (pet.style.left) {
      const rect = pet.getBoundingClientRect();
      setPetPosition(rect.left, rect.top, true);
    }
  });

  selectedDate = jstDateParts();
  nowParts();
  setInterval(nowParts, 30000);
  setInterval(() => {
    if (selectedDate) loadToday({ background: true });
  }, 300000);
  loadToday();
  loadPetHint();
  restorePetPosition();
})();