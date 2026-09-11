(() => {
  'use strict';

  const appWindow = document.getElementById('appWindow');
  const appTitle = document.getElementById('appTitle');
  const appContent = document.getElementById('appContent');
  if (!appWindow || !appTitle || !appContent) return;

  const apps = Object.freeze({
    slot0: { key: '0', title: '0 / OPEN', type: 'placeholder', text: 'This slot is open.' },
    calendar: { key: '1', title: '1 / CALENDAR', type: 'iframe', src: 'calendar.html' },
    tasks: { key: '2', title: '2 / TASKS', type: 'iframe', src: 'https://plzsayyes3.github.io/taskliner_taskchute-line/' },
    zen: { key: '3', title: '3 / ZEN', type: 'iframe', src: 'https://plzsayyes3.github.io/zen-note/' },
    news: { key: '4', title: '4 / NEWS', type: 'iframe', src: 'https://plzsayyes3.github.io/My_Internet_place/' },
    advice: { key: '5', title: '5 / AI ADVICE', type: 'iframe', src: 'advice.html' },
    onhand: { key: '6', title: '6 / ON HAND', type: 'iframe', src: 'onhand.html' },
    board: { key: '7', title: '7 / BOARD', type: 'board' },
    backstage: { key: '8', title: '8 / BACKSTAGE', type: 'iframe', src: 'backstage.html' },
    secret: { key: '9', title: '9 / ???', type: 'game' }
  });

  const keyToApp = Object.freeze(Object.fromEntries(
    Object.entries(apps).map(([name, app]) => [app.key, name])
  ));

  function dockButton(key) {
    return [...document.querySelectorAll('.dock .app-btn')]
      .find((button) => button.querySelector('b')?.textContent?.trim() === String(key));
  }

  function configureDockButton(key, appName, label) {
    let button = dockButton(key);
    if (!button) {
      button = document.createElement('button');
      button.className = 'app-btn';
      button.innerHTML = `<b>${key}</b><span></span>`;
      const secret = dockButton('9');
      secret?.parentNode?.insertBefore(button, secret);
    }
    if (!button) return;
    button.disabled = false;
    button.classList.remove('app-slot');
    button.dataset.app = appName;
    button.setAttribute('aria-label', label);
    const text = button.querySelector('span');
    if (text) text.textContent = label;
  }

  configureDockButton('7', 'board', 'Board');
  configureDockButton('8', 'backstage', 'Backstage');

  let boardLoader = null;
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

  function openApp(name) {
    const app = apps[name];
    if (!app) return false;

    appTitle.textContent = app.title;
    if (app.type === 'iframe') {
      appContent.innerHTML = `<iframe src="${app.src}" title="${app.title}"></iframe>`;
    } else if (app.type === 'board') {
      renderBoard();
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
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    const name = keyToApp[event.key];
    if (!name) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openApp(name);
  }, true);

  window.COCKPID_ROUTER = Object.freeze({ apps, openApp });
})();
