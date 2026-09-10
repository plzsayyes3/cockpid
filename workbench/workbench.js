(() => {
  const $w = (id) => document.getElementById(id);
  const appWindow = $w('appWindow');
  const appTitle = $w('appTitle');
  const appContent = $w('appContent');
  const todayList = $w('todayList');
  const hintText = $w('hintText');
  const hintSource = $w('hintSource');
  const captureText = $w('captureText');
  const captureBtn = $w('captureBtn');
  const captureHint = document.querySelector('.capture-actions .quiet');
  const pet = $w('pet');
  const petSay = $w('petSay');
  const previewMode = location.pathname.includes('/workbench/');
  const PET_POSITION_KEY = 'cockpid.workbench.pet.position.v1';
  let petTimer = null;
  let petDrag = null;
  let latestHint = '';

  const apps = {
    calendar: { title: '1 / CALENDAR', type: 'iframe', src: previewMode ? '../calendar.html' : 'calendar.html' },
    tasks: { title: '2 / TASKS', type: 'placeholder', text: 'Task workspace is under construction. ここは Techo / TaskChute へ入る作業台になります。' },
    zen: { title: '3 / ZEN', type: 'iframe', src: 'https://plzsayyes3.github.io/zen-note/' },
    news: { title: '4 / NEWS', type: 'placeholder', text: 'News room is under construction. 朝・昼・夜のニュースと、雑多なザッピングをここへ集めます。' },
    system: { title: 'SYSTEM / LEGACY COCKPIT', type: 'iframe', src: previewMode ? '../index.html' : 'system.html' },
    secret: { title: '9 / ???', type: 'game' }
  };

  function nowParts() {
    const parts = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
    }).format(new Date());
    const time = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date());
    $w('todayDate').textContent = parts;
    $w('todayTime').textContent = time;
  }

  function jstDateParts() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    return { year: get('year'), month: get('month'), day: get('day') };
  }

  function inboxStamp() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || '00';
    return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
  }

  function encodeUtf8(value) {
    return btoa(unescape(encodeURIComponent(value)));
  }

  function cleanItem(text) {
    let value = text.trim().replace(/^\[([ xX/])\]\s*/, '');
    const match = /^(\d{1,2}:\d{2})(?:\s*(?:-|–|—|〜|~)\s*(\d{1,2}:\d{2}))?\s+(.*)$/.exec(value);
    if (!match) return { time: '', title: value };
    return { time: match[2] ? `${match[1]}–${match[2]}` : match[1], title: match[3].trim() };
  }

  async function loadToday() {
    if (!token()) {
      todayList.innerHTML = '<div class="empty">GitHub token が必要です。</div>';
      return;
    }
    const t = jstDateParts();
    const path = `02_techo/${t.year}-${String(t.month).padStart(2, '0')}.md`;
    try {
      const payload = await gh(path, 'mynotebook');
      if (!payload?.content) throw new Error('no source');
      const markdown = decode(payload.content);
      const lines = markdown.split(/\r?\n/);
      const heading = new RegExp(`^##\\s+${t.month}月${t.day}日(?:\\([^)]*\\))?\\s*$`);
      let active = false;
      const items = [];
      for (const raw of lines) {
        const line = raw.trimEnd();
        if (heading.test(line)) { active = true; continue; }
        if (active && /^##\s+/.test(line)) break;
        if (!active) continue;
        const m = /^\s*-\s+(.*)$/.exec(raw);
        if (m?.[1]?.trim()) items.push(cleanItem(m[1]));
      }
      if (!items.length) {
        todayList.innerHTML = '<div class="empty">今日の予定はまだありません。</div>';
        return;
      }
      todayList.innerHTML = items.slice(0, 6).map((item) => `
        <div class="list-item">${item.time ? `<span class="time">${esc(item.time)}</span>` : ''}${esc(item.title)}</div>`
      ).join('');
      if (items.length > 6) todayList.insertAdjacentHTML('beforeend', `<div class="empty">ほか ${items.length - 6} 件 → Calendar</div>`);
    } catch (error) {
      console.error(error);
      todayList.innerHTML = '<div class="empty">Techoを読み込めませんでした。</div>';
    }
  }

  async function loadHint() {
    if (!token()) {
      hintText.textContent = 'ここには、過去の記録から拾った思考のヒントが置かれます。';
      hintSource.textContent = 'GitHub token を設定すると自分のデータから表示します。';
      return;
    }
    try {
      const rows = await days('idea', 3);
      const ideas = flattenDays(rows, 'IDEA');
      const item = ideas[0];
      if (!item) throw new Error('no idea');
      latestHint = item.title || item.summary || '';
      hintText.innerHTML = `<span class="hint-mark">“</span>${esc(latestHint)}<span class="hint-mark">”</span>`;
      hintSource.textContent = `${item._date || ''} の記録から`;
    } catch (error) {
      console.error(error);
      hintText.textContent = 'まだ静かです。何か書けば、ここに思考の種が戻ってきます。';
      hintSource.textContent = 'IDEA / WAITING';
    }
  }

  function openApp(name) {
    const app = apps[name];
    if (!app) return;
    appTitle.textContent = app.title;
    if (app.type === 'iframe') {
      appContent.innerHTML = `<iframe src="${app.src}" title="${app.title}"></iframe>`;
    } else if (app.type === 'game') {
      appContent.innerHTML = `<div class="under-construction game"><div><strong>SECRET DESK</strong><p>仕事をしないための場所も、机には必要です。</p><button class="mini-btn" id="fortuneBtn">今日の謎を引く</button><div class="game-result" id="gameResult"></div></div></div>`;
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
    petTimer = setTimeout(() => petSay.classList.remove('show'), 3600);
  }

  function petMessage() {
    const candidates = [
      latestHint ? `これ、まだ気になる？「${latestHint.slice(0, 32)}${latestHint.length > 32 ? '…' : ''}」` : '',
      '分類しなくていいメモは、真ん中に置いておけばいい。',
      '9を押すと、仕事じゃない場所がある。',
      'Calendarは1。Zenは3。覚えたらマウスはいらない。'
    ].filter(Boolean);
    speakPet(candidates[Math.floor(Math.random() * candidates.length)]);
  }

  function captureStatus(message, reset = true) {
    if (!captureHint) return;
    captureHint.textContent = message;
    if (reset) setTimeout(() => { captureHint.textContent = 'Ctrl / ⌘ + Enter で 00_inbox へ直接保存'; }, 2200);
  }

  async function saveCaptureDirect() {
    const text = captureText.value.trim();
    if (!text) {
      captureText.focus();
      return;
    }
    const currentToken = token();
    if (!currentToken) {
      captureStatus('GitHub token が必要です');
      return;
    }

    const name = `${inboxStamp()}.md`;
    const path = `00_inbox/${name}`;
    const originalLabel = captureBtn.textContent;
    captureBtn.disabled = true;
    captureBtn.textContent = '保存中…';
    captureStatus('00_inbox へ保存しています…', false);

    try {
      const response = await fetch(`https://api.github.com/repos/${OWNER}/mynotebook/contents/${path}`, {
        method: 'PUT',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `cockpid workbench: capture ${name}`,
          content: encodeUtf8(`${text}\n`)
        })
      });
      if (!response.ok) throw new Error(`mynotebook write ${response.status}`);
      captureText.value = '';
      captureStatus(`保存しました · ${name}`);
      captureBtn.textContent = '保存済み ✓';
      setTimeout(() => { captureBtn.textContent = originalLabel; }, 1400);
    } catch (error) {
      console.error(error);
      captureStatus(String(error?.message || error));
      captureBtn.textContent = '保存失敗';
      setTimeout(() => { captureBtn.textContent = originalLabel; }, 1800);
    } finally {
      captureBtn.disabled = false;
    }
  }

  function clampPetPosition(x, y) {
    const margin = 8;
    const width = pet.offsetWidth || 80;
    const height = pet.offsetHeight || 90;
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
    const zone = document.querySelector('.pet-zone')?.getBoundingClientRect();
    if (petSay.parentElement !== pet) pet.insertBefore(petSay, pet.firstChild);
    if (pet.parentElement !== document.body) document.body.appendChild(pet);
    Object.assign(pet.style, {
      position: 'fixed',
      zIndex: '45',
      touchAction: 'none',
      cursor: 'grab'
    });
    try {
      const saved = JSON.parse(localStorage.getItem(PET_POSITION_KEY) || 'null');
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        setPetPosition(saved.x, saved.y);
        return;
      }
    } catch (_) {}
    if (zone) setPetPosition(zone.right - (pet.offsetWidth || 80) - 20, zone.bottom - (pet.offsetHeight || 90) - 18);
  }

  function endPetDrag(event) {
    if (!petDrag || event.pointerId !== petDrag.id) return;
    const moved = petDrag.moved;
    try { pet.releasePointerCapture(event.pointerId); } catch (_) {}
    pet.classList.remove('dragging');
    pet.style.cursor = 'grab';
    const rect = pet.getBoundingClientRect();
    if (moved) setPetPosition(rect.left, rect.top, true);
    else petMessage();
    petDrag = null;
  }

  pet.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = pet.getBoundingClientRect();
    petDrag = {
      id: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    pet.setPointerCapture(event.pointerId);
    pet.classList.add('dragging');
    pet.style.cursor = 'grabbing';
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
  captureText.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      saveCaptureDirect();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && appWindow.classList.contains('open')) return closeApp();
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    const map = { '1': 'calendar', '2': 'tasks', '3': 'zen', '4': 'news', '9': 'secret' };
    if (map[event.key]) openApp(map[event.key]);
  });
  window.addEventListener('resize', () => {
    const rect = pet.getBoundingClientRect();
    setPetPosition(rect.left, rect.top, true);
  });

  if (captureHint) captureHint.textContent = 'Ctrl / ⌘ + Enter で 00_inbox へ直接保存';
  nowParts();
  setInterval(nowParts, 1000);
  loadToday();
  loadHint();
  requestAnimationFrame(restorePetPosition);
  setTimeout(() => speakPet('好きな場所に動かせます。'), 900);
})();
