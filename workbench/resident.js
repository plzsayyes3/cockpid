(() => {
  'use strict';

  const pet = document.getElementById('pet');
  const say = document.getElementById('petSay');
  const avatar = pet?.querySelector('.pet-avatar');
  const capture = document.getElementById('captureText');
  if (!pet || !say || !avatar) return;

  const POSITION_KEY = 'cockpid.workbench.pet.position.v1';
  const HOME_FRAME = 7;
  const TYPE_FRAMES = [7, 8, 9, 8];
  const REACTION_FRAMES = [1, 2, 4, 5, 7];
  const FRAME_SRC = {
    3: 'resident-frame3-full.svg?v=20260911',
    6: 'resident-frame6.png',
    7: 'resident-frame7.png',
    8: 'resident-frame8.png',
    9: 'resident-frame9.png'
  };
  const generatedFrameSrc = {};
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

  let currentFrame = HOME_FRAME;
  let typingTimer = null;
  let typingUntil = 0;
  let typingIndex = 0;
  let idleTimer = null;
  let gestureTimer = null;
  let gestureRun = 0;
  let speechTimer = null;
  let lastSpeech = '';
  let activeReactionFrame = null;
  let lastReactionFrame = null;
  let latestHint = '';
  let drag = null;

  avatar.innerHTML = '';
  const image = document.createElement('img');
  image.id = 'residentImage';
  image.className = 'resident-image';
  image.alt = '';
  image.draggable = false;
  avatar.appendChild(image);

  Object.values(FRAME_SRC).forEach((src) => {
    const preload = new Image();
    preload.src = src;
  });

  function frameSource(frame) {
    return FRAME_SRC[frame] || generatedFrameSrc[frame] || FRAME_SRC[HOME_FRAME];
  }

  function hasFrame(frame) {
    return Boolean(FRAME_SRC[frame] || generatedFrameSrc[frame]);
  }

  function setFrame(frame) {
    const safe = hasFrame(frame) ? Number(frame) : HOME_FRAME;
    const nextSrc = frameSource(safe);
    if (image.getAttribute('src') !== nextSrc) image.src = nextSrc;
    image.dataset.frame = String(safe);
    currentFrame = safe;
  }

  function sample(items) {
    return items.length ? items[Math.floor(Math.random() * items.length)] : '';
  }

  function chooseReactionFrame() {
    const available = REACTION_FRAMES.filter(hasFrame);
    const alternatives = available.filter((frame) => frame !== lastReactionFrame);
    const pool = alternatives.length ? alternatives : available;
    const picked = pool.length ? sample(pool) : HOME_FRAME;
    lastReactionFrame = picked;
    return picked;
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

    const onHand = visibleTexts('.movement-item-title');
    const onHandTitle = sample(onHand);
    if (onHandTitle) {
      const title = clip(onHandTitle, 34);
      messages.push(`これ、拾ってみる？「${title}」`);
      messages.push(`ON HANDに「${title}」がいる。`);
    }

    const calendar = visibleTexts('.timeline-event-title, .anytime-item');
    const calendarTitle = sample(calendar);
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
    speechTimer = setTimeout(() => say.classList.remove('show'), 5200);
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

  function isBusy() {
    return isDragging() || isSpeaking() || isTyping();
  }

  function cancelIdle() {
    clearTimeout(idleTimer);
    clearTimeout(gestureTimer);
    idleTimer = null;
    gestureTimer = null;
    gestureRun += 1;
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    if (!generatedFrameSrc[1] || !generatedFrameSrc[2] || isBusy()) return;
    idleTimer = setTimeout(runIdleGesture, 12000 + Math.random() * 8000);
  }

  function runIdleGesture() {
    if (isBusy() || !generatedFrameSrc[1] || !generatedFrameSrc[2]) {
      scheduleIdle();
      return;
    }

    const run = ++gestureRun;
    const sequence = [1, 2, 1, HOME_FRAME];
    let step = 0;
    const next = () => {
      if (run !== gestureRun || isBusy()) {
        if (!isBusy()) setFrame(HOME_FRAME);
        scheduleIdle();
        return;
      }
      setFrame(sequence[step]);
      step += 1;
      if (step < sequence.length) gestureTimer = setTimeout(next, 260);
      else scheduleIdle();
    };
    next();
  }

  function applyPriorityState() {
    const speaking = isSpeaking();
    const dragging = isDragging();
    pet.classList.toggle('is-speaking', speaking);

    if (dragging) {
      setFrame(6);
      return true;
    }
    if (speaking) {
      if (activeReactionFrame == null || !hasFrame(activeReactionFrame)) {
        activeReactionFrame = chooseReactionFrame();
      }
      setFrame(activeReactionFrame);
      return true;
    }
    activeReactionFrame = null;
    return false;
  }

  function stopTypingLoop() {
    clearInterval(typingTimer);
    typingTimer = null;
    typingIndex = 0;
    if (!applyPriorityState()) setFrame(HOME_FRAME);
    scheduleIdle();
  }

  function startTypingPulse() {
    typingUntil = Date.now() + 900;
    cancelIdle();
    if (typingTimer) return;

    typingTimer = setInterval(() => {
      if (applyPriorityState()) return;
      if (!isTyping()) {
        stopTypingLoop();
        return;
      }
      setFrame(TYPE_FRAMES[typingIndex % TYPE_FRAMES.length]);
      typingIndex += 1;
    }, 150);
  }

  function syncState() {
    cancelIdle();
    if (applyPriorityState()) return;
    if (isTyping()) return;
    setFrame(HOME_FRAME);
    scheduleIdle();
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
    syncState();
  }

  function prepareGeneratedFrames() {
    const sprite = new Image();
    sprite.onload = () => {
      const cellW = sprite.naturalWidth / 3;
      const cellH = sprite.naturalHeight / 3;
      if (!Number.isFinite(cellW) || !Number.isFinite(cellH) || cellW <= 0 || cellH <= 0) return;

      for (const frame of [1, 2, 4, 5]) {
        const index = frame - 1;
        const col = index % 3;
        const row = Math.floor(index / 3);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(cellW);
        canvas.height = Math.round(cellH);
        const context = canvas.getContext('2d');
        if (!context) continue;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(sprite, col * cellW, row * cellH, cellW, cellH, 0, 0, canvas.width, canvas.height);
        generatedFrameSrc[frame] = canvas.toDataURL('image/png');
      }
      scheduleIdle();
    };
    sprite.src = 'resident-sprites.png?v=20260911-reactions';
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
    if (currentFrame !== HOME_FRAME) setFrame(HOME_FRAME);
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
    pet.classList.add('dragging');
    syncState();
    event.preventDefault();
  });

  pet.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
    setPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  });
  pet.addEventListener('pointerup', endDrag);
  pet.addEventListener('pointercancel', endDrag);

  new MutationObserver(syncState).observe(say, { attributes: true, attributeFilter: ['class'] });
  capture?.addEventListener('input', startTypingPulse);
  window.addEventListener('resize', () => {
    if (!pet.style.left) return;
    const rect = pet.getBoundingClientRect();
    setPosition(rect.left, rect.top, true);
  });

  setFrame(HOME_FRAME);
  prepareGeneratedFrames();
  restorePosition();
  loadLatestHint();
  syncState();

  window.COCKPID_RESIDENT = Object.freeze({ speak, setFrame });
})();