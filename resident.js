(() => {
  const pet = document.getElementById('pet');
  const say = document.getElementById('petSay');
  const avatar = pet?.querySelector('.pet-avatar');
  const capture = document.getElementById('captureText');
  if (!pet || !say || !avatar) return;

  const HOME_FRAME = 7;
  const TYPE_FRAMES = [7, 8, 9, 8];
  const FRAME_SRC = {
    3: 'resident-frame3.png',
    6: 'resident-frame6.png',
    7: 'resident-frame7.png',
    8: 'resident-frame8.png',
    9: 'resident-frame9.png'
  };

  let currentFrame = HOME_FRAME;
  let typingTimer = null;
  let typingUntil = 0;
  let typingIndex = 0;

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

  function setFrame(frame) {
    const safe = FRAME_SRC[frame] ? Number(frame) : HOME_FRAME;
    const nextSrc = FRAME_SRC[safe];
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
  }

  function startTypingPulse() {
    typingUntil = Date.now() + 900;
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
    if (currentFrame !== HOME_FRAME) setFrame(HOME_FRAME);
  }

  image.addEventListener('error', () => {
    if (currentFrame !== HOME_FRAME) setFrame(HOME_FRAME);
  });

  new MutationObserver(syncState).observe(say, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(syncState).observe(pet, { attributes: true, attributeFilter: ['class'] });
  capture?.addEventListener('input', startTypingPulse);

  setFrame(HOME_FRAME);
  syncState();
})();
