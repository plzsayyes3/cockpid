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
    backstage: { key: '7', title: '7 / BACKSTAGE', type: 'iframe', src: 'backstage.html' },
    board: { key: '8', title: '8 / BOARD', type: 'placeholder', text: 'Shared development board will be connected in STEP 4.' },
    secret: { key: '9', title: '9 / ???', type: 'game' }
  });

  const backstageSlot = document.querySelector('.app-btn.app-slot[aria-label="App slot 7"]');
  if (backstageSlot) {
    backstageSlot.disabled = false;
    backstageSlot.dataset.app = 'backstage';
    backstageSlot.setAttribute('aria-label', 'Backstage');
    const label = backstageSlot.querySelector('span');
    if (label) label.textContent = 'Backstage';
  }

  const keyToApp = Object.freeze(Object.fromEntries(
    Object.entries(apps).map(([name, app]) => [app.key, name])
  ));

  function openApp(name) {
    const app = apps[name];
    if (!app) return false;

    appTitle.textContent = app.title;
    if (app.type === 'iframe') {
      appContent.innerHTML = `<iframe src="${app.src}" title="${app.title}"></iframe>`;
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
