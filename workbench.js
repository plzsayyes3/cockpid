(() => {
  const $w = (id) => document.getElementById(id);
  const appWindow = $w('appWindow');
  const appTitle = $w('appTitle');
  const appContent = $w('appContent');
  const todayList = $w('todayList');
  const hintText = $w('hintText');
  const hintSource = $w('hintSource');
  const captureText = $w('captureText');
  const petSay = $w('petSay');
  let petTimer = null;
  let latestHint = '';

  const apps = {
    calendar: { title: '1 / CALENDAR', type: 'iframe', src: 'calendar.html' },
    tasks: { title: '2 / TASKS', type: 'placeholder', text: 'Task workspace is under construction. ここは Techo / TaskChute へ入る作業台になります。' },
    zen: { title: '3 / ZEN', type: 'iframe', src: 'https://plzsayyes3.github.io/zen-note/' },
    news: { title: '4 / NEWS', type: 'placeholder', text: 'News room is under construction. 朝・昼・夜のニュースと、雑多なザッピングをここへ集めます。' },
    system: { title: 'SYSTEM / LEGACY COCKPIT', type: 'iframe', src: 'system.html' },
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

  function stageCapture() {
    const text = captureText.value.trim();
    if (!text) {
      captureText.focus();
      return;
    }
    $w('memoText').value = text;
    $w('memoOpen').click();
  }

  document.querySelectorAll('[data-app]').forEach((button) => button.addEventListener('click', () => openApp(button.dataset.app)));
  $w('appClose').addEventListener('click', closeApp);
  $w('captureBtn').addEventListener('click', stageCapture);
  $w('pet').addEventListener('click', petMessage);
  $w('systemOpen').addEventListener('click', () => openApp('system'));
  captureText.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      stageCapture();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && appWindow.classList.contains('open')) return closeApp();
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    const map = { '1': 'calendar', '2': 'tasks', '3': 'zen', '4': 'news', '9': 'secret' };
    if (map[event.key]) openApp(map[event.key]);
  });

  nowParts();
  setInterval(nowParts, 1000);
  loadToday();
  loadHint();
  setTimeout(() => speakPet('工事中。とりあえず机として使えます。'), 900);
})();
