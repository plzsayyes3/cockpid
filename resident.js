(() => {
  const pet = document.getElementById('pet');
  const say = document.getElementById('petSay');
  const avatar = pet?.querySelector('.pet-avatar');
  const capture = document.getElementById('captureText');
  if (!pet || !say || !avatar) return;

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
  let lastSpeech = '';
  let activeReactionFrame = null;
  let lastReactionFrame = null;

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
    const picked = pool.length ? pool[Math.floor(Math.random() * pool.length)] : HOME_FRAME;
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

  function deskMessages(original) {
    const messages = [];
    const hinted = /「(.+?)」/.exec(original)?.[1]?.trim();
    if (hinted) messages.push(`これ、まだ気になる？「${clip(hinted, 44)}」`);

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

  function nextSpeech(original) {
    const contextual = deskMessages(original);
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
        context.drawImage(
          sprite,
          col * cellW,
          row * cellH,
          cellW,
          cellH,
          0,
          0,
          canvas.width,
          canvas.height
        );
        generatedFrameSrc[frame] = canvas.toDataURL('image/png');
      }
      scheduleIdle();
    };
    sprite.src = 'resident-sprites.png?v=20260911-reactions';
  }

  const speechObserver = new MutationObserver(() => {
    if (!say.classList.contains('show')) return;
    const original = say.textContent.trim();
    if (!original) return;
    const message = nextSpeech(original);
    if (!message || message === original) return;
    speechObserver.disconnect();
    say.textContent = message;
    speechObserver.observe(say, { childList: true, subtree: true, characterData: true });
  });

  image.addEventListener('error', () => {
    if (currentFrame !== HOME_FRAME) setFrame(HOME_FRAME);
  });

  new MutationObserver(syncState).observe(say, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(syncState).observe(pet, { attributes: true, attributeFilter: ['class'] });
  speechObserver.observe(say, { childList: true, subtree: true, characterData: true });
  capture?.addEventListener('input', startTypingPulse);

  setFrame(HOME_FRAME);
  prepareGeneratedFrames();
  syncState();
})();
