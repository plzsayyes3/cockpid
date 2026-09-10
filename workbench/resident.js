(() => {
  const pet = document.getElementById('pet');
  const say = document.getElementById('petSay');
  const avatar = pet?.querySelector('.pet-avatar');
  if (!pet || !say || !avatar) return;

  const idleFrames = [1, 2, 4, 5, 7, 8, 9];
  let idleTimer = null;
  let currentFrame = 1;

  function setFrame(frame) {
    const safe = Math.min(9, Math.max(1, Number(frame) || 1));
    const index = safe - 1;
    const col = index % 3;
    const row = Math.floor(index / 3);
    avatar.style.setProperty('--sprite-x', `${-col * 60}px`);
    avatar.style.setProperty('--sprite-y', `${-row * 81}px`);
    avatar.dataset.frame = String(safe);
    currentFrame = safe;
  }

  function pickIdleFrame() {
    const choices = idleFrames.filter((frame) => frame !== currentFrame);
    return choices[Math.floor(Math.random() * choices.length)] || 1;
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!pet.classList.contains('dragging') && !say.classList.contains('show')) {
        setFrame(pickIdleFrame());
      }
      scheduleIdle();
    }, 7000 + Math.random() * 7000);
  }

  function syncState() {
    const speaking = say.classList.contains('show');
    const dragging = pet.classList.contains('dragging');
    pet.classList.toggle('is-speaking', speaking);

    if (dragging) setFrame(6);
    else if (speaking) setFrame(3);
    else if (currentFrame === 3 || currentFrame === 6) setFrame(pickIdleFrame());
  }

  new MutationObserver(syncState).observe(say, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(syncState).observe(pet, { attributes: true, attributeFilter: ['class'] });

  setFrame(1);
  scheduleIdle();
  syncState();
})();
