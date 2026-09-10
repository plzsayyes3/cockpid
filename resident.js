(() => {
  const pet = document.getElementById('pet');
  const say = document.getElementById('petSay');
  const avatar = pet?.querySelector('.pet-avatar');
  const capture = document.getElementById('captureText');
  if (!pet || !say || !avatar) return;

  const HOME_FRAME = 7;
  const TYPE_FRAMES = [7, 8, 9, 8];
  let currentFrame = HOME_FRAME;
  let idleTimer = null;
  let sequenceTimer = null;
  let typingTimer = null;
  let typingUntil = 0;
  let typingIndex = 0;

  function setFrame(frame) {
    const safe = Math.min(9, Math.max(1, Number(frame) || HOME_FRAME));
    const index = safe - 1;
    const col = index % 3;
    const row = Math.floor(index / 3);
    avatar.style.setProperty('--sprite-x', `${-col * 60}px`);
    avatar.style.setProperty('--sprite-y', `${-row * 81}px`);
    avatar.dataset.frame = String(safe);
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

  function clearSequence() {
    clearTimeout(sequenceTimer);
    sequenceTimer = null;
  }

  function applyPriorityState() {
    const speaking = isSpeaking();
    const dragging = isDragging();
    pet.classList.toggle('is-speaking', speaking);

    if (dragging) {
      clearSequence();
      setFrame(6);
      return true;
    }
    if (speaking) {
      clearSequence();
      setFrame(3);
      return true;
    }
    return false;
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(runIdleGesture, 12000 + Math.random() * 8000);
  }

  function runIdleGesture() {
    if (applyPriorityState() || isTyping()) {
      scheduleIdle();
      return;
    }

    const sequence = [1, 2, 1, HOME_FRAME];
    let step = 0;
    const next = () => {
      if (applyPriorityState() || isTyping()) {
        scheduleIdle();
        return;
      }
      setFrame(sequence[step]);
      step += 1;
      if (step < sequence.length) sequenceTimer = setTimeout(next, 260);
      else scheduleIdle();
    };
    next();
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
    clearSequence();
    clearTimeout(idleTimer);
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
    if (applyPriorityState()) return;
    if (isTyping()) return;
    if (currentFrame === 3 || currentFrame === 6) setFrame(HOME_FRAME);
  }

  new MutationObserver(syncState).observe(say, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(syncState).observe(pet, { attributes: true, attributeFilter: ['class'] });
  capture?.addEventListener('input', startTypingPulse);
  capture?.addEventListener('focus', () => {
    if (!applyPriorityState() && !isTyping()) setFrame(HOME_FRAME);
  });

  setFrame(HOME_FRAME);
  scheduleIdle();
  syncState();
})();
