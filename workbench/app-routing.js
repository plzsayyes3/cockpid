(() => {
  'use strict';

  const appWindow = document.getElementById('appWindow');
  const appTitle = document.getElementById('appTitle');
  const appContent = document.getElementById('appContent');
  if (!appWindow || !appTitle || !appContent) return;

  const apps = Object.freeze({
    calendar: { key: '1', title: '1 / CALENDAR', type: 'iframe', src: 'calendar.html' },
    tasks: { key: '2', title: '2 / TASKS', type: 'iframe', src: 'taskliner-bridge.html?v=20260918-main-branch2' },
    zen: { key: '3', title: '3 / ZEN', type: 'iframe', src: 'https://plzsayyes3.github.io/zen-note/' },
    news: { key: '4', title: '4 / NEWS', type: 'iframe', src: 'https://plzsayyes3.github.io/My_Internet_place/' },
    advice: { key: null, title: 'AI ADVICE', type: 'iframe', src: 'advice.html' },
    onhand: { key: '5', title: '5 / ON HAND', type: 'iframe', src: 'onhand.html' },
    thinking: { key: '8', title: '8 / THINKING', type: 'iframe', src: 'thinking.html?v=20260918-thinking1' },
    dictionary: { key: '6', title: '6 / DICTIONARY', type: 'dictionary' },
    board: { key: null, title: 'BOARD', type: 'board' },
    backstage: { key: '7', title: '7 / PROJECTS', type: 'iframe', src: 'backstage.html?v=20260920-project-town-visible1' },
    projecttown: { key: null, title: 'PROJECT TOWN', type: 'iframe', src: 'project-town.html' },
    keyboard: { key: '9', title: '9 / KEYBOARD', type: 'page', src: 'keyboard.html' },
    stan: { key: null, title: 'STAN', type: 'page', src: 'stan/' },
    secret: { key: '0', title: '0 / ???', type: 'game' }
  });

  const keyToApp = Object.freeze(Object.fromEntries(
    Object.entries(apps)
      .filter(([, app]) => app.key)
      .map(([name, app]) => [app.key, name])
  ));

  function dockButton(key) {
    return [...document.querySelectorAll('.dock .app-btn')]
      .find((button) => button.querySelector('b')?.textContent?.trim() === String(key));
  }

  function rebuildDockTail() {
    const dock = document.querySelector('.dock');
    if (!dock) return;

    const tailKeys = new Set(['5', '6', '7', '8', '9']);
    [...dock.querySelectorAll('.app-btn')].forEach((button) => {
      const key = button.querySelector('b')?.textContent?.trim();
      if (tailKeys.has(key)) button.remove();
    });

    const zero = dockButton('0');
    const entries = [
      ['5', 'onhand', 'On Hand'],
      ['6', 'dictionary', 'Dictionary'],
      ['7', 'backstage', 'Projects'],
      ['8', 'thinking', 'Thinking'],
      ['9', 'keyboard', 'Keyboard']
    ];

    entries.forEach(([key, appName, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'app-btn';
      button.dataset.app = appName;
      button.setAttribute('aria-label', label);
      button.innerHTML = `<b>${key}</b><span>${label}</span>`;
      if (zero) dock.insertBefore(button, zero);
      else dock.appendChild(button);
    });
  }

  rebuildDockTail();

  let boardLoader = null;
  let dictionaryLoader = null;
  function ensureBoardModule() {
    if (window.COCKPID_BOARD?.render) return Promise.resolve(window.COCKPID_BOARD);
    if (boardLoader) return boardLoader;

    boardLoader = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-cockpid-board]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'board.css';
        link.dataset.cockpidBoard = 'true';
        document.head.appendChild(link);
      }

      const script = document.createElement('script');
      script.src = 'board.js';
      script.async = true;
      script.onload = () => window.COCKPID_BOARD?.render ? resolve(window.COCKPID_BOARD) : reject(new Error('BOARD module unavailable'));
      script.onerror = () => reject(new Error('board.js load failed'));
      document.head.appendChild(script);
    });
    return boardLoader;
  }

  async function renderBoard() {
    appContent.innerHTML = '<div class="under-construction"><div><strong>BOARD</strong><p>共有掲示板を読み込んでいます…</p></div></div>';
    try {
      const board = await ensureBoardModule();
      await board.render(appContent);
    } catch (error) {
      console.error(error);
      appContent.innerHTML = '<div class="under-construction"><div><strong>BOARD UNAVAILABLE</strong><p>共有掲示板を読み込めませんでした。</p></div></div>';
    }
  }

  function ensureDictionaryModule() {
    if (window.COCKPID_DICTIONARY?.render) return Promise.resolve(window.COCKPID_DICTIONARY);
    if (dictionaryLoader) return dictionaryLoader;

    dictionaryLoader = new Promise((resolve, reject) => {
      if (!document.querySelector('script[data-cockpid-dictionary-model]')) {
        const model = document.createElement('script');
        model.src = 'dictionary-model.js';
        model.dataset.cockpidDictionaryModel = 'true';
        document.head.appendChild(model);
        model.onerror = () => reject(new Error('dictionary-model.js load failed'));
        model.onload = () => loadDictionaryModule(resolve, reject);
      } else {
        loadDictionaryModule(resolve, reject);
      }
    });
    return dictionaryLoader;
  }

  function loadDictionaryModule(resolve, reject) {
    if (!document.querySelector('link[data-cockpid-dictionary]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'dictionary.css';
      link.dataset.cockpidDictionary = 'true';
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = 'dictionary.js';
    script.async = true;
    script.onload = () => window.COCKPID_DICTIONARY?.render
      ? resolve(window.COCKPID_DICTIONARY)
      : reject(new Error('DICTIONARY module unavailable'));
    script.onerror = () => reject(new Error('dictionary.js load failed'));
    document.head.appendChild(script);
  }

  async function renderDictionary() {
    appContent.innerHTML = '<div class="dictionary-view"><div class="dictionary-loading">DICTIONARYを読み込んでいます…</div></div>';
    try {
      const dictionary = await ensureDictionaryModule();
      await dictionary.render(appContent);
    } catch (error) {
      console.error(error);
      appContent.innerHTML = '<div class="dictionary-view"><div class="dictionary-error"><strong>DICTIONARY UNAVAILABLE</strong><p>辞書画面を読み込めませんでした。</p></div></div>';
    }
  }

  function openApp(name) {
    const app = apps[name];
    if (!app) return false;

    if (app.type === 'page') {
      window.location.assign(app.src);
      return true;
    }

    appTitle.textContent = app.title;
    if (app.type === 'iframe') {
      appContent.innerHTML = `<iframe src="${app.src}" title="${app.title}"></iframe>`;
    } else if (app.type === 'board') {
      renderBoard();
    } else if (app.type === 'dictionary') {
      renderDictionary();
    } else if (app.type === 'game') {
      appContent.innerHTML = '<div class="under-construction"><div><strong>SECRET DESK</strong><p>仕事をしないための場所。</p><button class="ghost-btn" id="fortuneBtn">今日の謎を引く</button><div class="game-result" id="gameResult"></div></div></div>';
      const button = document.getElementById('fortuneBtn');
      button?.addEventListener('click', () => {
        const lines = ['5分だけ遠回りする。', '昔のノートを1ページだけ開く。', '今日は効率を1つ捨てる。', 'いちばんくだらない案を残す。', '机の上の物を1つだけ動かす。'];
        const result = document.getElementById('gameResult');
        if (result) result.textContent = lines[Math.floor(Math.random() * lines.length)];
      });
    } else {
      appContent.innerHTML = `<div class="under-construction"><div><strong>UNDER CONSTRUCTION</strong><p>${app.text || ''}</p></div></div>`;
    }

    appWindow.classList.add('open');
    appWindow.setAttribute('aria-hidden', 'false');
    return true;
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-app]');
    if (!button || button.disabled) return;
    const name = button.dataset.app;
    if (!apps[name]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openApp(name);
  }, true);

  document.addEventListener('keydown', (event) => {
    const active = document.activeElement;
    if (/INPUT|TEXTAREA|SELECT/.test(active?.tagName || '') || active?.isContentEditable) return;
    if (document.getElementById('tokenModal')?.classList.contains('open')) return;
    if (document.getElementById('drawer')?.classList.contains('open')) return;
    const name = keyToApp[event.key];
    if (!name) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openApp(name);
  }, true);

  window.COCKPID_ROUTER = Object.freeze({ apps, openApp });
})();
