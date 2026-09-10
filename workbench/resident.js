(() => {
  const pet = document.getElementById('pet');
  const say = document.getElementById('petSay');
  const avatar = pet?.querySelector('.pet-avatar');
  const capture = document.getElementById('captureText');
  if (!pet || !say || !avatar) return;

  const HOME_FRAME = 7;
  const TYPE_FRAMES = [7, 8, 9, 8];
  const FRAME_SRC = {
    3: 'resident-frame3-full.svg?v=20260911',
    6: 'resident-frame6.png',
    7: 'resident-frame7.png',
    8: 'resident-frame8.png',
    9: 'resident-frame9.png'
  };
  const idleFrameSrc = {};

  let currentFrame = HOME_FRAME;
  let typingTimer = null;
  let typingUntil = 0;
  let typingIndex = 0;
  let idleTimer = null;
  let gestureTimer = null;
  let gestureRun = 0;

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
    return FRAME_SRC[frame] || idleFrameSrc[frame] || FRAME_SRC[HOME_FRAME];
  }

  function setFrame(frame) {
    const safe = FRAME_SRC[frame] || idleFrameSrc[frame] ? Number(frame) : HOME_FRAME;
    const nextSrc = frameSource(safe);
    if (image.getAttribute('src') !== nextSrc) image.src = nextSrc;
    image.dataset.frame = String(safe);
    currentFrame = safe;
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
    if (!idleFrameSrc[1] || !idleFrameSrc[2] || isBusy()) return;
    idleTimer = setTimeout(runIdleGesture, 12000 + Math.random() * 8000);
  }

  function runIdleGesture() {
    if (isBusy() || !idleFrameSrc[1] || !idleFrameSrc[2]) {
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
      setFrame(3);
      return true;
    }
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

  function prepareIdleFrames() {
    const sprite = new Image();
    sprite.onload = () => {
      const cellW = sprite.naturalWidth / 3;
      const cellH = sprite.naturalHeight / 3;
      if (!Number.isFinite(cellW) || !Number.isFinite(cellH) || cellW <= 0 || cellH <= 0) return;

      for (const frame of [1, 2]) {
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
        idleFrameSrc[frame] = canvas.toDataURL('image/png');
      }
      scheduleIdle();
    };
    sprite.src = 'resident-sprites.png?v=20260910-idle';
  }

  image.addEventListener('error', () => {
    if (currentFrame !== HOME_FRAME) setFrame(HOME_FRAME);
  });

  new MutationObserver(syncState).observe(say, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(syncState).observe(pet, { attributes: true, attributeFilter: ['class'] });
  capture?.addEventListener('input', startTypingPulse);

  setFrame(HOME_FRAME);
  prepareIdleFrames();
  syncState();
})();
