const stage = document.getElementById('stanStage');
const radyPet = document.getElementById('radyPet');
const radySprite = radyPet?.querySelector('img');
const mood = document.getElementById('stanMood');

if (stage && radyPet && radySprite) {
  const frameUrl = (name) => new URL(`../assets/rady/pixel/${name}?v=20260930-rady-life1`, import.meta.url).href;
  const FRAMES = Object.freeze({
    idle: frameUrl('rady_idle_01.png'),
    blink: frameUrl('rady_idle_02.png'),
    walk1: frameUrl('rady_walk_01.png'),
    walk2: frameUrl('rady_walk_02.png')
  });

  const SLEEP_START_HOUR = 23;
  const WAKE_HOUR = 6;
  const LIFE_CHECK_MS = 60 * 1000;

  for (const src of Object.values(FRAMES)) {
    const preload = new Image();
    preload.src = src;
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state = 'awake';
  let blinkTimer = 0;
  let walkTimer = 0;
  let stepTimer = 0;
  let playTimer = 0;
  let autoPlayTimer = 0;
  let lifeTimer = 0;
  let currentX = 0;
  let walking = false;

  const randomBetween = (min, max) => Math.round(min + Math.random() * (max - min));

  function isRadyActive() {
    return stage.dataset.character === 'rady' && !document.hidden;
  }

  function isSleepTime(date = new Date()) {
    const hour = date.getHours();
    return hour >= SLEEP_START_HOUR || hour < WAKE_HOUR;
  }

  function setFrame(src) {
    if (radySprite.src !== src) radySprite.src = src;
  }

  function setPosition(x, bob = 0) {
    currentX = x;
    radySprite.style.transform =
      `translate(calc(-50% + ${Math.round(currentX)}px), calc(-87.5% + ${bob}px))`;
  }

  function movementLimit() {
    return Math.max(36, Math.min(132, window.innerWidth * 0.22));
  }

  function clearActivityTimers() {
    window.clearTimeout(blinkTimer);
    window.clearTimeout(walkTimer);
    window.clearTimeout(stepTimer);
    window.clearTimeout(playTimer);
    window.clearTimeout(autoPlayTimer);
    blinkTimer = 0;
    walkTimer = 0;
    stepTimer = 0;
    playTimer = 0;
    autoPlayTimer = 0;
  }

  function setMood(text) {
    if (mood && stage.dataset.character === 'rady') mood.textContent = text;
  }

  function applyState(next) {
    state = next;
    stage.dataset.radyState = next;
    radyPet.dataset.state = next;

    if (next === 'sleeping') {
      walking = false;
      clearActivityTimers();
      setFrame(FRAMES.blink);
      setPosition(currentX, 0);
      setMood('すやすや');
      return;
    }

    if (next === 'playing') {
      setMood('遊んでる');
      return;
    }

    setFrame(FRAMES.idle);
    setPosition(currentX, 0);
    setMood('のんびりしてる');
  }

  function scheduleBlink() {
    window.clearTimeout(blinkTimer);
    if (!isRadyActive() || state !== 'awake' || walking) return;

    blinkTimer = window.setTimeout(() => {
      if (!isRadyActive() || state !== 'awake' || walking) return;
      setFrame(FRAMES.blink);
      blinkTimer = window.setTimeout(() => {
        if (!isRadyActive() || state !== 'awake' || walking) return;
        setFrame(FRAMES.idle);
        scheduleBlink();
      }, 145);
    }, randomBetween(2400, 5200));
  }

  function scheduleWalk() {
    window.clearTimeout(walkTimer);
    if (!isRadyActive() || state !== 'awake' || reduceMotion.matches) return;
    walkTimer = window.setTimeout(startWalk, randomBetween(6500, 11500));
  }

  function scheduleAutoPlay() {
    window.clearTimeout(autoPlayTimer);
    if (!isRadyActive() || state !== 'awake' || reduceMotion.matches) return;
    autoPlayTimer = window.setTimeout(() => startPlay(false), randomBetween(75000, 150000));
  }

  function resumeAwakeLife() {
    if (!isRadyActive()) return;
    if (isSleepTime()) {
      applyState('sleeping');
      return;
    }
    applyState('awake');
    scheduleBlink();
    scheduleWalk();
    scheduleAutoPlay();
  }

  function startWalk() {
    if (!isRadyActive() || state !== 'awake' || reduceMotion.matches || walking) return;

    walking = true;
    window.clearTimeout(blinkTimer);

    const limit = movementLimit();
    let direction = Math.random() < 0.5 ? -1 : 1;
    if (currentX > limit * 0.7) direction = -1;
    if (currentX < -limit * 0.7) direction = 1;

    const totalSteps = randomBetween(6, 10);
    let step = 0;

    const advance = () => {
      if (!isRadyActive() || state !== 'awake') {
        walking = false;
        setPosition(currentX, 0);
        return;
      }

      if (step >= totalSteps) {
        walking = false;
        setFrame(FRAMES.idle);
        setPosition(currentX, 0);
        scheduleBlink();
        scheduleWalk();
        return;
      }

      const frame = step % 2 === 0 ? FRAMES.walk1 : FRAMES.walk2;
      const bob = step % 2 === 0 ? -1 : 0;
      currentX = Math.max(-limit, Math.min(limit, currentX + direction * 8));
      setFrame(frame);
      setPosition(currentX, bob);
      step += 1;
      stepTimer = window.setTimeout(advance, 185);
    };

    advance();
  }

  function startPlay(fromTap = true) {
    if (!isRadyActive() || isSleepTime() || state === 'playing') return;

    clearActivityTimers();
    walking = false;
    applyState('playing');

    if (reduceMotion.matches) {
      setFrame(FRAMES.idle);
      playTimer = window.setTimeout(resumeAwakeLife, 1600);
      return;
    }

    const limit = movementLimit();
    const startX = currentX;
    const direction = currentX > limit * 0.55 ? -1 : currentX < -limit * 0.55 ? 1 : (Math.random() < 0.5 ? -1 : 1);
    const totalSteps = fromTap ? 16 : 12;
    let step = 0;

    const playStep = () => {
      if (!isRadyActive() || state !== 'playing') return;

      if (step >= totalSteps) {
        currentX = Math.max(-limit, Math.min(limit, currentX));
        setFrame(FRAMES.idle);
        setPosition(currentX, 0);
        resumeAwakeLife();
        return;
      }

      const phase = step % 4;
      const bob = phase === 1 ? -8 : phase === 2 ? -4 : 0;
      const frame = step % 2 === 0 ? FRAMES.walk1 : FRAMES.walk2;
      const drift = step < totalSteps / 2 ? direction * 5 : -direction * 5;
      currentX = Math.max(-limit, Math.min(limit, currentX + drift));

      setFrame(frame);
      setPosition(currentX, bob);
      step += 1;
      stepTimer = window.setTimeout(playStep, 135);
    };

    setPosition(startX, 0);
    playStep();
  }

  function evaluateLife() {
    if (!isRadyActive()) return;

    if (isSleepTime()) {
      if (state !== 'sleeping') applyState('sleeping');
      return;
    }

    if (state === 'sleeping') {
      resumeAwakeLife();
    }
  }

  function start() {
    clearActivityTimers();
    walking = false;

    if (!isRadyActive()) {
      applyState('awake');
      return;
    }

    if (isSleepTime()) {
      applyState('sleeping');
    } else {
      resumeAwakeLife();
    }
  }

  function stop() {
    clearActivityTimers();
    walking = false;
    setFrame(FRAMES.idle);
    setPosition(currentX, 0);
  }

  radySprite.style.willChange = 'transform';
  radySprite.style.transition = reduceMotion.matches ? 'none' : 'transform 130ms steps(2, end)';
  radySprite.setAttribute('role', 'button');
  radySprite.setAttribute('tabindex', '0');
  radySprite.setAttribute('aria-label', 'らでぃと遊ぶ');

  radySprite.addEventListener('pointerdown', (event) => {
    if (stage.dataset.character !== 'rady') return;
    event.stopPropagation();
  });

  radySprite.addEventListener('pointerup', (event) => {
    if (stage.dataset.character !== 'rady') return;
    event.stopPropagation();
    startPlay(true);
  });

  radySprite.addEventListener('click', (event) => {
    if (stage.dataset.character === 'rady') event.stopPropagation();
  });

  radySprite.addEventListener('keydown', (event) => {
    if (stage.dataset.character !== 'rady') return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    startPlay(true);
  });

  window.addEventListener('stan:character-change', (event) => {
    if (event.detail?.character === 'rady') start();
    else stop();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (stage.dataset.character === 'rady') start();
  });

  window.addEventListener('resize', () => {
    const limit = movementLimit();
    currentX = Math.max(-limit, Math.min(limit, currentX));
    setPosition(currentX, 0);
  });

  reduceMotion.addEventListener?.('change', () => {
    radySprite.style.transition = reduceMotion.matches ? 'none' : 'transform 130ms steps(2, end)';
    start();
  });

  lifeTimer = window.setInterval(evaluateLife, LIFE_CHECK_MS);
  window.addEventListener('pagehide', () => {
    clearActivityTimers();
    window.clearInterval(lifeTimer);
  }, { once: true });

  window.RADY_PET = Object.freeze({
    getState: () => state,
    play: () => startPlay(true)
  });

  if (stage.dataset.character === 'rady') start();
}
