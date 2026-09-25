(() => {
  'use strict';

  const pet = document.getElementById('pet');
  const say = document.getElementById('petSay');
  const avatar = pet?.querySelector('.pet-avatar');
  const capture = document.getElementById('captureText');
  const captureBtn = document.getElementById('captureBtn');
  if (!pet || !say || !avatar) return;

  const RESIDENT_VERSION = '20260925-rady-stable1';
  console.info('[Rady] resident boot', RESIDENT_VERSION);

  const POSITION_KEY = 'cockpid.workbench.pet.position.v1';
  const MANIFEST_PATH = './assets/rady/manifest.json';
  const SLEEP_AFTER_MS = 5 * 60 * 1000;
  const SLEEP_RETRY_MS = 60 * 1000;

  const FALLBACK_ASSETS = {
    animation: {
      idle: 'animation_01_idle_hq.png?v=20260925-idle-hq1',
      walk: 'animation_02_walk_hq.png?v=20260925-walk-hq1',
      thinking: 'animation_03_thinking_hq.png?v=20260925-thinking-hq1',
      jump: 'animation_01_idle_hq.png?v=20260925-idle-hq1',
      sleep: 'animation_01_idle_hq.png?v=20260925-idle-hq1',
      click: 'animation_06_click_hq.png?v=20260925-click-hq1'
    },
    color: {
      default: 'color_01_default.png',
      mint: 'color_02_mint.png',
      skyblue: 'color_03_skyblue.png',
      yellow: 'color_04_yellow.png',
      pink: 'color_05_pink.png',
      orange: 'color_06_orange.png',
      purple: 'color_07_purple.png',
      red: 'color_08_red.png',
      green: 'color_09_green.png',
      gray: 'color_10_gray.png'
    },
    expression: {
      normal: 'expression_01_normal.png',
      smile: 'expression_02_smile.png',
      happy: 'expression_03_happy.png',
      surprised: 'expression_04_surprised.png',
      sleepy: 'expression_05_sleepy.png',
      wink: 'expression_06_wink.png',
      sparkle: 'expression_07_sparkle.png',
      grumpy: 'expression_08_grumpy.png',
      shy: 'expression_09_shy.png',
      heart: 'expression_10_heart.png'
    },
    usage: {
      taskComplete: 'usage_01_task_complete.png',
      thinking: 'usage_02_thinking.png',
      sleep: 'usage_03_sleep.png',
      happy: 'usage_04_happy.png'
    }
  };

  const RADY_LINES = [
    'それ、いまやる？',
    'ちょっと別のこと考えてもいいかも。',
    '今日は、何を拾う？',
    'これは後でもいい気がする。',
    'なんか忘れてない？',
    '……休憩する？',
    'ひとつだけ進めるなら、どれ？',
    'いま手元にあるもので十分かも。',
    'まだ決めなくてもいいよ。',
    'いったん置いておくのもあり。',
    'ちょっと面白い方へ行く？',
    '今日はここまででもいいんじゃない。',
    'そのまま書いておけば、あとで拾えるよ。',
    'いま気になってるもの、ひとつある？',
    '急がないやつも、忘れなくていい。',
    '静かなうちに、ひとつ考える？'
  ];

  let manifest = { basePath: './assets/rady/web/', groups: FALLBACK_ASSETS };
  let latestHint = '';
  let lastSpeech = '';
  let speechTimer = null;
  let typingTimer = null;
  let typingUntil = 0;
  let sleepTimer = null;
  let transientTimer = null;
  let transientVisual = null;
  let sleeping = false;
  let lastInteractionAt = Date.now();
  let drag = null;
  let activitySyncQueued = false;
  let animationTimer = null;
  let animationRun = 0;
  let currentVisualKey = '';

  const animationFrameCache = new Map();
  const ANIMATION_FRAME_MS = {
    idle: 760,
    walk: 260,
    thinking: 430,
    jump: 260,
    sleep: 900,
    click: 230
  };

  const operations = new Map();

  avatar.innerHTML = '';
  const image = document.createElement('img');
  image.id = 'residentImage';
  image.className = 'resident-image';
  image.alt = 'らでぃ';
  image.draggable = false;
  avatar.appendChild(image);

  function asset(group, key) {
    const file = manifest?.groups?.[group]?.[key] || FALLBACK_ASSETS?.[group]?.[key];
    if (!file) return '';
    const base = String(manifest?.basePath || './assets/rady/web/');
    return `${base}${file}`;
  }

  function preloadAssets() {
    const entries = [
      ['animation', 'idle'],
      ['animation', 'walk'],
      ['animation', 'thinking'],
      ['animation', 'click']
    ];
    entries.forEach(([group, key]) => {
      const src = asset(group, key);
      if (!src) return;
      const preload = new Image();
      preload.src = src;
    });
  }

  async function loadManifest() {
    try {
      const response = await fetch(MANIFEST_PATH, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Rady manifest ${response.status}`);
      const data = await response.json();
      if (data?.groups) manifest = data;
      console.info('[Rady] manifest loaded', {
        basePath: manifest.basePath,
        idle: manifest?.groups?.animation?.idle,
        thinking: manifest?.groups?.animation?.thinking
      });
    } catch (error) {
      console.warn('[Rady] manifest fallback', error);
    }
    preloadAssets();
    render();
  }

  function stopAnimation() {
    clearTimeout(animationTimer);
    animationTimer = null;
    animationRun += 1;
  }

  function loadAnimationFrames(key) {
    const src = asset('animation', key);
    const cacheKey = `${key}:${src}`;
    if (animationFrameCache.has(cacheKey)) return animationFrameCache.get(cacheKey);

    const promise = new Promise((resolve) => {
      const sprite = new Image();
      sprite.onload = () => {
        const frameCount = 3;
        console.info('[Rady] sprite loaded', {
          key,
          src: sprite.src,
          width: sprite.naturalWidth,
          height: sprite.naturalHeight,
          frameWidth: Math.round(sprite.naturalWidth / frameCount)
        });
        const frames = [];
        for (let index = 0; index < frameCount; index += 1) {
          const startX = Math.round(index * sprite.naturalWidth / frameCount);
          const endX = Math.round((index + 1) * sprite.naturalWidth / frameCount);
          const sourceWidth = Math.max(1, endX - startX);
          const canvas = document.createElement('canvas');
          canvas.width = sourceWidth;
          canvas.height = sprite.naturalHeight;
          const context = canvas.getContext('2d');
          if (!context) continue;
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(
            sprite,
            startX, 0, sourceWidth, sprite.naturalHeight,
            0, 0, sourceWidth, sprite.naturalHeight
          );
          frames.push(canvas.toDataURL('image/png'));
        }
        if (frames.length !== frameCount) animationFrameCache.delete(cacheKey);
        resolve(frames);
      };
      sprite.onerror = () => {
        animationFrameCache.delete(cacheKey);
        console.warn('[Rady] sprite failed; cache cleared for retry', { key, src });
        resolve([]);
      };
      sprite.src = src;
    });

    animationFrameCache.set(cacheKey, promise);
    return promise;
  }

  function applyVisualMetadata(group, key, mode) {
    image.dataset.asset = `${group}.${key}`;
    image.dataset.mode = mode || key;
    pet.dataset.radyMode = mode || key;
  }

  function setVisual(group, key, mode) {
    const src = asset(group, key);
    const visualKey = `${group}.${key}:${mode || key}:${src}`;
    if (currentVisualKey === visualKey) return;

    stopAnimation();
    currentVisualKey = visualKey;
    applyVisualMetadata(group, key, mode);

    console.info('[Rady] visual', {
      group,
      key,
      mode: mode || key,
      asset: asset(group, key)
    });

    if (group !== 'animation') {
      const src = asset(group, key);
      if (src && image.getAttribute('src') !== src) image.src = src;
      return;
    }

    const run = animationRun;
    loadAnimationFrames(key).then((frames) => {
      if (run !== animationRun || currentVisualKey !== visualKey) return;

      if (!frames.length) {
        console.warn('[Rady] no animation frames; keeping last good frame', { key, src });
        currentVisualKey = null;
        if (key !== 'idle') {
          setVisual('animation', 'idle', mode === 'sleep' ? 'sleep' : 'idle');
        } else {
          animationTimer = setTimeout(render, 1200);
        }
        return;
      }

      let frameIndex = 0;
      const advance = () => {
        if (run !== animationRun || currentVisualKey !== visualKey) return;
        image.src = frames[frameIndex % frames.length];
        frameIndex += 1;
        animationTimer = setTimeout(advance, ANIMATION_FRAME_MS[key] || 520);
      };
      advance();
    });
  }

  function sample(items) {
    return items.length ? items[Math.floor(Math.random() * items.length)] : '';
  }

  function clip(value, max = 38) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  function visibleTexts(selector) {
    return [...document.querySelectorAll(selector)]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() || '')
      .filter((text) => text && !/読み込み中|Techoを読んでいます/.test(text));
  }

  function deskMessages() {
    const messages = [];
    if (latestHint) messages.push(`これ、まだ気になる？「${clip(latestHint, 44)}」`);

    const onHandTitle = sample(visibleTexts('.movement-item-title'));
    if (onHandTitle) {
      const title = clip(onHandTitle, 34);
      messages.push(`これ、拾ってみる？「${title}」`);
      messages.push(`ON HANDに「${title}」がいる。`);
    }

    const calendarTitle = sample(visibleTexts('.timeline-event-title, .anytime-item'));
    if (calendarTitle) messages.push(`今日の予定に「${clip(calendarTitle, 34)}」があるよ。`);
    if (capture?.value.trim()) messages.push('そのメモ、いま机に置いておく？');
    return messages;
  }

  function nextSpeech() {
    const contextual = deskMessages();
    const pool = [...RADY_LINES, ...contextual, ...contextual];
    const choices = pool.filter((message) => message && message !== lastSpeech);
    const message = sample(choices.length ? choices : pool) || '……。';
    lastSpeech = message;
    return message;
  }

  function isSpeaking() {
    return say.classList.contains('show');
  }

  function isDragging() {
    return pet.classList.contains('dragging');
  }

  function isTyping() {
    return Date.now() < typingUntil;
  }

  function activeOperationMode() {
    const values = [...operations.values()];
    if (values.includes('working')) return 'working';
    if (values.includes('thinking')) return 'thinking';
    return null;
  }

  function isBusy() {
    return isDragging() || isSpeaking() || isTyping() || operations.size > 0 || Boolean(transientVisual);
  }

  function render() {
    pet.classList.toggle('is-speaking', isSpeaking());
    pet.classList.toggle('is-sleeping', sleeping);

    if (sleeping) {
      // Until the dedicated HQ sleep asset is ready, keep the stable HQ idle art
      // and express sleep through CSS only.
      setVisual('animation', 'idle', 'sleep');
      return;
    }

    if (isDragging() && drag?.moved) {
      setVisual('animation', 'walk', 'dragging');
      return;
    }

    if (transientVisual) {
      setVisual(transientVisual.group, transientVisual.key, transientVisual.mode);
      return;
    }

    if (isSpeaking()) {
      setVisual('animation', 'idle', 'speaking');
      return;
    }

    const operationMode = activeOperationMode();
    if (operationMode === 'working') {
      setVisual('animation', 'walk', 'working');
      return;
    }
    if (operationMode === 'thinking') {
      setVisual('animation', 'thinking', 'thinking');
      return;
    }

    if (isTyping()) {
      setVisual('animation', 'thinking', 'thinking');
      return;
    }

    setVisual('animation', 'idle', 'idle');
  }

  function showTransient(group, key, mode, duration = 600) {
    clearTimeout(transientTimer);
    transientVisual = { group, key, mode };
    render();
    transientTimer = setTimeout(() => {
      transientVisual = null;
      render();
    }, duration);
  }

  function flashColor(color = 'mint', duration = 520) {
    // Legacy color assets use a different crop/scale and could make Rady appear
    // to vanish. Preserve the API but use the approved HQ click reaction.
    const safe = FALLBACK_ASSETS.color[color] ? color : 'mint';
    showTransient('animation', 'click', `press-${safe}`, Math.max(520, duration));
  }

  function press(kind = 'normal') {
    const colors = {
      normal: 'mint',
      info: 'skyblue',
      warning: 'yellow',
      success: 'green',
      error: 'red',
      danger: 'red'
    };
    flashColor(colors[kind] || (FALLBACK_ASSETS.color[kind] ? kind : 'mint'));
  }

  function speak(message = nextSpeech()) {
    if (sleeping) wake();
    say.textContent = message;
    say.classList.add('show');
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => {
      say.classList.remove('show');
      render();
    }, 5200);
    showTransient('animation', 'click', 'press-click', 920);
  }

  function startTypingPulse() {
    typingUntil = Date.now() + 1000;
    clearTimeout(typingTimer);
    render();
    typingTimer = setTimeout(() => {
      typingUntil = 0;
      render();
    }, 1050);
  }

  function setOperation(key, mode) {
    const safeKey = String(key || 'external');
    operations.set(safeKey, mode === 'thinking' ? 'thinking' : 'working');
    render();
  }

  function clearOperation(key) {
    operations.delete(String(key || 'external'));
    render();
  }

  function completeOperation(key = 'external') {
    clearOperation(key);
    // Dedicated HQ complete asset will replace this later.
    showTransient('animation', 'idle', 'complete', 1100);
  }

  function errorOperation(key = 'external') {
    clearOperation(key);
    // Dedicated HQ error asset will replace this later.
    showTransient('animation', 'idle', 'error', 900);
  }

  function scheduleSleep(delay) {
    clearTimeout(sleepTimer);
    const elapsed = Date.now() - lastInteractionAt;
    const remaining = delay ?? Math.max(0, SLEEP_AFTER_MS - elapsed);
    sleepTimer = setTimeout(trySleep, remaining);
  }

  function trySleep() {
    if (Date.now() - lastInteractionAt < SLEEP_AFTER_MS) {
      scheduleSleep();
      return;
    }
    if (isBusy()) {
      scheduleSleep(SLEEP_RETRY_MS);
      return;
    }
    sleeping = true;
    say.classList.remove('show');
    clearTimeout(transientTimer);
    transientVisual = null;
    render();
  }

  function wake() {
    const wasSleeping = sleeping;
    sleeping = false;
    if (wasSleeping) showTransient('animation', 'idle', 'wake', 850);
    else render();
  }

  function markInteraction() {
    lastInteractionAt = Date.now();
    if (sleeping) wake();
    scheduleSleep();
  }

  function buttonColor(button) {
    const requested = button?.dataset?.radyColor;
    if (requested && FALLBACK_ASSETS.color[requested]) return requested;
    const className = String(button?.className || '');
    if (/danger/i.test(className)) return 'red';
    if (/app-btn/i.test(className)) return 'skyblue';
    if (/status-|ghost-btn/i.test(className)) return 'purple';
    if (/primary/i.test(className)) return 'yellow';
    return 'mint';
  }

  function handleButtonPress(event) {
    const button = event.target?.closest?.('button, [role="button"], .btn, .action-btn, .app-btn');
    if (!button || pet.contains(button) || button.disabled || button.dataset.radyIgnore === 'true') return;
    flashColor(buttonColor(button));
  }

  function syncDetectedActivity() {
    activitySyncQueued = false;
    const saving = Boolean(captureBtn?.disabled && /保存中/.test(captureBtn.textContent || ''));
    if (saving) operations.set('__dom__', 'working');
    else {
      const loadingSelectors = [
        '#todayList .empty',
        '#newsHomeList .news-home-empty',
        '.movement-loading'
      ];
      const loading = loadingSelectors.some((selector) =>
        [...document.querySelectorAll(selector)].some((node) =>
          node.getClientRects().length > 0 &&
          (/読み込|読んでいます|LOADING/i.test(node.textContent || '') || node.classList.contains('movement-loading'))
        )
      );
      if (loading) operations.set('__dom__', 'thinking');
      else operations.delete('__dom__');
    }
    render();
  }

  function queueActivitySync() {
    if (activitySyncQueued) return;
    activitySyncQueued = true;
    queueMicrotask(syncDetectedActivity);
  }

  function clampPosition(x, y) {
    const margin = 8;
    const width = pet.offsetWidth || 96;
    const height = pet.offsetHeight || 104;
    return {
      x: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - width - margin)),
      y: Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - height - margin))
    };
  }

  function setPosition(x, y, remember = false) {
    const pos = clampPosition(x, y);
    pet.style.left = `${pos.x}px`;
    pet.style.top = `${pos.y}px`;
    pet.style.right = 'auto';
    pet.style.bottom = 'auto';
    if (remember) localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
  }

  function restorePosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) setPosition(saved.x, saved.y);
    } catch (_) {}
  }

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = drag.moved;
    try { pet.releasePointerCapture(event.pointerId); } catch (_) {}
    pet.classList.remove('dragging');
    const rect = pet.getBoundingClientRect();
    if (moved) setPosition(rect.left, rect.top, true);
    else speak();
    drag = null;
    render();
  }

  async function loadLatestHint() {
    if (typeof token !== 'function' || typeof gh !== 'function' || typeof decode !== 'function') return;
    const currentToken = token();
    if (!currentToken) return;
    try {
      const response = await fetch(`https://api.github.com/repos/${OWNER}/my-storage-note/contents/memory/extracted/idea?ref=main`, {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${currentToken}` }
      });
      if (!response.ok) throw new Error(`idea index ${response.status}`);
      const entries = await response.json();
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
      const latest = (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry.type === 'file' && /^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name) && entry.name <= `${today}.json`)
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

  image.addEventListener('error', () => {
    console.warn('[Rady] rendered image failed; recovering to HQ idle', {
      asset: image.dataset.asset,
      mode: image.dataset.mode
    });
    stopAnimation();
    currentVisualKey = null;
    transientVisual = null;
    sleeping = false;
    setTimeout(() => setVisual('animation', 'idle', 'idle'), 80);
  });

  pet.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    markInteraction();
    const rect = pet.getBoundingClientRect();
    drag = {
      id: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    pet.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  pet.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance > 4) {
      drag.moved = true;
      pet.classList.add('dragging');
      render();
    }
    if (drag.moved) setPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  });
  pet.addEventListener('pointerup', endDrag);
  pet.addEventListener('pointercancel', endDrag);

  capture?.addEventListener('input', startTypingPulse);
  document.addEventListener('click', handleButtonPress, true);

  ['pointerdown', 'keydown', 'input', 'touchstart', 'wheel', 'scroll'].forEach((eventName) => {
    window.addEventListener(eventName, markInteraction, { passive: true, capture: eventName === 'pointerdown' });
  });

  new MutationObserver(() => {
    queueActivitySync();
    render();
  }).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'disabled', 'hidden', 'aria-hidden']
  });

  window.addEventListener('resize', () => {
    if (!pet.style.left) return;
    const rect = pet.getBoundingClientRect();
    setPosition(rect.left, rect.top, true);
  });

  function setFrame(frame) {
    // Keep legacy callers working without falling back to the old low-res
    // expression set. Only approved HQ animation assets are used here.
    const legacy = {
      1: ['animation', 'idle', 'legacy'],
      2: ['animation', 'idle', 'legacy'],
      3: ['animation', 'thinking', 'thinking'],
      4: ['animation', 'idle', 'legacy'],
      5: ['animation', 'idle', 'legacy'],
      6: ['animation', 'walk', 'working'],
      7: ['animation', 'idle', 'idle'],
      8: ['animation', 'thinking', 'thinking'],
      9: ['animation', 'walk', 'working']
    };
    const next = legacy[Number(frame)] || legacy[7];
    showTransient(next[0], next[1], next[2], 700);
  }

  restorePosition();
  loadLatestHint();
  loadManifest();
  syncDetectedActivity();
  render();
  scheduleSleep();

  window.COCKPID_RESIDENT = Object.freeze({
    speak,
    setFrame,
    press,
    flashColor,
    thinking: (key = 'external') => setOperation(key, 'thinking'),
    working: (key = 'external') => setOperation(key, 'working'),
    idle: (key = 'external') => clearOperation(key),
    complete: completeOperation,
    error: errorOperation,
    sleep: trySleep,
    wake,
    version: RESIDENT_VERSION,
    getMode: () => pet.dataset.radyMode || 'idle',
    debug: () => ({
      mode: pet.dataset.radyMode || 'idle',
      visualKey: currentVisualKey,
      asset: image.dataset.asset || '',
      imageSrc: image.src,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      manifestBasePath: manifest.basePath,
      manifestThinking: manifest?.groups?.animation?.thinking,
      manifestClick: manifest?.groups?.animation?.click
    }),
    testThinking: (duration = 5000) => {
      const key = '__rady-debug-thinking__';
      console.info('[Rady] testThinking start', {
        duration,
        asset: asset('animation', 'thinking')
      });
      setOperation(key, 'thinking');
      setTimeout(() => {
        clearOperation(key);
        console.info('[Rady] testThinking end');
      }, Math.max(500, Number(duration) || 5000));
    }
  });
})();
