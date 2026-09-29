(() => {
  'use strict';

  const pet = document.getElementById('pet');
  const say = document.getElementById('petSay');
  const avatar = pet?.querySelector('.pet-avatar');
  const capture = document.getElementById('captureText');
  if (!pet || !say || !avatar) return;

  const RESIDENT_VERSION = '20260929-rady-static1';
  const POSITION_KEY = 'cockpid.workbench.pet.position.v1';
  const MANIFEST_PATH = './assets/rady/manifest.json';

  const FALLBACK_ASSETS = {
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
    }
  };

  const EXPRESSIONS = [
    'normal',
    'smile',
    'happy',
    'wink',
    'sparkle',
    'sleepy',
    'surprised',
    'shy',
    'heart',
    'grumpy'
  ];

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
  let expressionIndex = 0;
  let lastSpeech = '';
  let speechTimer = null;
  let drag = null;

  avatar.innerHTML = '';
  const image = document.createElement('img');
  image.id = 'residentImage';
  image.className = 'resident-image';
  image.alt = 'らでぃ';
  image.draggable = false;
  avatar.appendChild(image);

  function asset(key) {
    const file = manifest?.groups?.expression?.[key] || FALLBACK_ASSETS.expression[key];
    if (!file) return '';
    return `${String(manifest?.basePath || './assets/rady/web/')}${file}`;
  }

  function setExpression(key) {
    const safe = asset(key) ? key : 'normal';
    const src = asset(safe);
    if (!src) return;
    image.dataset.asset = `expression.${safe}`;
    image.dataset.mode = safe;
    pet.dataset.radyMode = safe;
    if (image.getAttribute('src') !== src) image.src = src;
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

  function speak(message = nextSpeech()) {
    say.textContent = message;
    say.classList.add('show');
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => say.classList.remove('show'), 4200);
  }

  function nextExpression() {
    expressionIndex = (expressionIndex + 1) % EXPRESSIONS.length;
    setExpression(EXPRESSIONS[expressionIndex]);
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
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        setPosition(saved.x, saved.y);
      }
    } catch (_) {}
  }

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = drag.moved;
    try { pet.releasePointerCapture(event.pointerId); } catch (_) {}
    pet.classList.remove('dragging');

    if (moved) {
      const rect = pet.getBoundingClientRect();
      setPosition(rect.left, rect.top, true);
    } else {
      nextExpression();
      speak();
    }
    drag = null;
  }

  async function loadManifest() {
    try {
      const response = await fetch(MANIFEST_PATH, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Rady manifest ${response.status}`);
      const data = await response.json();
      if (data?.groups?.expression) manifest = data;
    } catch (error) {
      console.warn('[Rady] manifest fallback', error);
    }
    setExpression(EXPRESSIONS[expressionIndex]);
  }

  image.addEventListener('error', () => {
    if (image.dataset.mode === 'normal') return;
    expressionIndex = 0;
    setExpression('normal');
  });

  pet.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
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
    }
    if (drag.moved) {
      setPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    }
  });

  pet.addEventListener('pointerup', endDrag);
  pet.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', () => {
    if (!pet.style.left) return;
    const rect = pet.getBoundingClientRect();
    setPosition(rect.left, rect.top, true);
  });

  function setFrame(frame) {
    const index = Math.abs(Number(frame) || 0) % EXPRESSIONS.length;
    expressionIndex = index;
    setExpression(EXPRESSIONS[expressionIndex]);
  }

  function noop() {}

  restorePosition();
  loadManifest();

  window.COCKPID_RESIDENT = Object.freeze({
    speak,
    setFrame,
    press: noop,
    flashColor: noop,
    thinking: noop,
    working: noop,
    idle: noop,
    complete: noop,
    error: noop,
    sleep: noop,
    wake: noop,
    version: RESIDENT_VERSION,
    getMode: () => pet.dataset.radyMode || 'normal',
    debug: () => ({
      mode: pet.dataset.radyMode || 'normal',
      asset: image.dataset.asset || '',
      imageSrc: image.src,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      manifestBasePath: manifest.basePath,
      staticMode: true
    }),
    testThinking: noop
  });

  console.info('[Rady] resident boot', RESIDENT_VERSION, { staticMode: true });
})();
