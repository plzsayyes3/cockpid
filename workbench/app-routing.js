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
    dictionary: { key: '9', title: '9 / DICTIONARY', type: 'dictionary' },
    board: { key: null, title: 'BOARD', type: 'board' },
    backstage: { key: '6', title: '6 / PROJECT · ASSIGNMENT', type: 'iframe', src: 'backstage.html?v=20260924-pj-assign1' },
    projecttown: { key: null, title: 'PROJECT TOWN', type: 'iframe', src: 'project-town.html' },
    keyboard: { key: null, title: 'KEYBOARD', type: 'iframe', src: 'https://plzsayyes3.github.io/Keyboard/?v=c83f529' },
    stan: { key: null, title: 'STAN', type: 'page', src: 'stan/' },
    formysons: { key: '0', title: '0 / FOR MY SONS', type: 'iframe', src: 'https://plzsayyes3.github.io/for_my_sons/' }
  });


  const dockIcons = Object.freeze({
    calendar: '<svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M7 3.5v3M17 3.5v3M3.5 9h17M8 13h2M14 13h2M8 17h2"/></svg>',
    tasks: '<svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l2.3 2.3L16 8.8"/></svg>',
    zen: '<svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h10l4 4V20H5zM15 4.5V9h4"/><path d="M8 16l6.8-6.8 1.8 1.8L9.8 17.8 7 18.5z"/></svg>',
    news: '<svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h11v14H5zM16 8h3v9a2 2 0 0 1-2 2h-1M8 9h5M8 12h5M8 15h3"/></svg>',
    onhand: '<svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3.5" width="10" height="9" rx="2"/><path d="M3.5 15.5h4l2-1.5h4.5c1.3 0 2 .8 2 1.7M7.5 18.5h7.2c1.1 0 2-.3 2.8-1l3-2.5M3.5 15.5v4"/></svg>',
    dictionary: '<svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5c3-.7 5.4-.2 8 1.5v12c-2.6-1.7-5-2.2-8-1.5zM20 5.5c-3-.7-5.4-.2-8 1.5v12c2.6-1.7 5-2.2 8-1.5z"/></svg>',
    backstage: '<svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/></svg>',
    thinking: '<svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M12 7v4M12 11L6 16M12 11l6 5"/></svg>',
    formysons: '<svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5L12 4.5l8 7M6.5 9.5V19.5h11V9.5"/><path d="M12 17.2l-2.4-2.3a1.5 1.5 0 0 1 2.4-1.8 1.5 1.5 0 0 1 2.4 1.8z"/></svg>'
  });

  const dockLabels = Object.freeze({
    calendar: 'Calendar',
    tasks: 'Tasks',
    zen: 'Zen',
    news: 'News',
    onhand: 'On Hand',
    dictionary: 'Dictionary',
    backstage: 'PJ · Assign',
    thinking: 'Thinking',
    formysons: 'For My Sons'
  });

  function dockMarkup(appName, key, fallbackLabel) {
    const label = dockLabels[appName] || fallbackLabel || appName;
    const icon = dockIcons[appName] || '';
    return `${icon}<b class="dock-key">${key}</b><span class="dock-label">${label}</span>`;
  }

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
      ['6', 'backstage', 'PJ · Assign'],
      ['8', 'thinking', 'Thinking'],
      ['9', 'dictionary', 'Dictionary']
    ];

    entries.forEach(([key, appName, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'app-btn';
      button.dataset.app = appName;
      button.setAttribute('aria-label', label);
      button.innerHTML = dockMarkup(appName, key, label);
      if (zero) dock.insertBefore(button, zero);
      else dock.appendChild(button);
    });
  }

  rebuildDockTail();

  document.querySelectorAll('.dock .app-btn').forEach((button) => {
    const appName = button.dataset.app;
    const key = button.querySelector('b')?.textContent?.trim() || apps[appName]?.key || '';
    if (!appName || !dockIcons[appName]) return;
    button.setAttribute('aria-label', dockLabels[appName] || appName);
    button.innerHTML = dockMarkup(appName, key, button.querySelector('span')?.textContent?.trim());
  });

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
    appWindow.classList.remove('project-memo-expanded');

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
