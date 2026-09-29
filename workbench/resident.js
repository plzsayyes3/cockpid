(() => {
  'use strict';

  const pet = document.getElementById('pet');
  const say = document.getElementById('petSay');
  const avatar = pet?.querySelector('.pet-avatar');
  const capture = document.getElementById('captureText');
  if (!pet || !say || !avatar) return;

  const RESIDENT_VERSION = '20260929-rady-hq-static3';
  const POSITION_KEY = 'cockpid.workbench.pet.position.v1';
  const MANIFEST_PATH = './assets/rady/manifest.json';

  const FALLBACK_ANIMATION = {
    idle: 'animation_01_idle_hq.png?v=20260925-idle-hq1',
    walk: 'animation_02_walk_hq.png?v=20260925-walk-hq1',
    thinking: 'animation_03_thinking_hq.png?v=20260925-thinking-hq1',
    click: 'animation_06_click_hq.png?v=20260925-click-hq1'
  };

  // HQ sprite sheets are three frames wide. We show exactly one frame at a time.
  // No canvas splitting, no DataURL cache and no animation timer.
  const POSES = [
    ['idle', 0],
    ['idle', 1],
    ['idle', 2],
    ['click', 0],
    ['click', 1],
    ['click', 2],
    ['thinking', 0],
    ['thinking', 1],
    ['thinking', 2],
    ['walk', 1]
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

  let manifest = { basePath: './assets/rady/web/', groups: { animation: FALLBACK_ANIMATION } };
  let poseIndex = 0;
  let lastSpeech = '';
  let speechTimer = null;
  let drag = null;

  avatar.innerHTML = '';
  const image = document.createElement('img');
  image.id = 'residentImage';
  image.className = 'resident-image resident-sprite';
  image.alt = 'らでぃ';
  image.draggable = false;
  avatar.appendChild(image);

  function animationAsset(key) {
    const file = manifest?.groups?.animation?.[key] || FALLBACK_ANIMATION[key] || FALLBACK_ANIMATION.idle;
    return `${String(manifest?.basePath || './assets/rady/web/')}${file}`;
  }

  function layoutFrame() {
    if (!image.naturalWidth || !image.naturalHeight) return;

    const frameCount = 3;
    const frameWidth = image.naturalWidth / frameCount;
    const frameHeight = image.naturalHeight;
    const boxWidth = avatar.clientWidth || 82;
    const boxHeight = avatar.clientHeight || 96;
    const scale = Math.min(boxWidth / frameWidth, boxHeight / frameHeight);
    const renderedFrameWidth = frameWidth * scale;
    const renderedHeight = frameHeight * scale;
    const frame = Math.max(0, Math.min(2, Number(image.dataset.frame) || 0));

    image.style.width = `${image.naturalWidth * scale}px`;
    image.style.height = `${renderedHeight}px`;
    image.style.left = `${(boxWidth - renderedFrameWidth) / 2 - frame * renderedFrameWidth}px`;
    image.style.top = `${(boxHeight - renderedHeight) / 2}px`;
  }

  function setPose(key = 'idle', frame = 0) {
    const safeKey = FALLBACK_ANIMATION[key] ? key : 'idle';
    const safeFrame = Math.max(0, Math.min(2, Number(frame) || 0));
    const src = animationAsset(safeKey);

    image.dataset.asset = `animation.${safeKey}`;
    image.dataset.mode = safeKey;
    image.dataset.frame = String(safeFrame);
    pet.dataset.radyMode = `${safeKey}:${safeFrame}`;

    if (image.getAttribute('src') !== src) {
      image.src = src;
    } else {
      layoutFrame();
    }
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

  function nextPose() {
    poseIndex = (poseIndex + 1) % POSES.length;
    setPose(...POSES[poseIndex]);
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

    if (moved) {
      const rect = pet.getBoundingClientRect();
      setPosition(rect.left, rect.top, true);
    } else {
      nextPose();
      speak();
    }
    drag = null;
  }

  async function loadManifest() {
    try {
      const response = await fetch(MANIFEST_PATH, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Rady manifest ${response.status}`);
      const data = await response.json();
      if (data?.groups?.animation) manifest = data;
    } catch (error) {
      console.warn('[Rady] manifest fallback', error);
    }
    setPose(...POSES[poseIndex]);
  }

  image.addEventListener('load', layoutFrame);

  image.addEventListener('error', () => {
    if (image.dataset.asset === 'animation.idle' && image.dataset.frame === '0') return;
    poseIndex = 0;
    setPose('idle', 0);
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
    if (drag.moved) setPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  });

  pet.addEventListener('pointerup', endDrag);
  pet.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', () => {
    layoutFrame();
    if (!pet.style.left) return;
    const rect = pet.getBoundingClientRect();
    setPosition(rect.left, rect.top, true);
  });

  function setFrame(frame) {
    poseIndex = Math.abs(Number(frame) || 0) % POSES.length;
    setPose(...POSES[poseIndex]);
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
    getMode: () => pet.dataset.radyMode || 'idle:0',
    debug: () => ({
      mode: pet.dataset.radyMode || 'idle:0',
      asset: image.dataset.asset || '',
      frame: Number(image.dataset.frame || 0),
      imageSrc: image.src,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      staticMode: true,
      hqSprite: true
    }),
    testThinking: noop
  });

  console.info('[Rady] resident boot', RESIDENT_VERSION, { staticMode: true, hqSprite: true });
})();
